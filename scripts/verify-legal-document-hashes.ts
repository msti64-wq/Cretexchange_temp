import { createHash } from "node:crypto";
import { ALL_LEGAL_DOCUMENT_VERSIONS, serializeLegalDocumentForContentHash } from "../shared/legalDocuments";

let invalid = false;

for (const document of ALL_LEGAL_DOCUMENT_VERSIONS) {
  const actual = `sha256:${createHash("sha256").update(serializeLegalDocumentForContentHash(document), "utf8").digest("hex")}`;
  if (actual !== document.contentHash) {
    invalid = true;
    console.error(`LEGAL_DOCUMENT_HASH_MISMATCH ${document.storageKey}`);
  } else {
    console.log(`LEGAL_DOCUMENT_HASH_VERIFIED ${document.storageKey} ${actual}`);
  }
}

if (invalid) process.exitCode = 1;
