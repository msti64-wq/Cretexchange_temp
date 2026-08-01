import { GetBucketCorsCommand, S3Client, type CORSRule } from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";

export const REQUIRED_PHOTO_UPLOAD_METHODS = ["PUT"] as const;

export function findPhotoUploadCorsIssues(rules: CORSRule[], requiredOrigin: string): string[] {
  const normalizedOrigin = requiredOrigin.trim().replace(/\/$/, "");
  if (!normalizedOrigin) return ["A required application origin was not provided."];

  const matchingRules = rules.filter((rule) => (rule.AllowedOrigins || []).includes(normalizedOrigin));
  if (matchingRules.length === 0) return [`Object storage CORS does not allow ${normalizedOrigin}.`];

  const issues: string[] = [];
  for (const method of REQUIRED_PHOTO_UPLOAD_METHODS) {
    if (!matchingRules.some((rule) => (rule.AllowedMethods || []).includes(method))) {
      issues.push(`Object storage CORS does not allow ${method} from ${normalizedOrigin}.`);
    }
  }
  if (!matchingRules.some((rule) => (rule.AllowedHeaders || []).includes("*") || (rule.AllowedHeaders || []).some((header) => header.toLowerCase() === "content-type"))) {
    issues.push(`Object storage CORS does not allow the Content-Type request header from ${normalizedOrigin}.`);
  }
  return issues;
}

async function main() {
  const requiredOrigin = (process.env.APP_PUBLIC_ORIGIN || process.argv[2] || "").trim().replace(/\/$/, "");
  const requiredVariables = ["S3_ENDPOINT", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"] as const;
  const missing = requiredVariables.filter((name) => !process.env[name]?.trim());
  if (!requiredOrigin) throw new Error("Set APP_PUBLIC_ORIGIN or pass the expected application origin as the first argument.");
  if (missing.length > 0) throw new Error(`Missing object storage configuration: ${missing.join(", ")}`);

  const client = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
    },
  });
  const result = await client.send(new GetBucketCorsCommand({ Bucket: process.env.S3_BUCKET }));
  const issues = findPhotoUploadCorsIssues(result.CORSRules || [], requiredOrigin);
  if (issues.length > 0) throw new Error(issues.join(" "));

  console.log(JSON.stringify({
    status: "pass",
    requiredOrigin,
    requiredMethods: REQUIRED_PHOTO_UPLOAD_METHODS,
    credentialsExposed: false,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
