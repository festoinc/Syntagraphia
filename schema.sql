-- Syntagraphia schema — single global DB (one per machine), documents scoped by project.
-- DDL only. No seed rows. No file_path column. Applied idempotently by lib/db.js.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slug       TEXT NOT NULL,
    type       TEXT NOT NULL,           -- 'constitution' | 'feature' | 'tech_spec' | 'task' | 'verification'
    suffix     TEXT,                    -- optional, e.g. 'backend'/'frontend' (mainly for tasks)
    status     TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT | IN_PROGRESS | REVIEW | DONE
    content    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, slug, type, suffix)
);

CREATE TABLE IF NOT EXISTS relations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,        -- 'has_spec' | 'has_task' | 'verifies' | 'implements'
    UNIQUE(source_id, target_id, relation_type)
);

-- Structured checklist items attached to feature/spec/task/verification documents.
-- The item's label is derived from its parent document type, while status and
-- optional note or commit reference is tracked independently from the document itself.
CREATE TABLE IF NOT EXISTS checklist_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    text        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT | IN_PROGRESS | REVIEW | DONE
    commit_url  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_document
    ON checklist_items(document_id, position, id);

-- Helpful views (recreated idempotently). Both are id-based but now carry project_id.
CREATE VIEW IF NOT EXISTS v_relation_map AS
SELECT
    r.id                                       AS relation_id,
    r.relation_type,
    s.project_id,
    s.id AS source_id, s.slug AS source_slug, s.type AS source_type, s.suffix AS source_suffix,
    t.id AS target_id, t.slug AS target_slug, t.type AS target_type, t.suffix AS target_suffix
FROM relations r
JOIN documents s ON s.id = r.source_id
JOIN documents t ON t.id = r.target_id;

CREATE VIEW IF NOT EXISTS v_status_dashboard AS
SELECT id, project_id, slug, type, suffix, status, created_at, updated_at
FROM documents
ORDER BY
    CASE type WHEN 'constitution' THEN 0 WHEN 'feature' THEN 1 WHEN 'tech_spec' THEN 2 WHEN 'task' THEN 3 WHEN 'verification' THEN 4 END,
    slug, suffix;
