-- Syntagraphia schema for PostgreSQL. Applied idempotently by lib/db.js.

CREATE TABLE IF NOT EXISTS projects (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
    id         SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slug       TEXT NOT NULL,
    type       TEXT NOT NULL,
    suffix     TEXT,
    status     TEXT NOT NULL DEFAULT 'DRAFT',
    content    TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, slug, type, suffix)
);

CREATE TABLE IF NOT EXISTS relations (
    id            SERIAL PRIMARY KEY,
    source_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    UNIQUE(source_id, target_id, relation_type)
);

CREATE TABLE IF NOT EXISTS checklist_items (
    id          SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    text        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'DRAFT',
    commit_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_document
    ON checklist_items(document_id, position, id);

CREATE OR REPLACE VIEW v_relation_map AS
SELECT
    r.id AS relation_id,
    r.relation_type,
    s.project_id,
    s.id AS source_id, s.slug AS source_slug, s.type AS source_type, s.suffix AS source_suffix,
    t.id AS target_id, t.slug AS target_slug, t.type AS target_type, t.suffix AS target_suffix
FROM relations r
JOIN documents s ON s.id = r.source_id
JOIN documents t ON t.id = r.target_id;

CREATE OR REPLACE VIEW v_status_dashboard AS
SELECT id, project_id, slug, type, suffix, status, created_at, updated_at
FROM documents
ORDER BY
    CASE type WHEN 'constitution' THEN 0 WHEN 'feature' THEN 1 WHEN 'tech_spec' THEN 2 WHEN 'task' THEN 3 WHEN 'verification' THEN 4 END,
    slug, suffix;
