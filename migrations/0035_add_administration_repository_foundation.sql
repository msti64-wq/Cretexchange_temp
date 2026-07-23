-- CTX-STD-002 / CTX-ARCH-009 / CTX-ARCH-010: derived Administration Repository foundation.
-- Git remains authoritative for document bodies and history. These tables retain
-- only provenance, derived metadata, manifests, synchronization outcomes, and audit evidence.

CREATE TABLE IF NOT EXISTS governed_documents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  document_identifier varchar NOT NULL UNIQUE,
  repository_path text NOT NULL UNIQUE,
  title text NOT NULL,
  document_type varchar NOT NULL,
  scope varchar,
  owner_reference varchar,
  development_state varchar NOT NULL DEFAULT 'draft',
  approval_state varchar NOT NULL DEFAULT 'pending',
  publication_state varchar NOT NULL DEFAULT 'repository_only',
  effectivity_state varchar NOT NULL DEFAULT 'not_effective',
  retention_state varchar NOT NULL DEFAULT 'active_record',
  implementation_authorization_state varchar NOT NULL DEFAULT 'not_applicable',
  production_adoption_state varchar NOT NULL DEFAULT 'not_applicable',
  validation_state varchar NOT NULL DEFAULT 'valid',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS document_source_versions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), document_id varchar NOT NULL REFERENCES governed_documents(id) ON DELETE CASCADE,
  immutable_commit_sha varchar NOT NULL, checksum_sha256 varchar NOT NULL, source_path text NOT NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb, synchronized_at timestamp DEFAULT now(),
  CONSTRAINT uniq_document_source_version_identity UNIQUE(document_id, immutable_commit_sha, checksum_sha256)
);
CREATE TABLE IF NOT EXISTS document_metadata (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), document_id varchar NOT NULL REFERENCES governed_documents(id) ON DELETE CASCADE,
  metadata_key varchar NOT NULL, metadata_value text NOT NULL, provenance varchar NOT NULL,
  validation_state varchar NOT NULL DEFAULT 'valid', created_at timestamp DEFAULT now(),
  CONSTRAINT uniq_document_metadata_key UNIQUE(document_id, metadata_key)
);
CREATE TABLE IF NOT EXISTS document_classifications (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), document_id varchar NOT NULL UNIQUE REFERENCES governed_documents(id) ON DELETE CASCADE,
  classification varchar NOT NULL DEFAULT 'internal', assigned_by varchar REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamp DEFAULT now(), provenance varchar NOT NULL DEFAULT 'derived'
);
CREATE TABLE IF NOT EXISTS publication_sets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), publication_set_identifier varchar NOT NULL UNIQUE,
  immutable_commit_sha varchar NOT NULL, target_audience varchar NOT NULL, administrative_scope varchar NOT NULL,
  validation_outcome varchar NOT NULL, initiated_by varchar REFERENCES users(id) ON DELETE SET NULL,
  previous_publication_set_id varchar, generated_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS publication_manifest_entries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), publication_set_id varchar NOT NULL REFERENCES publication_sets(id) ON DELETE CASCADE,
  document_id varchar NOT NULL REFERENCES governed_documents(id) ON DELETE RESTRICT,
  source_version_id varchar NOT NULL REFERENCES document_source_versions(id) ON DELETE RESTRICT,
  checksum_sha256 varchar NOT NULL, position integer NOT NULL,
  CONSTRAINT uniq_publication_manifest_document UNIQUE(publication_set_id, document_id),
  CONSTRAINT uniq_publication_manifest_position UNIQUE(publication_set_id, position)
);
CREATE TABLE IF NOT EXISTS document_relationships (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), source_document_id varchar NOT NULL REFERENCES governed_documents(id) ON DELETE CASCADE,
  target_document_identifier varchar NOT NULL, relationship_type varchar NOT NULL, provenance varchar NOT NULL,
  validation_state varchar NOT NULL DEFAULT 'valid', created_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS synchronization_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), immutable_commit_sha varchar NOT NULL,
  initiated_by varchar REFERENCES users(id) ON DELETE SET NULL, status varchar NOT NULL,
  started_at timestamp DEFAULT now(), completed_at timestamp, summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS synchronization_results (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), synchronization_run_id varchar NOT NULL REFERENCES synchronization_runs(id) ON DELETE CASCADE,
  document_identifier varchar, repository_path text NOT NULL, status varchar NOT NULL,
  error_code varchar, error_detail text, created_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS governance_audit_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), event_type varchar NOT NULL,
  document_id varchar REFERENCES governed_documents(id) ON DELETE SET NULL,
  publication_set_id varchar REFERENCES publication_sets(id) ON DELETE SET NULL,
  synchronization_run_id varchar REFERENCES synchronization_runs(id) ON DELETE SET NULL,
  actor_id varchar REFERENCES users(id) ON DELETE SET NULL,
  event_metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_governed_documents_type_state ON governed_documents(document_type, validation_state);
CREATE INDEX IF NOT EXISTS idx_governed_documents_path ON governed_documents(repository_path);
CREATE INDEX IF NOT EXISTS idx_document_source_versions_commit ON document_source_versions(immutable_commit_sha);
CREATE INDEX IF NOT EXISTS idx_document_relationships_source ON document_relationships(source_document_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_document_relationship_identity ON document_relationships(source_document_id, target_document_identifier, relationship_type);
CREATE INDEX IF NOT EXISTS idx_synchronization_results_run ON synchronization_results(synchronization_run_id);
CREATE INDEX IF NOT EXISTS idx_governance_audit_events_created ON governance_audit_events(created_at);
