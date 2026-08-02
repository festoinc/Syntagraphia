'use strict';

const fs = require('fs');

const SLUG = 'constitution';
const TYPE = 'constitution';

const SECTIONS = [
  ['Project Name', 'e.g. "Syntagraphia"'],
  ['Vision', 'One or two sentences describing the ultimate goal'],
  ['Problem Statement', 'What problem are we solving? Who has it? Why does it matter?'],
  ['Target Audience', 'Primary and secondary users. Be specific.'],
  ['Non-Negotiable Principles', 'Hard constraints that must never be violated (one per line)'],
  ['Out of Scope', 'What this project will explicitly NOT do'],
  ['Tech Stack', 'Key technologies, frameworks, platforms'],
  ['Success Metrics', 'How do we know this project is successful?'],
  ['Key Constraints', 'Budget, timeline, team size, regulatory, etc.'],
];

async function get(db, projectId) {
  return db.get('SELECT * FROM documents WHERE project_id = ? AND type = ? ORDER BY id LIMIT 1', [projectId, TYPE]);
}

async function set(db, projectId, content) {
  const existing = await get(db, projectId);
  if (existing) {
    await db.run("UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [content == null ? '' : content, existing.id]);
    return get(db, projectId);
  }
  const result = await db.run(
    'INSERT INTO documents (project_id, slug, type, suffix, status, content) VALUES (?, ?, ?, NULL, ?, ?) RETURNING id',
    [projectId, SLUG, TYPE, 'DONE', content == null ? '' : content],
  );
  return db.get('SELECT * FROM documents WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function fromJson(obj) {
  const lines = ['# Project Constitution', ''];
  for (const [key] of SECTIONS) {
    const val = obj[key];
    lines.push(`## ${key}`);
    if (val == null) lines.push('');
    else if (Array.isArray(val)) lines.push(...val.map((v) => `- ${v}`), '');
    else lines.push(String(val), '');
  }
  return lines.join('\n').trim() + '\n';
}

function readFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (filePath.toLowerCase().endsWith('.json')) return fromJson(JSON.parse(raw));
  return raw;
}

module.exports = { SECTIONS, SLUG, TYPE, get, set, fromJson, readFromFile };
