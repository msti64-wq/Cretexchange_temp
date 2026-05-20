import { randomUUID } from "crypto";
import { Readable } from "node:stream";
import { Response } from "express";
import { Storage, type File as GcsFile } from "@google-cloud/storage";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const isReplitDeployment = !!process.env.REPLIT_DEPLOYMENT || !!process.env.REPLIT;
const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";
const S3_ACL_POLICY_METADATA_KEY = "custom-acl-policy";
type StorageProvider = "s3" | "replit" | "gcs";

type S3Config = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export interface ObjectStorageMetadata {
  size?: string | number;
  contentType?: string;
  metadata?: Record<string, string>;
  lastModified?: Date;
  etag?: string;
}

export interface ObjectStorageFileLike {
  name: string;
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[ObjectStorageMetadata]>;
  setMetadata(input: { metadata: Record<string, string> }): Promise<void>;
  createReadStream(): Readable;
  save(
    buffer: Buffer,
    options?: {
      metadata?: {
        contentType?: string;
        metadata?: Record<string, string>;
      };
    }
  ): Promise<void>;
  getSignedUrl(options: {
    version?: "v4";
    action: "read" | "write" | "delete" | "head";
    expires: number | Date;
    contentType?: string;
  }): Promise<[string]>;
}

export interface ObjectStorageBucketLike {
  file(name: string): ObjectStorageFileLike;
}

export interface ObjectStorageClientLike {
  bucket(name: string): ObjectStorageBucketLike;
}

function getS3EnvState() {
  const required = [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
  ] as const;

  const present = required.filter((name) => process.env[name]?.trim());
  const missing = required.filter((name) => !process.env[name]?.trim());
  const hasAny = present.length > 0;
  const isComplete = missing.length === 0;

  return {
    hasAny,
    isComplete,
    missing,
  };
}

function getConfiguredBucketName(provider: StorageProvider = getProviderName()): string {
  if (provider === "s3") {
    const s3Bucket = process.env.S3_BUCKET?.trim();
    if (!s3Bucket) {
      throw new Error("Missing object storage env vars: S3_BUCKET");
    }
    return s3Bucket;
  }

  const defaultBucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim();
  const gcsBucket = process.env.GOOGLE_CLOUD_BUCKET_NAME?.trim();

  if (defaultBucket) {
    return defaultBucket;
  }

  if (gcsBucket) {
    return gcsBucket;
  }

  throw new Error("Missing object storage env vars: DEFAULT_OBJECT_STORAGE_BUCKET_ID, GOOGLE_CLOUD_BUCKET_NAME");
}

export function getStorageSelection(): {
  provider: StorageProvider;
  bucket: string;
  s3EndpointPresent: boolean;
} {
  return {
    provider: getProviderName(),
    bucket: getConfiguredBucketName(),
    s3EndpointPresent: !!process.env.S3_ENDPOINT?.trim(),
  };
}

function getS3UploadConfig(): S3Config {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const region = process.env.S3_REGION?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.S3_BUCKET?.trim();

  const missing = [
    !endpoint ? "S3_ENDPOINT" : null,
    !region ? "S3_REGION" : null,
    !accessKeyId ? "S3_ACCESS_KEY_ID" : null,
    !secretAccessKey ? "S3_SECRET_ACCESS_KEY" : null,
    !bucket ? "S3_BUCKET" : null,
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    throw new Error(`Missing object storage env vars: ${missing.join(", ")}`);
  }

  return {
    endpoint: endpoint as string,
    region: region as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    bucket: bucket as string,
  };
}

export function getUploadStorageSelection(): {
  provider: "s3";
  bucket: string;
  s3EndpointPresent: boolean;
} {
  const config = getS3UploadConfig();
  return {
    provider: "s3",
    bucket: config.bucket,
    s3EndpointPresent: !!config.endpoint,
  };
}

export function getPhotoUploadProviderSelection(): {
  provider: "s3" | "replit";
  bucket: string;
  s3EndpointPresent: boolean;
  missing?: string[];
} {
  const required = [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
  ] as const;

  const missing = required.filter((name) => !process.env[name]?.trim());
  const s3EndpointPresent = !!process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim() || "";

  if (missing.length === 0) {
    return {
      provider: "s3",
      bucket,
      s3EndpointPresent,
    };
  }

  return {
    provider: "replit",
    bucket,
    s3EndpointPresent,
    missing,
  };
}

export function getPhotoReadProviderSelection(): {
  provider: "s3" | "replit";
  bucket: string;
  s3EndpointPresent: boolean;
  missing?: string[];
} {
  const required = [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
  ] as const;

  const missing = required.filter((name) => !process.env[name]?.trim());
  const s3EndpointPresent = !!process.env.S3_ENDPOINT?.trim();
  const bucket =
    process.env.S3_BUCKET?.trim() ||
    process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim() ||
    process.env.GOOGLE_CLOUD_BUCKET_NAME?.trim() ||
    "";

  if (missing.length === 0) {
    return {
      provider: "s3",
      bucket,
      s3EndpointPresent,
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`Missing object storage env vars: ${missing.join(", ")}`);
  }

  return {
    provider: "replit",
    bucket,
    s3EndpointPresent,
    missing,
  };
}

function normalizeMetadataForStorage(
  metadata: Record<string, string> = {}
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (key === ACL_POLICY_METADATA_KEY) {
      normalized[S3_ACL_POLICY_METADATA_KEY] = value;
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}

function normalizeMetadataFromStorage(
  metadata: Record<string, string> = {}
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (key === S3_ACL_POLICY_METADATA_KEY) {
      normalized[ACL_POLICY_METADATA_KEY] = value;
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    candidate.name === "NotFound" ||
    candidate.Code === "NotFound" ||
    candidate.code === "NotFound" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function createStorageClient(): Storage {
  if (isReplitDeployment) {
    return new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
        type: "external_account",
        credential_source: {
          url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
          format: {
            type: "json",
            subject_token_field_name: "access_token",
          },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    });
  }

  const credentialsEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || "";

  if (credentialsEnv && credentialsEnv.startsWith("{")) {
    try {
      const parsed = JSON.parse(credentialsEnv);
      return new Storage({
        projectId: parsed.project_id || projectId,
        credentials: parsed,
      });
    } catch (error) {
      console.warn(
        "Failed to parse GOOGLE_APPLICATION_CREDENTIALS as JSON; falling back to default Google auth."
      );
    }
  }

  return new Storage({
    projectId,
  });
}

function getProviderName(): StorageProvider {
  const s3State = getS3EnvState();
  if (s3State.hasAny) {
    if (!s3State.isComplete) {
      throw new Error(`Missing object storage env vars: ${s3State.missing.join(", ")}`);
    }
    return "s3";
  }

  if (process.env.NODE_ENV === "production") {
    const hasGoogleConfig =
      !!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
      !!process.env.GOOGLE_CLOUD_PROJECT_ID?.trim();

    if (hasGoogleConfig) {
      return "gcs";
    }

    throw new Error(
      "Missing object storage env vars: S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET"
    );
  }

  if (isReplitDeployment) {
    return "replit";
  }

  return "gcs";
}

let loggedProviderName: StorageProvider | null = null;

function logProviderName(provider: StorageProvider) {
  if (loggedProviderName !== provider) {
    console.info(`Object storage provider selected: ${provider}`);
    console.info(`S3 endpoint present: ${!!process.env.S3_ENDPOINT?.trim()}`);
    loggedProviderName = provider;
  }
}

let s3ValidationPromise: Promise<void> | null = null;
let s3ValidationKey: string | null = null;

function mapS3Error(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const candidate = error as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  const status = candidate?.$metadata?.httpStatusCode;
  const code = candidate?.Code || candidate?.code || candidate?.name;

  if (code === "NoSuchBucket" || status === 404) {
    return new Error("Object storage bucket not found. Verify S3_BUCKET.");
  }

  if (code === "AccessDenied" || status === 403) {
    return new Error(
      "Invalid S3 credentials or bucket access denied. Verify S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
    );
  }

  if (/cross-origin|cors|origin|preflight/i.test(message)) {
    return new Error(
      "R2 CORS error detected while preparing object storage. Allow PUT and GET from this app origin in the bucket CORS rules."
    );
  }

  return new Error(message);
}

async function ensureS3BucketReady(): Promise<void> {
  const config = getS3Config();
  const cacheKey = `${config.endpoint}|${config.region}|${config.bucket}`;

  if (s3ValidationPromise && s3ValidationKey === cacheKey) {
    return s3ValidationPromise;
  }

  const promise = (async () => {
    const client = getS3Client();
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      console.log("S3 bucket validation succeeded:", {
        bucket: config.bucket,
        endpointPresent: !!config.endpoint,
      });
    } catch (error) {
      throw mapS3Error(error);
    }
  })();

  s3ValidationPromise = promise;
  s3ValidationKey = cacheKey;

  try {
    await promise;
  } catch (error) {
    s3ValidationPromise = null;
    s3ValidationKey = null;
    throw error;
  }
}

function createS3Client(): S3Client {
  const { endpoint, region, accessKeyId, secretAccessKey } = getS3Config();

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function getS3Config(): S3Config {
  return getS3UploadConfig();
}

function resolveBackend(): StorageProvider {
  return getProviderName();
}

class GcsStorageFile implements ObjectStorageFileLike {
  constructor(private readonly file: GcsFile) {}

  get name(): string {
    return this.file.name;
  }

  async exists(): Promise<[boolean]> {
    return this.file.exists();
  }

  async getMetadata(): Promise<[ObjectStorageMetadata]> {
    const [metadata] = await this.file.getMetadata();
    return [
      {
        ...metadata,
        metadata: normalizeMetadataFromStorage(
          (metadata.metadata as Record<string, string> | undefined) || {}
        ),
      },
    ];
  }

  async setMetadata(input: { metadata: Record<string, string> }): Promise<void> {
    await this.file.setMetadata({
      metadata: normalizeMetadataForStorage(input.metadata),
    });
  }

  createReadStream(): Readable {
    return this.file.createReadStream();
  }

  async save(
    buffer: Buffer,
    options?: {
      metadata?: {
        contentType?: string;
        metadata?: Record<string, string>;
      };
    }
  ): Promise<void> {
    await this.file.save(buffer, {
      metadata: {
        contentType: options?.metadata?.contentType,
        metadata: normalizeMetadataForStorage(options?.metadata?.metadata || {}),
      },
    });
  }

  async getSignedUrl(options: {
    version?: "v4";
    action: "read" | "write" | "delete" | "head";
    expires: number | Date;
    contentType?: string;
  }): Promise<[string]> {
    const gcsAction =
      options.action === "write"
        ? "write"
        : options.action === "delete"
          ? "delete"
          : "read";

    const [signedUrl] = await this.file.getSignedUrl({
      version: options.version || "v4",
      action: gcsAction,
      expires: options.expires,
      ...(options.contentType && options.action === "write"
        ? { contentType: options.contentType }
        : {}),
    });

    return [signedUrl];
  }
}

class GcsStorageBucket implements ObjectStorageBucketLike {
  constructor(
    private readonly storage: Storage,
    private readonly bucketName: string
  ) {}

  file(name: string): ObjectStorageFileLike {
    return new GcsStorageFile(this.storage.bucket(this.bucketName).file(name));
  }
}

class S3StorageFile implements ObjectStorageFileLike {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
    public readonly name: string
  ) {}

  async exists(): Promise<[boolean]> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: this.name,
        })
      );
      return [true];
    } catch (error) {
      if (isNotFoundError(error)) {
        return [false];
      }

      throw error;
    }
  }

  async getMetadata(): Promise<[ObjectStorageMetadata]> {
    const response = (await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: this.name,
      })
    )) as HeadObjectCommandOutput;

    return [
      {
        size: response.ContentLength,
        contentType: response.ContentType || undefined,
        metadata: normalizeMetadataFromStorage(response.Metadata || {}),
        lastModified: response.LastModified,
        etag: response.ETag,
      },
    ];
  }

  async setMetadata(input: { metadata: Record<string, string> }): Promise<void> {
    const head = (await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: this.name,
      })
    )) as HeadObjectCommandOutput;

    const contentType = head.ContentType || input.metadata.contentType || undefined;
    const metadata = normalizeMetadataForStorage({
      ...(head.Metadata || {}),
      ...input.metadata,
    });

    delete metadata.contentType;

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        Key: this.name,
        CopySource: encodeURIComponent(`${this.bucketName}/${this.name}`),
        MetadataDirective: "REPLACE",
        Metadata: metadata,
        ContentType: contentType,
      })
    );
  }

  createReadStream(): Readable {
    return Readable.from(
      (async function* (client: S3Client, bucketName: string, key: string) {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
          })
        );

        const body = response.Body as any;

        if (!body) {
          throw new Error("Empty response body when reading object");
        }

        if (typeof body.pipe === "function") {
          for await (const chunk of body as AsyncIterable<unknown>) {
            yield chunk;
          }
          return;
        }

        if (typeof body.getReader === "function") {
          const reader = body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              yield value;
            }
          } finally {
            reader.releaseLock();
          }
          return;
        }

        throw new Error("Unsupported S3 object body type");
      })(this.client, this.bucketName, this.name)
    );
  }

  async save(
    buffer: Buffer,
    options?: {
      metadata?: {
        contentType?: string;
        metadata?: Record<string, string>;
      };
    }
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.name,
        Body: buffer,
        ContentType: options?.metadata?.contentType || "application/octet-stream",
        Metadata: normalizeMetadataForStorage(
          options?.metadata?.metadata || {}
        ),
      })
    );
  }

  async getSignedUrl(options: {
    version?: "v4";
    action: "read" | "write" | "delete" | "head";
    expires: number | Date;
    contentType?: string;
  }): Promise<[string]> {
    const expiresIn =
      typeof options.expires === "number"
        ? Math.max(1, Math.floor(options.expires / 1000))
        : Math.max(
            1,
            Math.floor((options.expires.getTime() - Date.now()) / 1000)
          );

    if (options.action === "read" || options.action === "head") {
      const signedUrl = await getS3SignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: this.name,
        }),
        { expiresIn }
      );
      return [signedUrl];
    }

    if (options.action === "delete") {
      const signedUrl = await getS3SignedUrl(
        this.client,
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: this.name,
        }),
        { expiresIn }
      );
      return [signedUrl];
    }

    const signedUrl = await getS3SignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.name,
        ContentType: options.contentType,
      }),
      { expiresIn }
    );
    return [signedUrl];
  }
}

class S3StorageBucket implements ObjectStorageBucketLike {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string
  ) {}

  file(name: string): ObjectStorageFileLike {
    return new S3StorageFile(this.client, this.bucketName, name);
  }
}

class UnifiedObjectStorageClient implements ObjectStorageClientLike {
  bucket(name: string): ObjectStorageBucketLike {
    if (!name?.trim()) {
      throw new Error("Object storage bucket name is required");
    }

    const provider = resolveBackend();
    logProviderName(provider);

    if (provider === "s3") {
      return new S3StorageBucket(getS3Client(), name);
    }

    return new GcsStorageBucket(getGcsClient(), name);
  }
}

let cachedS3Client: S3Client | null = null;
let cachedGcsClient: Storage | null = null;

function getS3Client(): S3Client {
  if (!cachedS3Client) {
    cachedS3Client = createS3Client();
  }
  return cachedS3Client;
}

function getGcsClient(): Storage {
  if (!cachedGcsClient) {
    cachedGcsClient = createStorageClient();
  }
  return cachedGcsClient;
}

// The object storage client is used to interact with the object storage service.
export const objectStorageClient: ObjectStorageClientLike =
  new UnifiedObjectStorageClient();

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "Missing object storage env vars: PUBLIC_OBJECT_SEARCH_PATHS"
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "Missing object storage env vars: PRIVATE_OBJECT_DIR"
      );
    }
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<ObjectStorageFileLike | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Downloads an object to the response.
  async downloadObject(
    file: ObjectStorageFileLike,
    res: Response,
    cacheTtlSec: number = 3600
  ) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      // Get the ACL policy for the object.
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<ObjectStorageFileLike> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("http://") && !rawPath.startsWith("https://")) {
      return rawPath;
    }

    let url: URL;
    try {
      url = new URL(rawPath);
    } catch {
      return rawPath;
    }

    const configuredS3Endpoint = process.env.S3_ENDPOINT?.trim();
    const isRecognizedStorageUrl =
      url.hostname === "storage.googleapis.com" ||
      url.hostname.endsWith("amazonaws.com") ||
      url.hostname.endsWith("cloudflarestorage.com") ||
      (!!configuredS3Endpoint && new URL(configuredS3Endpoint).hostname === url.hostname) ||
      url.searchParams.has("X-Amz-Signature") ||
      url.searchParams.has("X-Goog-Signature");

    if (!isRecognizedStorageUrl) {
      return rawPath;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      return rawPath;
    }

    const bucketName = pathParts[0];
    const objectName = pathParts.slice(1).join("/");

    const privateObjectDir = this.getPrivateObjectDir().replace(/^\/+/, "");
    const privateDirRelative = privateObjectDir.split("/").slice(1).join("/");

    if (!privateDirRelative) {
      return `/${bucketName}/${objectName}`;
    }

    if (!objectName.startsWith(`${privateDirRelative}/`) && objectName !== privateDirRelative) {
      return `/${bucketName}/${objectName}`;
    }

    const entityId = objectName
      .replace(/^\/+/, "")
      .slice(privateDirRelative.length)
      .replace(/^\/+/, "");

    return `/objects/${entityId}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    userRole,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    userRole?: string;
    objectFile: ObjectStorageFileLike;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      userRole,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

export function getDefaultObjectStorageBucketName(): string {
  return getConfiguredBucketName(resolveBackend());
}

export async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
  contentType,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
  contentType?: string;
}): Promise<string> {
  const provider = resolveBackend();
  logProviderName(provider);
  const file = objectStorageClient.bucket(bucketName).file(objectName);

  if (provider === "s3") {
    await ensureS3BucketReady();
  }

  if (provider === "replit") {
    const request = {
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    };
    const response = await fetch(
      `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to sign object URL: ${response.status}`);
    }
    const { signed_url: signedURL } = await response.json();
    return signedURL;
  }

  try {
    const [signedURL] = await file.getSignedUrl({
      version: "v4",
      action:
        method === "GET" || method === "HEAD"
          ? "read"
          : method === "PUT"
            ? "write"
            : "delete",
      expires: new Date(Date.now() + ttlSec * 1000),
      contentType,
    });
    console.log("Signed URL generation succeeded:", {
      provider,
      bucket: bucketName,
      method,
      objectName,
      hasContentType: !!contentType,
    });
    return signedURL;
  } catch (error) {
    if (provider === "s3") {
      throw mapS3Error(error);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function signUploadObjectURL({
  objectName,
  method,
  ttlSec,
  contentType,
}: {
  objectName: string;
  method: "PUT";
  ttlSec: number;
  contentType?: string;
}): Promise<string> {
  const config = getS3UploadConfig();
  console.log("Storage upload provider: s3");
  await ensureS3BucketReady();
  const signedUrl = await getS3SignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectName,
      ContentType: contentType,
    }),
    { expiresIn: Math.max(1, Math.floor(ttlSec)) }
  );
  console.log("Signed URL generation succeeded:", {
    provider: "s3",
    bucket: config.bucket,
    method,
    objectName,
    hasContentType: !!contentType,
  });
  return signedUrl;
}
