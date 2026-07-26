'use strict';

const fs = require('fs');
const path = require('path');
const { openDb } = require('./db');

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
function list(db, { type, status } = {}) {
  const where = [];
  const params = [];
  if (type) { where.push('type = ?'); params.push(type); }
  if (status) { where.push('status = ?'); params.push(status); }
  const sql = `
    SELECT id, slug, type, suffix, status, created_at, updated_at
    FROM documents
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY
      CASE type WHEN 'constitution' THEN 0 WHEN 'feature' THEN 1 WHEN 'tech_spec' THEN 2 WHEN 'task' THEN 3 WHEN 'verification' THEN 4 END,
      slug, suffix
  `;
  return db.prepare(sql).all(...params);
}

// ── resolve id-or-slug → row ───────────────────────────────────
function resolve(db, idOrSlug) {
  if (/^\d+$/.test(String(idOrSlug))) {
    return db.prepare('SELECT * FROM documents WHERE id = ?').get(Number(idOrSlug));
  }
  // slug match: prefer non-constitution, then first match
  const rows = db.prepare('SELECT * FROM documents WHERE slug = ? ORDER BY type').all(String(idOrSlug));
  return rows[0] || undefined;
}

// ── get (with relations) ──────────────────────────────────────
function get(db, id) {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) return undefined;
  const outgoing = db.prepare(
    'SELECT target_id, relation_type FROM relations WHERE source_id = ?'
  ).all(id);
  const incoming = db.prepare(
    'SELECT source_id, relation_type FROM relations WHERE target_id = ?'
  ).all(id);
  return { ...doc, outgoing, incoming };
}

// ── create ────────────────────────────────────────────────────
function create(db, { type, slug, suffix, status, content }) {
  if (!DOC_TYPES.includes(type) && type !== 'constitution') {
    throw new Error(`Invalid type '${type}'. Valid: ${[...DOC_TYPES, 'constitution'].join(', ')}`);
  }
  if (!slug) throw new Error('slug is required');
  suffix = normalizeSuffix(suffix);
  const finalStatus = STATUSES.includes(status) ? status : 'DRAFT';

  const existing = db.prepare("SELECT id FROM documents WHERE slug = ? AND type = ? AND IFNULL(suffix,'') = IFNULL(?,'')")
    .get(slug, type, suffix);
  if (existing) {
    const err = new Error('Document already exists');
    err.code = 'EXISTS';
    err.id = existing.id;
    throw err;
  }

  const finalContent = content != null ? content : templateContent(type, slug, suffix);
  const result = db.prepare(
    'INSERT INTO documents (slug, type, suffix, status, content) VALUES (?, ?, ?, ?, ?)'
  ).run(slug, type, suffix, finalStatus, finalContent);

  const id = Number(result.lastInsertRowid);
  return get(db, id);
}

// ── set status ────────────────────────────────────────────────
function setStatus(db, id, status) {
  if (!STATUSES.includes(status)) throw new Error(`Invalid status '${status}'. Valid: ${STATUSES.join(', ')}`);
  const result = db.prepare(
    "UPDATE documents SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, id);
  return result.changes > 0;
}

// ── write content ─────────────────────────────────────────────
function writeContent(db, id, content) {
  const result = db.prepare(
    "UPDATE documents SET content = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(content == null ? '' : content, id);
  return result.changes > 0;
}

// ── relations ─────────────────────────────────────────────────
function listRelations(db) {
  return db.prepare('SELECT source_id, target_id, relation_type FROM relations').all();
}

function relate(db, sourceId, targetId, relationType) {
  if (!RELATION_TYPES.includes(relationType)) {
    throw new Error(`Invalid relation_type '${relationType}'. Valid: ${RELATION_TYPES.join(', ')}`);
  }
  const src = db.prepare('SELECT id FROM documents WHERE id = ?').get(sourceId);
  const tgt = db.prepare('SELECT id FROM documents WHERE id = ?').get(targetId);
  if (!src) throw new Error(`source id ${sourceId} not found`);
  if (!tgt) throw new Error(`target id ${targetId} not found`);
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
