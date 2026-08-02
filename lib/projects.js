'use strict';

/** Convert a free-form name into a URL-safe slug (lowercase, dash-separated). */
function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function create(db, { name }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('project name is required');
  const base = slugify(trimmed);
  if (!base) throw new Error('project name must contain alphanumeric characters');

  let slug = base;
  let n = 2;
  while (await db.get('SELECT id FROM projects WHERE slug = ?', [slug])) slug = `${base}-${n++}`;

  const result = await db.run('INSERT INTO projects (name, slug) VALUES (?, ?) RETURNING id', [trimmed, slug]);
  return get(db, Number(result.lastInsertRowid));
}

async function list(db) {
  const rows = await db.all(`
    SELECT p.id, p.name, p.slug, p.created_at,
           (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS doc_count
    FROM projects p
    ORDER BY p.id
  `);
  return rows.map((row) => ({ ...row, doc_count: Number(row.doc_count) }));
}

async function get(db, id) {
  return db.get('SELECT * FROM projects WHERE id = ?', [id]);
}

async function findByName(db, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return undefined;
  return db.get('SELECT * FROM projects WHERE LOWER(name) = LOWER(?)', [trimmed]);
}

async function resolve(db, idOrSlug) {
  if (idOrSlug == null) return undefined;
  if (/^\d+$/.test(String(idOrSlug))) return get(db, Number(idOrSlug));
  return db.get('SELECT * FROM projects WHERE slug = ?', [String(idOrSlug)]);
}

module.exports = { slugify, create, list, get, resolve, findByName };
