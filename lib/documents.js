'use strict';

const templates = require('./templates');

const DOC_TYPES = ['feature', 'tech_spec', 'task', 'verification'];
const STATUSES = ['DRAFT', 'IN_PROGRESS', 'REVIEW', 'DONE'];
const RELATION_TYPES = ['has_spec', 'has_task', 'verifies', 'implements'];
const CHECKLIST_LABELS = {
  feature: 'Acceptance Criteria', task: 'Subtasks', verification: 'Validation Checklist', tech_spec: 'Technical Checklist',
};
function templateContent(type, slug, suffix) {
  const tpl = templates.read(type).content;
  const suffixLabel = suffix ? ` (${suffix})` : '';
  return tpl.replaceAll('{{slug}}', slug).replaceAll('{{suffix_label}}', suffixLabel).replaceAll('{{suffix}}', suffix || '');
}

function normalizeSuffix(suffix) {
  return suffix === undefined || suffix === null || suffix === '' ? null : String(suffix);
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function validateSearchFilters({ type, status } = {}) {
  if (type && !DOC_TYPES.includes(type) && type !== 'constitution') {
    throw new Error(`Invalid type '${type}'. Valid: ${[...DOC_TYPES, 'constitution'].join(', ')}`);
  }
  if (status && !STATUSES.includes(status)) {
    throw new Error(`Invalid status '${status}'. Valid: ${STATUSES.join(', ')}`);
  }
}

async function touch(db, id) {
  await db.run("UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
}

function checklistLabel(type) { return CHECKLIST_LABELS[type] || null; }

async function assertChecklistDocument(db, projectId, documentId) {
  const row = await db.get('SELECT id, project_id, type FROM documents WHERE id = ?', [documentId]);
  if (!row || row.project_id !== projectId) return undefined;
  if (!checklistLabel(row.type)) {
    const error = new Error(`document type '${row.type}' does not support checklists`);
    error.code = 'CHECKLIST_UNSUPPORTED';
    throw error;
  }
  return row;
}

function normalizeChecklistText(text) {
  const value = String(text == null ? '' : text).trim();
  if (!value) throw new Error('checklist item text is required');
  return value;
}

function normalizeCommitNote(commitNote) {
  if (commitNote === undefined || commitNote === null || commitNote === '') return null;
  const value = String(commitNote).trim();
  if (!value) return null;
  if (value.length > 255) throw new Error('checklist note must be 255 characters or fewer');
  return value;
}

async function list(db, projectId, { type, status } = {}) {
  const where = ['project_id = ?'];
  const params = [projectId];
  if (type) { where.push('type = ?'); params.push(type); }
  if (status) { where.push('status = ?'); params.push(status); }
  const rows = await db.all(`
    SELECT id, slug, type, suffix, status, created_at, updated_at,
      (SELECT COUNT(*) FROM checklist_items c WHERE c.document_id = documents.id) AS checklist_total,
      (SELECT COUNT(*) FROM checklist_items c WHERE c.document_id = documents.id AND c.status = 'DONE') AS checklist_done
    FROM documents WHERE ${where.join(' AND ')}
    ORDER BY CASE type WHEN 'constitution' THEN 0 WHEN 'feature' THEN 1 WHEN 'tech_spec' THEN 2 WHEN 'task' THEN 3 WHEN 'verification' THEN 4 END, slug, suffix
  `, params);
  return rows.map((row) => ({ ...row, checklist_total: Number(row.checklist_total), checklist_done: Number(row.checklist_done) }));
}

async function search(db, projectId, { query = '', type, status } = {}) {
  validateSearchFilters({ type, status });
  const where = ['project_id = ?'];
  const params = [projectId];
  const term = String(query == null ? '' : query).trim().toLowerCase();
  if (term) {
    const pattern = `%${escapeLike(term)}%`;
    where.push("(LOWER(COALESCE(slug, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(suffix, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(content, '')) LIKE ? ESCAPE '\\')");
    params.push(pattern, pattern, pattern);
  }
  if (type) { where.push('type = ?'); params.push(type); }
  if (status) { where.push('status = ?'); params.push(status); }
  const rows = await db.all(`
    SELECT id, slug, type, suffix, status, created_at, updated_at,
      (SELECT COUNT(*) FROM checklist_items c WHERE c.document_id = documents.id) AS checklist_total,
      (SELECT COUNT(*) FROM checklist_items c WHERE c.document_id = documents.id AND c.status = 'DONE') AS checklist_done
    FROM documents WHERE ${where.join(' AND ')}
    ORDER BY CASE type WHEN 'constitution' THEN 0 WHEN 'feature' THEN 1 WHEN 'tech_spec' THEN 2 WHEN 'task' THEN 3 WHEN 'verification' THEN 4 END, slug, suffix
  `, params);
  return rows.map((row) => ({ ...row, checklist_total: Number(row.checklist_total), checklist_done: Number(row.checklist_done) }));
}

async function resolve(db, projectId, idOrSlug) {
  if (/^\d+$/.test(String(idOrSlug))) {
    const row = await db.get('SELECT * FROM documents WHERE id = ?', [Number(idOrSlug)]);
    return row && row.project_id === projectId ? row : undefined;
  }
  const rows = await db.all('SELECT * FROM documents WHERE project_id = ? AND slug = ? ORDER BY type', [projectId, String(idOrSlug)]);
  return rows[0] || undefined;
}

async function get(db, projectId, id) {
  const doc = await db.get('SELECT * FROM documents WHERE id = ?', [id]);
  if (!doc || doc.project_id !== projectId) return undefined;
  const outgoing = await db.all('SELECT target_id, relation_type FROM relations WHERE source_id = ?', [id]);
  const incoming = await db.all('SELECT source_id, relation_type FROM relations WHERE target_id = ?', [id]);
  const checklist = await listChecklistItems(db, projectId, id) || [];
  return { ...doc, outgoing, incoming, checklist_label: checklistLabel(doc.type), checklist };
}

async function create(db, projectId, { type, slug, suffix, status, content }) {
  if (!DOC_TYPES.includes(type) && type !== 'constitution') throw new Error(`Invalid type '${type}'. Valid: ${[...DOC_TYPES, 'constitution'].join(', ')}`);
  if (!slug) throw new Error('slug is required');
  suffix = normalizeSuffix(suffix);
  const finalStatus = STATUSES.includes(status) ? status : 'DRAFT';
  const existing = await db.get("SELECT id FROM documents WHERE project_id = ? AND slug = ? AND type = ? AND COALESCE(suffix,'') = COALESCE(?,'')", [projectId, slug, type, suffix]);
  if (existing) { const error = new Error('Document already exists'); error.code = 'EXISTS'; error.id = existing.id; throw error; }
  const finalContent = content != null ? content : templateContent(type, slug, suffix);
  const result = await db.run('INSERT INTO documents (project_id, slug, type, suffix, status, content) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', [projectId, slug, type, suffix, finalStatus, finalContent]);
  return get(db, projectId, Number(result.lastInsertRowid));
}

async function setStatus(db, projectId, id, status) {
  if (!STATUSES.includes(status)) throw new Error(`Invalid status '${status}'. Valid: ${STATUSES.join(', ')}`);
  const result = await db.run('UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?', [status, id, projectId]);
  return result.changes > 0;
}

async function writeContent(db, projectId, id, content) {
  const result = await db.run('UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?', [content == null ? '' : content, id, projectId]);
  return result.changes > 0;
}

async function listChecklistItems(db, projectId, documentId) {
  const document = await db.get('SELECT id, project_id, type FROM documents WHERE id = ?', [documentId]);
  if (!document || document.project_id !== projectId) return undefined;
  if (!checklistLabel(document.type)) return [];
  return db.all('SELECT id, document_id, position, text, status, commit_url, created_at, updated_at FROM checklist_items WHERE document_id = ? ORDER BY position, id', [documentId]);
}

async function createChecklistItem(db, projectId, documentId, { text, status, commitUrl } = {}) {
  const document = await assertChecklistDocument(db, projectId, documentId);
  if (!document) return undefined;
  if (status !== undefined && !STATUSES.includes(status)) throw new Error(`Invalid status '${status}'. Valid: ${STATUSES.join(', ')}`);
  const nextPosition = (await db.get('SELECT COALESCE(MAX(position) + 1, 0) AS next_position FROM checklist_items WHERE document_id = ?', [documentId])).next_position;
  const result = await db.run('INSERT INTO checklist_items (document_id, position, text, status, commit_url) VALUES (?, ?, ?, ?, ?) RETURNING id', [documentId, nextPosition, normalizeChecklistText(text), status === undefined ? 'DRAFT' : status, normalizeCommitNote(commitUrl)]);
  await touch(db, documentId);
  return db.get('SELECT id, document_id, position, text, status, commit_url, created_at, updated_at FROM checklist_items WHERE id = ?', [Number(result.lastInsertRowid)]);
}

async function findChecklistItem(db, projectId, itemId) {
  return db.get(`SELECT c.id, c.document_id, c.position, c.text, c.status, c.commit_url, c.created_at, c.updated_at, d.project_id, d.type
    FROM checklist_items c JOIN documents d ON d.id = c.document_id WHERE c.id = ? AND d.project_id = ?`, [itemId, projectId]);
}

async function updateChecklistItem(db, projectId, itemId, changes = {}) {
  const existing = await findChecklistItem(db, projectId, itemId);
  if (!existing) return undefined;
  if (!checklistLabel(existing.type)) { const error = new Error(`document type '${existing.type}' does not support checklists`); error.code = 'CHECKLIST_UNSUPPORTED'; throw error; }
  const values = [], updates = [];
  if (changes.text !== undefined) { updates.push('text = ?'); values.push(normalizeChecklistText(changes.text)); }
  if (changes.status !== undefined) { if (!STATUSES.includes(changes.status)) throw new Error(`Invalid status '${changes.status}'. Valid: ${STATUSES.join(', ')}`); updates.push('status = ?'); values.push(changes.status); }
  if (changes.commitUrl !== undefined) { updates.push('commit_url = ?'); values.push(normalizeCommitNote(changes.commitUrl)); }
  if (!updates.length) return {
    id: existing.id, document_id: existing.document_id, position: existing.position, text: existing.text,
    status: existing.status, commit_url: existing.commit_url, created_at: existing.created_at, updated_at: existing.updated_at,
  };
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(itemId);
  await db.run(`UPDATE checklist_items SET ${updates.join(', ')} WHERE id = ?`, values);
  await touch(db, existing.document_id);
  return db.get('SELECT id, document_id, position, text, status, commit_url, created_at, updated_at FROM checklist_items WHERE id = ?', [itemId]);
}

async function deleteChecklistItem(db, projectId, itemId) {
  const existing = await findChecklistItem(db, projectId, itemId);
  if (!existing) return false;
  await db.run('DELETE FROM checklist_items WHERE id = ?', [itemId]);
  await touch(db, existing.document_id);
  return true;
}

async function listRelations(db, projectId) {
  return db.all('SELECT r.source_id, r.target_id, r.relation_type FROM relations r JOIN documents s ON s.id = r.source_id WHERE s.project_id = ?', [projectId]);
}

async function relate(db, projectId, sourceId, targetId, relationType) {
  if (!RELATION_TYPES.includes(relationType)) throw new Error(`Invalid relation_type '${relationType}'. Valid: ${RELATION_TYPES.join(', ')}`);
  const src = await db.get('SELECT id, project_id FROM documents WHERE id = ?', [sourceId]);
  const tgt = await db.get('SELECT id, project_id FROM documents WHERE id = ?', [targetId]);
  if (!src) throw new Error(`source id ${sourceId} not found`);
  if (!tgt) throw new Error(`target id ${targetId} not found`);
  if (src.project_id !== projectId) throw new Error(`source id ${sourceId} does not belong to this project`);
  if (tgt.project_id !== projectId) throw new Error(`target id ${targetId} does not belong to this project`);
  try {
    await db.run('INSERT INTO relations (source_id, target_id, relation_type) VALUES (?, ?, ?) RETURNING id', [sourceId, targetId, relationType]);
    return true;
  } catch (error) {
    if (error.code === '23505' || /UNIQUE|duplicate key/i.test(String(error.message || error))) return false;
    throw error;
  }
}

async function unrelate(db, projectId, sourceId, targetId) {
  const src = await db.get('SELECT id, project_id FROM documents WHERE id = ?', [sourceId]);
  const tgt = await db.get('SELECT id, project_id FROM documents WHERE id = ?', [targetId]);
  if (!src) throw new Error(`source id ${sourceId} not found`);
  if (!tgt) throw new Error(`target id ${targetId} not found`);
  if (src.project_id !== projectId) throw new Error(`source id ${sourceId} does not belong to this project`);
  if (tgt.project_id !== projectId) throw new Error(`target id ${targetId} does not belong to this project`);
  const result = await db.run('DELETE FROM relations WHERE source_id = ? AND target_id = ?', [sourceId, targetId]);
  return result.changes > 0;
}

module.exports = {
  DOC_TYPES, STATUSES, RELATION_TYPES, CHECKLIST_LABELS, checklistLabel, templateContent,
  list, search, resolve, get, create, setStatus, writeContent,
  listChecklistItems, createChecklistItem, updateChecklistItem, deleteChecklistItem, listRelations, relate, unrelate,
};
