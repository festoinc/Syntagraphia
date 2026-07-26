#!/usr/bin/env node
'use strict';

// One-off migration: import a legacy filesystem-based Syntagraphia project
// (features/, tech-spec/, tasks/, verifications/, PROJECT-CONSTITUTION.md) into the
// new DB-centric `documents` table. Idempotent: skips docs that already exist.
//
// Usage: node scripts/migrate-legacy.js [--dir <path>]

const fs = require('fs');
const path = require('path');
const { resolveRootDir } = require('../lib/paths');
const { openDb } = require('../lib/db');
const docs = require('../lib/documents');
const constitution = require('../lib/constitution');

const DIR_TO_TYPE = {
  features: 'feature',
  'tech-spec': 'tech_spec',
  tasks: 'task',
  verifications: 'verification',
};

function listMd(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ name: f.replace(/\.md$/, ''), file: path.join(dir, f) }));
}

function splitTaskName(name, featureSlugs) {
  // task files are <slug>-<suffix>.md; match the longest known feature-slug prefix
  const match = featureSlugs
    .filter((s) => name === s || name.startsWith(s + '-'))
    .sort((a, b) => b.length - a.length)[0];
  if (match && name !== match) return { slug: match, suffix: name.slice(match.length + 1) };
  return { slug: name, suffix: null };
}

function main() {
  const argv = process.argv.slice(2);
  const dir = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : undefined;
  const rootDir = resolveRootDir(dir);
  const db = openDb(rootDir);

  const featureSlugs = listMd(path.join(rootDir, 'features')).map((f) => f.name);
  let imported = 0, skipped = 0;

  // constitution
  const constPath = path.join(rootDir, 'PROJECT-CONSTITUTION.md');
  if (fs.existsSync(constPath)) {
    const content = fs.readFileSync(constPath, 'utf-8');
    if (!constitution.get(db)) {
      constitution.set(db, content);
      imported++;
      console.log(`✓ constitution (from PROJECT-CONSTITUTION.md)`);
    } else { skipped++; console.log(`• constitution already present, skipped`); }
  }

  // feature / tech_spec / verification
  for (const [dirName, type] of Object.entries(DIR_TO_TYPE)) {
    for (const f of listMd(path.join(rootDir, dirName))) {
      const content = fs.readFileSync(f.file, 'utf-8');
      let slug = f.name, suffix = null;
      if (type === 'task') ({ slug, suffix } = splitTaskName(f.name, featureSlugs));
      try {
        docs.create(db, { type, slug, suffix, content });
        imported++;
        console.log(`✓ ${type} — ${slug}${suffix ? ` (${suffix})` : ''}`);
      } catch (e) {
        if (e.code === 'EXISTS') { skipped++; console.log(`• ${type} — ${slug}${suffix ? ` (${suffix})` : ''} already exists, skipped`); }
        else throw e;
      }
    }
  }

  // reconstruct standard relations by slug: feature → spec (has_spec), → task (has_task), → verification (verifies)
  let rels = 0;
  const all = docs.list(db);
  const bySlugType = new Map(all.map((d) => [`${d.slug}|${d.type}|${d.suffix || ''}`, d.id]));
  const featId = (slug) => bySlugType.get(`${slug}|feature|`);
  const specId = (slug) => bySlugType.get(`${slug}|tech_spec|`);
  const verifId = (slug) => bySlugType.get(`${slug}|verification|`);

  for (const slug of featureSlugs) {
    const fId = featId(slug);
    if (!fId) continue;
    const sId = specId(slug);
    if (sId && docs.relate(db, fId, sId, 'has_spec')) { rels++; console.log(`  relate ${fId} →has_spec→ ${sId}`); }
    const vId = verifId(slug);
    if (vId && docs.relate(db, fId, vId, 'verifies')) { rels++; console.log(`  relate ${fId} →verifies→ ${vId}`); }
    for (const d of all.filter((d) => d.slug === slug && d.type === 'task')) {
      if (docs.relate(db, fId, d.id, 'has_task')) { rels++; console.log(`  relate ${fId} →has_task→ ${d.id}`); }
    }
  }

  console.log(`\nDone. Imported ${imported}, skipped ${skipped}, relations ${rels}.`);
  console.log(`DB: ${path.join(rootDir, 'project-tracker.db')}`);
  db.close?.();
}

try { main(); } catch (e) { console.error('Error:', e.message); process.exit(1); }
