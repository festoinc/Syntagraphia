'use strict';

const fs = require('fs');
const path = require('path');

const DOC_TYPES = ['feature', 'tech_spec', 'task', 'verification'];
const STATUSES = ['DRAFT', 'IN_PROGRESS', 'REVIEW', 'DONE'];
const RELATION_TYPES = ['has_spec', 'has_task', 'verifies', 'implements'];

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'doc-content');

function templateContent(type, slug, suffix) {
  const file = path.join(TEMPLATE_DIR, `${type}.md`);
  let tpl = fs.readFileSync(file, 'utf-8');
  const suffixLabel = suffix ? ` (${suffix})` : '';
  return tpl
    .replaceAll('{{slug}}', slug)
    .replaceAll('{{suffix_label}}', suffixLabel)
    .replaceAll('{{suffix}}', suffix || '');
}

function normalizeSuffix(suffix) {
  if (suffix === undefined || suffix === null || suffix === '') return null;
  return String(suffix);
}

function touch(db, id) {
  db.prepare("UPDATE documents SET updated_at = datetime('now') WHERE id = ?").run(id);
}

// ── list ──────────────────────────────────────────────────────
function list(db, projectId, { type, status } = {}) {
  const where = ['project_id = ?'];
  const params = [projectId];
  if (type) { where.push('type = ?'); params.push(type); }
  if (status) { where.push('status = ?'); params.push(status); }
  const sql = `
    SELECT id, slug, type, suffix, status, created_at, updated_at
    FROM documents
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE type WHEN 'constitution' THEN 0 WHEN 'feature' THEN 1 WHEN 'tech_spec' THEN 2 WHEN 'task' THEN 3 WHEN 'verification' THEN 4 END,
      slug, suffix
  `;
  return db.prepare(sql).all(...params);
}

// ── resolve id-or-slug → row (scoped to project) ──────────────
function resolve(db, projectId, idOrSlug) {
  if (/^\d+$/.test(String(idOrSlug))) {
    const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(Number(idOrSlug));
    return row && row.project_id === projectId ? row : undefined;
  }
  // slug match: prefer non-constitution, then first match
  const rows = db.prepare('SELECT * FROM documents WHERE project_id = ? AND slug = ? ORDER BY type').all(projectId, String(idOrSlug));
  return rows[0] || undefined;
}

// ── get (with relations) — verified against project ───────────
function get(db, projectId, id) {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc || doc.project_id !== projectId) return undefined;
  const outgoing = db.prepare(
    'SELECT target_id, relation_type FROM relations WHERE source_id = ?'
  ).all(id);
  const incoming = db.prepare(
    'SELECT source_id, relation_type FROM relations WHERE target_id = ?'
  ).all(id);
  return { ...doc, outgoing, incoming };
}

// ── create (uniqueness scoped by project) ─────────────────────
function create(db, projectId, { type, slug, suffix, status, content }) {
  if (!DOC_TYPES.includes(type) && type !== 'constitution') {
    throw new Error(`Invalid type '${type}'. Valid: ${[...DOC_TYPES, 'constitution'].join(', ')}`);
  }
  if (!slug) throw new Error('slug is required');
  suffix = normalizeSuffix(suffix);
  const finalStatus = STATUSES.includes(status) ? status : 'DRAFT';

  const existing = db.prepare("SELECT id FROM documents WHERE project_id = ? AND slug = ? AND type = ? AND IFNULL(suffix,'') = IFNULL(?,'')")
    .get(projectId, slug, type, suffix);
  if (existing) {
    const err = new Error('Document already exists');
    err.code = 'EXISTS';
    err.id = existing.id;
    throw err;
  }

  const finalContent = content != null ? content : templateContent(type, slug, suffix);
  const result = db.prepare(
    'INSERT INTO documents (project_id, slug, type, suffix, status, content) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(projectId, slug, type, suffix, finalStatus, finalContent);

  const id = Number(result.lastInsertRowid);
  return get(db, projectId, id);
}

// ── set status — verified against project ─────────────────────
function setStatus(db, projectId, id, status) {
  if (!STATUSES.includes(status)) throw new Error(`Invalid status '${status}'. Valid: ${STATUSES.join(', ')}`);
  const result = db.prepare(
    "UPDATE documents SET status = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?"
  ).run(status, id, projectId);
  return result.changes > 0;
}

// ── write content — verified against project ──────────────────
function writeContent(db, projectId, id, content) {
  const result = db.prepare(
    "UPDATE documents SET content = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?"
  ).run(content == null ? '' : content, id, projectId);
  return result.changes > 0;
}

// ── relations (scoped to project) ─────────────────────────────
function listRelations(db, projectId) {
  return db.prepare(`
    SELECT r.source_id, r.target_id, r.relation_type
    FROM relations r
    JOIN documents s ON s.id = r.source_id
    WHERE s.project_id = ?
  `).all(projectId);
}

function relate(db, projectId, sourceId, targetId, relationType) {
  if (!RELATION_TYPES.includes(relationType)) {
    throw new Error(`Invalid relation_type '${relationType}'. Valid: ${RELATION_TYPES.join(', ')}`);
  }
  const src = db.prepare('SELECT id, project_id FROM documents WHERE id = ?').get(sourceId);
  const tgt = db.prepare('SELECT id, project_id FROM documents WHERE id = ?').get(targetId);
  if (!src) throw new Error(`source id ${sourceId} not found`);
  if (!tgt) throw new Error(`target id ${targetId} not found`);
  if (src.project_id !== projectId) throw new Error(`source id ${sourceId} does not belong to this project`);
  if (tgt.project_id !== projectId) throw new Error(`target id ${targetId} does not belong to this project`);
  if (src.project_id !== tgt.project_id) throw new Error('cannot relate documents from different projects');
  try {
    db.prepare(
      'INSERT INTO relations (source_id, target_id, relation_type) VALUES (?, ?, ?)'
    ).run(sourceId, targetId, relationType);
    return true;
  } catch (e) {
    if (String(e.message || e).includes('UNIQUE')) return false; // already exists
    throw e;
  }
}

module.exports = {
  DOC_TYPES, STATUSES, RELATION_TYPES,
  templateContent,
  list, resolve, get, create, setStatus, writeContent,
  listRelations, relate,
};
