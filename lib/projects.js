'use strict';

/** Convert a free-form name into a URL-safe slug (lowercase, dash-separated). */
function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── create ────────────────────────────────────────────────────
function create(db, { name }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('project name is required');
  const base = slugify(trimmed);
  if (!base) throw new Error('project name must contain alphanumeric characters');

  // De-dupe slug on collision: base, base-2, base-3, …
  let slug = base;
  let n = 2;
  while (db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug)) {
    slug = `${base}-${n++}`;
  }

  const result = db.prepare('INSERT INTO projects (name, slug) VALUES (?, ?)').run(trimmed, slug);
  return get(db, Number(result.lastInsertRowid));
}

// ── list ──────────────────────────────────────────────────────
function list(db) {
  return db.prepare(`
    SELECT p.id, p.name, p.slug, p.created_at,
           (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS doc_count
    FROM projects p
    ORDER BY p.id
  `).all();
}

// ── get ───────────────────────────────────────────────────────
function get(db, id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

// ── resolve id-or-slug → row ──────────────────────────────────
function resolve(db, idOrSlug) {
  if (idOrSlug == null) return undefined;
  if (/^\d+$/.test(String(idOrSlug))) {
    return get(db, Number(idOrSlug));
  }
  return db.prepare('SELECT * FROM projects WHERE slug = ?').get(String(idOrSlug));
}

module.exports = { slugify, create, list, get, resolve };
