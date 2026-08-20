'use strict';

const DEFAULT_STATUSES = [
  { code: 'DRAFT', label: 'Draft', sortOrder: 0 },
  { code: 'IN_PROGRESS', label: 'In Progress', sortOrder: 1 },
  { code: 'REVIEW', label: 'Review', sortOrder: 2 },
  { code: 'DONE', label: 'Done', sortOrder: 3 },
];

function normalizeCode(value) {
  const code = String(value == null ? '' : value).trim();
  if (!code) throw new Error('status code is required');
  return code;
}

function normalizeLabel(label, code) {
  const value = String(label == null ? '' : label).trim();
  return value || code;
}

async function list(db) {
  const rows = await db.all('SELECT id, code, label, sort_order AS sortOrder FROM statuses ORDER BY sort_order, id');
  return rows.map((row) => ({ ...row, sortOrder: Number(row.sortOrder) }));
}

async function codes(db) {
  const rows = await list(db);
  return rows.map((row) => row.code);
}

async function get(db, code) {
  return db.get('SELECT id, code, label, sort_order AS sortOrder FROM statuses WHERE code = ?', [code]);
}

async function assertStatus(db, status) {
  const existing = await get(db, status);
  if (!existing) {
    const valid = (await codes(db)).join(', ');
    throw new Error(`Invalid status '${status}'. Valid: ${valid}`);
  }
  return existing;
}

async function ensureDefaults(db) {
  const row = await db.get('SELECT COUNT(*) AS count FROM statuses');
  if (Number(row.count) > 0) return;
  for (const s of DEFAULT_STATUSES) {
    await db.run('INSERT INTO statuses (code, label, sort_order) VALUES (?, ?, ?)', [s.code, s.label, s.sortOrder]);
  }
}

async function add(db, { code, label }) {
  code = normalizeCode(code);
  const existing = await get(db, code);
  if (existing) {
    const error = new Error(`status '${code}' already exists`);
    error.code = 'EXISTS';
    error.id = existing.id;
    throw error;
  }
  const nextOrder = (await db.get('SELECT COALESCE(MAX(sort_order) + 1, 0) AS next_order FROM statuses')).next_order;
  const result = await db.run('INSERT INTO statuses (code, label, sort_order) VALUES (?, ?, ?)', [code, normalizeLabel(label, code), Number(nextOrder)]);
  return get(db, code);
}

async function rename(db, oldCode, { code, label } = {}) {
  oldCode = normalizeCode(oldCode);
  const existing = await get(db, oldCode);
  if (!existing) throw new Error(`status '${oldCode}' not found`);
  const newCode = code != null ? normalizeCode(code) : oldCode;
  if (newCode !== oldCode) {
    const conflict = await get(db, newCode);
    if (conflict) {
      const error = new Error(`status '${newCode}' already exists`);
      error.code = 'EXISTS';
      error.id = conflict.id;
      throw error;
    }
  }
  const newLabel = label != null ? normalizeLabel(label, newCode) : existing.label;
  await db.run('BEGIN');
  try {
    if (newCode !== oldCode) {
      await db.run('UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE status = ?', [newCode, oldCode]);
      await db.run('UPDATE checklist_items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE status = ?', [newCode, oldCode]);
    }
    await db.run('UPDATE statuses SET code = ?, label = ? WHERE id = ?', [newCode, newLabel, existing.id]);
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
  return get(db, newCode);
}

async function remove(db, code) {
  code = normalizeCode(code);
  const existing = await get(db, code);
  if (!existing) throw new Error(`status '${code}' not found`);
  const counts = await db.all('SELECT (SELECT COUNT(*) FROM statuses) AS total, (SELECT COUNT(*) FROM documents WHERE status = ?) AS docs, (SELECT COUNT(*) FROM checklist_items WHERE status = ?) AS items', [code, code]);
  const { total, docs, items } = counts[0];
  if (Number(total) <= 1) throw new Error(`cannot remove the last status '${code}'`);
  if (Number(docs) > 0 || Number(items) > 0) {
    throw new Error(`cannot remove status '${code}': ${docs} document(s) and ${items} checklist item(s) still use it`);
  }
  await db.run('DELETE FROM statuses WHERE id = ?', [existing.id]);
  return { id: existing.id, code, label: existing.label, removed: true };
}

module.exports = {
  DEFAULT_STATUSES, list, codes, get, assertStatus, ensureDefaults, add, rename, remove,
};
