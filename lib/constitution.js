'use strict';

const fs = require('fs');
const { openDb } = require('./db');

const SLUG = 'constitution';
const TYPE = 'constitution';

// Ordered sections used by the interactive init prompt and by JSON-file import.
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

/** Read the singleton constitution row (without relations). */
function get(db) {
  return db.prepare('SELECT * FROM documents WHERE type = ? ORDER BY id LIMIT 1').get(TYPE);
}

/** Upsert the constitution content (singleton). Returns the row. */
function set(db, content) {
  const existing = get(db);
  if (existing) {
    db.prepare("UPDATE documents SET content = ?, updated_at = datetime('now') WHERE id = ?")
      .run(content == null ? '' : content, existing.id);
    return get(db);
  }
  const result = db.prepare(
    'INSERT INTO documents (slug, type, suffix, status, content) VALUES (?, ?, NULL, ?, ?)'
  ).run(SLUG, TYPE, 'DONE', content == null ? '' : content);
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(Number(result.lastInsertRowid));
}

/** Build markdown constitution from a JSON object (for --constitution-file JSON import). */
function fromJson(obj) {
  const lines = ['# Project Constitution', ''];
  for (const [key, _desc] of SECTIONS) {
    const val = obj[key];
    lines.push(`## ${key}`);
    if (val == null) {
      lines.push('');
    } else if (Array.isArray(val)) {
      lines.push(...val.map((v) => `- ${v}`), '');
    } else {
      lines.push(String(val), '');
    }
  }
  return lines.join('\n').trim() + '\n';
}

/** Read a constitution from a file path (.json parsed, else raw markdown). */
function readFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (filePath.toLowerCase().endsWith('.json')) {
    return fromJson(JSON.parse(raw));
  }
  return raw;
}

module.exports = { SECTIONS, SLUG, TYPE, get, set, fromJson, readFromFile };
