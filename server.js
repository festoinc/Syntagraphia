const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const ROOT_DIR = __dirname;
const DB_PATH = path.join(ROOT_DIR, 'project-tracker.db');

app.use(cors());
app.use(express.json());

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── GET /api/documents ──────────────────────────────────────────
app.get('/api/documents', (req, res) => {
  const documents = db.prepare(`
    SELECT id, slug, type, suffix, status, file_path, created_at, updated_at
    FROM file_status
    ORDER BY
      CASE type WHEN 'feature' THEN 1 WHEN 'tech_spec' THEN 2 WHEN 'task' THEN 3 WHEN 'verification' THEN 4 END,
      slug, suffix
  `).all();

  const relations = db.prepare(
    'SELECT source_id, target_id, relation_type FROM relations'
  ).all();

  res.json({ documents, relations });
});

// ── GET /api/documents/:id ──────────────────────────────────────
app.get('/api/documents/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM file_status WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(ROOT_DIR, doc.file_path);
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';

  const outgoing = db.prepare(
    'SELECT target_id, relation_type FROM relations WHERE source_id = ?'
  ).all(doc.id);

  const incoming = db.prepare(
    'SELECT source_id, relation_type FROM relations WHERE target_id = ?'
  ).all(doc.id);

  res.json({ ...doc, content, outgoing, incoming });
});

// ── PUT /api/documents/:id/content ─────────────────────────────
app.put('/api/documents/:id/content', (req, res) => {
  const doc = db.prepare('SELECT * FROM file_status WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });

  const { content } = req.body;
  const filePath = path.join(ROOT_DIR, doc.file_path);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');

  db.prepare("UPDATE file_status SET updated_at = datetime('now') WHERE id = ?").run(doc.id);
  res.json({ success: true });
});

// ── PUT /api/documents/:id/status ──────────────────────────────
app.put('/api/documents/:id/status', (req, res) => {
  const VALID = ['DRAFT', 'IN_PROGRESS', 'REVIEW', 'DONE'];
  const { status } = req.body;
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const result = db.prepare(
    "UPDATE file_status SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, status });
});

// ── POST /api/documents ────────────────────────────────────────
app.post('/api/documents', (req, res) => {
  const { slug, type, suffix, status } = req.body;
  const VALID_TYPES = ['feature', 'tech_spec', 'task', 'verification'];
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });

  const dirMap = {
    feature: 'features',
    tech_spec: 'tech-spec',
    task: 'tasks',
    verification: 'verifications',
  };

  const dir = dirMap[type];
  const fileName = suffix ? `${slug}-${suffix}.md` : `${slug}.md`;
  const filePath = `${dir}/${fileName}`;
  const fullFilePath = path.join(ROOT_DIR, filePath);

  const existing = db.prepare('SELECT id FROM file_status WHERE file_path = ?').get(filePath);
  if (existing) return res.status(409).json({ error: 'Document already exists', id: existing.id });

  const templates = {
    feature: `# Feature — ${slug}\n\n## Overview\n<!-- High-level description -->\n\n## User Stories\n<!-- List key user stories -->\n\n## Out of Scope\n<!-- What is explicitly excluded -->\n`,
    tech_spec: `# Tech Spec — ${slug}\n\n## Architecture\n<!-- System design -->\n\n## Decisions\n<!-- Key decisions and rationale -->\n\n## Dependencies\n\n## Risks\n`,
    task: `# Task — ${slug}${suffix ? ` (${suffix})` : ''}\n\n## Summary\n<!-- One-line description -->\n\n## Acceptance Criteria\n- [ ]\n`,
    verification: `# Verification — ${slug}\n\n## Feature Success Criteria\n- [ ]\n\n## Spec Success Criteria\n- [ ]\n`,
  };

  fs.mkdirSync(path.dirname(fullFilePath), { recursive: true });
  fs.writeFileSync(fullFilePath, templates[type] || '', 'utf-8');

  const result = db.prepare(
    'INSERT INTO file_status (slug, type, suffix, status, file_path) VALUES (?, ?, ?, ?, ?)'
  ).run(slug, type, suffix || null, status || 'DRAFT', filePath);

  res.json({
    id: Number(result.lastInsertRowid),
    slug,
    type,
    suffix: suffix || null,
    status: status || 'DRAFT',
    file_path: filePath,
  });
});

// ── POST /api/relations ────────────────────────────────────────
app.post('/api/relations', (req, res) => {
  const { source_id, target_id, relation_type } = req.body;
  try {
    db.prepare(
      'INSERT INTO relations (source_id, target_id, relation_type) VALUES (?, ?, ?)'
    ).run(source_id, target_id, relation_type);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Relation already exists' });
    }
    throw e;
  }
});

// ── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ API server running on http://localhost:${PORT}`);
});
