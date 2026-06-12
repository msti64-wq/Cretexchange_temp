CREATE TABLE IF NOT EXISTS terms_versions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  terms_type varchar NOT NULL,
  language varchar NOT NULL DEFAULT 'en',
  storage_key varchar NOT NULL,
  version varchar NOT NULL,
  title varchar NOT NULL,
  content_hash varchar NOT NULL,
  effective_at timestamp NOT NULL,
  requires_reacceptance boolean NOT NULL DEFAULT true,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_terms_versions_storage_key_version
  ON terms_versions (storage_key, version);

CREATE INDEX IF NOT EXISTS idx_terms_versions_type_language_current
  ON terms_versions (terms_type, language, is_current);

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar NOT NULL,
  terms_type varchar NOT NULL,
  language varchar NOT NULL DEFAULT 'en',
  storage_key varchar NOT NULL,
  version varchar NOT NULL,
  content_hash varchar NOT NULL,
  accepted_at timestamp NOT NULL,
  ip_address varchar,
  user_agent text,
  created_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_terms_acceptance_user_doc_version
  ON terms_acceptances (user_id, terms_type, language, version, content_hash);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user
  ON terms_acceptances (user_id);
