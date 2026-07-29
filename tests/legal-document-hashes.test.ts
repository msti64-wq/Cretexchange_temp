import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { ALL_LEGAL_DOCUMENT_VERSIONS, serializeLegalDocumentForContentHash } from "../shared/legalDocuments";

function digest(document: Parameters<typeof serializeLegalDocumentForContentHash>[0]) {
  return `sha256:${createHash("sha256").update(serializeLegalDocumentForContentHash(document), "utf8").digest("hex")}`;
}

test("every published legal document has a canonicalization-v1 SHA-256 content hash", () => {
  assert.equal(ALL_LEGAL_DOCUMENT_VERSIONS.length, 8);
  for (const document of ALL_LEGAL_DOCUMENT_VERSIONS) {
    assert.match(document.contentHash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(digest(document), document.contentHash, document.storageKey);
  }
});

test("legal content and governed metadata changes invalidate the published hash", () => {
  const document = ALL_LEGAL_DOCUMENT_VERSIONS[0]!;
  assert.notEqual(digest({ ...document, title: `${document.title} updated` }), document.contentHash);
  assert.notEqual(digest({ ...document, version: `${document.version}.next` }), document.contentHash);
  assert.notEqual(digest({ ...document, sections: [{ ...document.sections[0]!, body: ["different"] }, ...document.sections.slice(1)] }), document.contentHash);
});
