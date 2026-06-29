-- Project Tracker Schema
-- SQLite database for tracking documentation files and their relationships

CREATE TABLE file_status (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    slug      TEXT NOT NULL,          -- e.g. 'user-authentication'
    type      TEXT NOT NULL,          -- 'feature' | 'tech_spec' | 'task' | 'verification'
    suffix    TEXT,                   -- optional, e.g. 'backend', 'frontend' (for tasks)
    status    TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT | IN_PROGRESS | REVIEW | DONE
    file_path TEXT NOT NULL UNIQUE,   -- relative path to the .md file
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE relations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       INTEGER NOT NULL REFERENCES file_status(id) ON DELETE CASCADE,
    target_id       INTEGER NOT NULL REFERENCES file_status(id) ON DELETE CASCADE,
    relation_type   TEXT NOT NULL,    -- 'has_spec' | 'has_task' | 'verifies' | 'implements'
    UNIQUE(source_id, target_id, relation_type)
);

-- Seed existing files
INSERT INTO file_status (slug, type, suffix, status, file_path) VALUES
    ('user-authentication', 'feature',      NULL,       'DRAFT', 'features/user-authentication.md'),
    ('user-authentication', 'tech_spec',     NULL,       'DRAFT', 'tech-spec/user-authentication.md'),
    ('user-authentication', 'task',          'backend',  'DRAFT', 'tasks/user-authentication-backend.md'),
    ('user-authentication', 'task',          'frontend', 'DRAFT', 'tasks/user-authentication-frontend.md'),
    ('user-authentication', 'verification',  NULL,       'DRAFT', 'verifications/user-authentication.md');

-- Seed relations (feature → central node)
INSERT INTO relations (source_id, target_id, relation_type) VALUES
    (1, 2, 'has_spec'),
    (1, 3, 'has_task'),
    (1, 4, 'has_task'),
    (1, 5, 'verifies');
