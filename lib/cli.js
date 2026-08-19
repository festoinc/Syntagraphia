'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');
const { openDb } = require('./db');
const { saveConfig, resolveDbConfig, maskUrl } = require('./config');
const docs = require('./documents');
const templates = require('./templates');
const projects = require('./projects');
const constitution = require('./constitution');
const { createApp } = require('./server');

// ── arg parsing ───────────────────────────────────────────────
const VALUE_FLAGS = new Set(['--project', '--type', '--status', '--suffix', '--file', '--port', '--constitution-file', '--name', '--text', '--commit', '--url']);
const BOOL_FLAGS = new Set(['--json', '--stdin', '--no-open', '--no-commit', '--force', '--help', '-h', '--version', '-v']);

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { positionals.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--') || (a.startsWith('-') && a.length > 1 && /^-[a-z]/.test(a))) {
      if (a.includes('=')) {
        const [k, ...rest] = a.split('=');
        flags[k] = rest.join('=');
      } else if (VALUE_FLAGS.has(a)) {
        flags[a] = argv[++i];
      } else if (BOOL_FLAGS.has(a)) {
        flags[a] = true;
      } else {
        // unknown flag — treat as boolean to avoid crashing; could be a future option
        flags[a] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

// ── output helpers ────────────────────────────────────────────
function out(s) { process.stdout.write(s + '\n'); }
function printJson(obj) { out(JSON.stringify(obj, null, 2)); }
function err(s) { process.stderr.write('Error: ' + s + '\n'); }

function docLabel(d) {
  return d.suffix ? `${d.slug} (${d.suffix})` : d.slug;
}

// ── usage ──────────────────────────────────────────────────────
function printUsage() {
  out(`Syntagraphia — structured, connected project docs in a single global SQLite/Postgres DB.

Usage: syntagraphia <command> [options]

  SQLite defaults to ~/.syntagraphia/project-tracker.db; the backend is selected per machine.
Doc-level commands take a required --project <id|slug> to scope which project they touch.

Commands:
  db status [--json]                         Show the active database backend
  db use sqlite                              Switch to the local SQLite backend
  db use postgres --url <connection-string>  Validate and switch to PostgreSQL
  project create <name> [--constitution-file <path>] [--force]
                                              Create a project and capture its constitution
                                              (refuses to duplicate an existing name; --force
                                               re-captures the constitution in place)
  project list                                List all projects on this machine
  template list                               List document templates and their sources
  template show <type>                       Show a template's Markdown content
  template set <type> <file.md>              Use a Markdown file for new documents of a type
  template reset <type>                      Restore the packaged template for a type
  doc list   --project <p> [--type <t>] [--status <s>]
                                              List documents in a project
  search [<term>] --project <p> [--type <t>] [--status <s>]
                                              Search document names and content
  doc show   <id|slug> --project <p>           Show a document (with content + relations)
  doc create <type> <slug> --project <p> [--suffix <s>] [--status <STATUS>]
                                              Create a document from a template
  doc set-status <id> <STATUS> --project <p>   Change a document's status
  doc rename <id|slug> <new-slug> --project <p>
                                              Rename one document without changing its relations
  doc checklist list <id|slug> --project <p>   List structured checklist items
  doc checklist add <id|slug> <text> --project <p> [--status] [--commit]
                                              Add a checklist item
  doc checklist update <item-id> --project <p> [--text] [--status] [--commit|--no-commit]
                                              Update a checklist item
  doc checklist remove <item-id> --project <p> Remove a checklist item
  doc write  <id> --project <p> --file <path> | --stdin
                                              Overwrite a document's content
  doc edit   <id> --project <p>                Open \$EDITOR to edit a document's content
  doc update <id|slug> <file.md> --project <p> Overwrite content from a Markdown file
  doc write  <id|slug> --project <p> --file <path> | --stdin
                                              Legacy content overwrite command
  doc edit   <id|slug> --project <p>          Deprecated; use the UI or doc update
  relate <source-id> <target-id> <type> --project <p>
                                              Link two documents (same project only)
  unrelate <source-id> <target-id> --project <p>
                                              Remove a relation between two documents
  constitution show --project <p>             Show a project's constitution
  constitution set <file.md|file.json> --project <p>
                                              Replace a project's constitution from a file
  status --project <p>                        Dashboard summary + orphan check
  ui [--port 3001] [--no-open]                Start the web UI in the foreground
  ui start [--port 3001] [--no-open]          Start the web UI in the background
  ui stop                                     Stop the background web UI

Common: --project <id|slug>, --json. Copy and customize 'AGENTS_template.md' for agent guidance.
Node >= 22 required.`);
}

// ── commands: templates ──────────────────────────────────────
function cmdTemplate(positionals, flags) {
  const [subcommand, type, filePath] = positionals;

  if (subcommand === 'list') {
    const rows = templates.list();
    if (flags['--json']) { printJson(rows); return 0; }
    out('TYPE            SOURCE   PATH');
    out('--------------  -------  ----------------------------------------');
    for (const row of rows) out(`${row.type.padEnd(14)}  ${row.source.padEnd(7)}  ${row.path}`);
    return 0;
  }

  if (subcommand === 'show') {
    if (!type) { err('template show requires <type>'); return 1; }
    try {
      const template = templates.read(type);
      if (flags['--json']) { printJson(template); return 0; }
      out(`# ${template.type} template (${template.source}: ${template.path})`);
      out('');
      process.stdout.write(template.content);
      if (!template.content.endsWith('\n')) out('');
      return 0;
    } catch (e) { err(e.message); return 1; }
  }

  if (subcommand === 'set') {
    if (!type || !filePath) { err('template set requires <type> <file.md>'); return 1; }
    try {
      const content = readContentFile(filePath, { markdownOnly: true });
      const overridePath = templates.set(type, content);
      const result = { type, source: 'custom', path: overridePath, file: filePath, bytes: Buffer.byteLength(content) };
      if (flags['--json']) { printJson(result); return 0; }
      out(`✓ Set custom ${type} template from ${filePath}`);
      out(`  Stored at ${overridePath}`);
      return 0;
    } catch (e) { err(e.message); return 1; }
  }

  if (subcommand === 'reset') {
    if (!type) { err('template reset requires <type>'); return 1; }
    try {
      const removed = templates.reset(type);
      const result = { type, source: 'default', removed };
      if (flags['--json']) { printJson(result); return 0; }
      out(removed
        ? `✓ Restored packaged ${type} template`
        : `• ${type} template already uses the packaged default`);
      return 0;
    } catch (e) { err(e.message); return 1; }
  }

  err(`unknown template subcommand '${subcommand}'. Try: list, show, set, reset`);
  return 1;
}

// ── project resolution helper ─────────────────────────────────
async function requireProject(db, flags) {
  const idOrSlug = flags['--project'];
  if (!idOrSlug) {
    err('--project <id|slug> is required for this command. Run `syntagraphia project list` to see options.');
    return null;
  }
  const p = await projects.resolve(db, idOrSlug);
  if (!p) {
    err(`project '${idOrSlug}' not found. Run \`syntagraphia project list\` to see options.`);
    return null;
  }
  return p;
}

// ── commands: project ─────────────────────────────────────────
async function cmdProjectCreate(flags, positionals) {
  const name = positionals[0] || flags['--name'];
  if (!name) { err('project create requires <name>'); return 1; }
  const trimmed = String(name).trim();

  const db = await openDb();

  // Idempotency guard: a project with the same display name already exists.
  // (The old `init` did the same — refuse to duplicate, point at the existing one.)
  const existing = await projects.findByName(db, trimmed);
  if (existing && !flags['--force']) {
    if (flags['--json']) {
      printJson({ error: 'project already exists', id: existing.id, slug: existing.slug, name: existing.name });
      return 1;
    }
    err(`A project named '${existing.name}' already exists (slug: ${existing.slug}, id: ${existing.id}).`);
    err(`Use --project ${existing.slug} for it, pass a different name, or re-run with --force to re-capture its constitution.`);
    return 1;
  }

  let content;
  if (flags['--constitution-file']) {
    const f = flags['--constitution-file'];
    if (!fs.existsSync(f)) { err(`constitution file not found: ${f}`); return 1; }
    content = constitution.readFromFile(f);
  } else if (!process.stdin.isTTY) {
    err('Non-interactive shell: provide --constitution-file <path> (markdown or JSON).');
    return 1;
  }

  // --force on an existing same-named project: re-capture the constitution in place
  // (mirrors old `init --force` re-capturing the constitution).
  if (existing && flags['--force']) {
    if (content == null) content = await interactiveConstitution();
    await constitution.set(db, existing.id, content);
    if (flags['--json']) {
      printJson({ id: existing.id, name: existing.name, slug: existing.slug, constitution_chars: content.length, reconfigured: true });
      return 0;
    }
    out(`✓ Re-captured constitution for existing project '${existing.name}' (slug: ${existing.slug}, id: ${existing.id}).`);
    out(`  Use --project ${existing.slug} (or --project ${existing.id}) on doc commands.`);
    return 0;
  }

  let project;
  try {
    project = await projects.create(db, { name });
  } catch (e) {
    err(e.message);
    return 1;
  }

  // Interactive constitution capture (TTY only, no --constitution-file).
  if (content == null) {
    content = await interactiveConstitution();
  }
  await constitution.set(db, project.id, content);

  if (flags['--json']) {
    printJson({ id: project.id, name: project.name, slug: project.slug, constitution_chars: content.length });
    return 0;
  }
  out(`✓ Created project '${project.name}' (slug: ${project.slug}, id: ${project.id})`);
  out(`  Constitution captured (${content.length} chars).`);
  out(`  Use --project ${project.slug} (or --project ${project.id}) on doc commands.`);
  return 0;
}

function interactiveConstitution() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const result = {};
  const sections = constitution.SECTIONS;
  let idx = 0;
  return new Promise((resolve) => {
    const askSection = () => {
      if (idx >= sections.length) { rl.close(); resolve(buildMarkdown(result)); return; }
      const [key, desc] = sections[idx];
      process.stdout.write(`\n## ${key}\n  ${desc}\n  (Enter one or more lines; finish with a blank line)\n`);
      const lines = [];
      const onLine = (line) => {
        if (line.trim() === '') {
          rl.off('line', onLine);
          result[key] = lines;
          idx++;
          askSection();
        } else {
          lines.push(line);
        }
      };
      rl.on('line', onLine);
    };
    process.stdout.write('=== Syntagraphia — capture your project constitution ===\n');
    askSection();
  });
}

function buildMarkdown(obj) {
  const lines = ['# Project Constitution', ''];
  for (const [key] of constitution.SECTIONS) {
    const val = obj[key];
    lines.push(`## ${key}`);
    if (val && val.length) lines.push(...val, '');
    else lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}

async function cmdProjectList(flags) {
  const db = await openDb();
  const rows = await projects.list(db);
  if (flags['--json']) { printJson(rows); return 0; }
  if (!rows.length) { out('No projects yet. Run `syntagraphia project create <name>` to add one.'); return 0; }
  out('ID   SLUG                          NAME                           DOCS');
  out('---  ----------------------------  -----------------------------  ----');
  for (const p of rows) {
    out(`${String(p.id).padEnd(4)} ${p.slug.padEnd(28)}  ${p.name.padEnd(29)}  ${p.doc_count}`);
  }
  return 0;
}

// ── commands: doc ─────────────────────────────────────────────
async function cmdDocList(db, projectId, flags) {
  const rows = await docs.list(db, projectId, { type: flags['--type'], status: flags['--status'] });
  if (flags['--json']) { printJson(rows); return 0; }
  if (!rows.length) { out('No documents.'); return 0; }
  out('ID   TYPE            STATUS        DOCUMENT');
  out('---  --------------  ------------  ------------------------------');
  for (const d of rows) {
    out(`${String(d.id).padEnd(4)} ${d.type.padEnd(14)}  ${d.status.padEnd(12)}  ${docLabel(d)}`);
  }
  return 0;
}

async function cmdSearch(db, projectId, flags, positionals) {
  try {
    const rows = await docs.search(db, projectId, {
      query: positionals.join(' '),
      type: flags['--type'],
      status: flags['--status'],
    });
    if (flags['--json']) { printJson(rows); return 0; }
    if (!rows.length) { out('No matching documents.'); return 0; }
    out('ID   TYPE            STATUS        DOCUMENT');
    out('---  --------------  ------------  ------------------------------');
    for (const d of rows) {
      out(`${String(d.id).padEnd(4)} ${d.type.padEnd(14)}  ${d.status.padEnd(12)}  ${docLabel(d)}`);
    }
    return 0;
  } catch (e) { err(e.message); return 1; }
}

async function cmdDocShow(db, projectId, flags, positionals) {
  const idOrSlug = positionals[0];
  if (!idOrSlug) { err('doc show requires <id|slug>'); return 1; }
  const row = await docs.resolve(db, projectId, idOrSlug);
  if (!row) { err(`no document matching '${idOrSlug}' in this project`); return 1; }
  const full = await docs.get(db, projectId, row.id);
  if (flags['--json']) { printJson(full); return 0; }
  out(`# [${full.id}] ${full.type}${full.suffix ? ' / ' + full.suffix : ''} — ${full.slug}`);
  out(`status: ${full.status}   created: ${full.created_at}   updated: ${full.updated_at}`);
  if (full.outgoing.length) {
    out(`\nOutgoing relations:`);
    for (const r of full.outgoing) out(`  → ${r.target_id}  (${r.relation_type})`);
  }
  if (full.incoming.length) {
    out(`\nIncoming relations:`);
    for (const r of full.incoming) out(`  ${r.source_id} →  (${r.relation_type})`);
  }
  if (full.checklist_label) {
    out(`\n${full.checklist_label}:`);
    if (!full.checklist.length) out('  (none)');
    for (const item of full.checklist) {
      const commit = item.commit_url ? ` — ${item.commit_url}` : '';
      out(`  [${item.id}] ${item.status} ${item.text}${commit}`);
    }
  }
  out(`\n${'─'.repeat(60)}\n`);
  out(full.content || '(empty)');
  return 0;
}

async function cmdDocCreate(db, projectId, flags, positionals) {
  const [type, slug] = positionals;
  if (!type || !slug) { err('doc create requires <type> <slug>'); return 1; }
  try {
    const doc = await docs.create(db, projectId, {
      type, slug,
      suffix: flags['--suffix'],
      status: flags['--status'],
    });
    if (flags['--json']) { printJson(doc); return 0; }
    out(`✓ Created [${doc.id}] ${doc.type} — ${docLabel(doc)} (${doc.status})`);
    return 0;
  } catch (e) {
    if (e.code === 'EXISTS') { err(`already exists (id ${e.id})`); return 1; }
    err(e.message); return 1;
  }
}

async function cmdDocSetStatus(db, projectId, flags, positionals) {
  const [idStr, status] = positionals;
  if (!idStr || !status) { err('doc set-status requires <id> <STATUS>'); return 1; }
  try {
    const ok = await docs.setStatus(db, projectId, Number(idStr), status);
    if (!ok) { err(`id ${idStr} not found in this project`); return 1; }
    if (flags['--json']) { printJson({ id: Number(idStr), status }); return 0; }
    out(`✓ [${idStr}] status → ${status}`);
    return 0;
  } catch (e) { err(e.message); return 1; }
}

async function cmdDocRename(db, projectId, flags, positionals) {
  const [documentRef, newSlug] = positionals;
  if (!documentRef || !newSlug) { err('doc rename requires <id|slug> <new-slug>'); return 1; }
  const row = await docs.resolve(db, projectId, documentRef);
  if (!row) { err(`no document matching '${documentRef}' in this project`); return 1; }
  try {
    const renamed = await docs.rename(db, projectId, row.id, newSlug);
    const result = { id: renamed.id, old_slug: row.slug, slug: renamed.slug, type: renamed.type, suffix: renamed.suffix };
    if (flags['--json']) { printJson(result); return 0; }
    out(`✓ Renamed [${renamed.id}] ${row.slug} → ${renamed.slug}`);
    return 0;
  } catch (e) {
    if (e.code === 'EXISTS') { err(`already exists (id ${e.id})`); return 1; }
    err(e.message); return 1;
  }
}

async function cmdDocChecklist(db, projectId, flags, positionals) {
  const subcommand = positionals[0];

  if (subcommand === 'list') {
    const documentRef = positionals[1];
    if (!documentRef) { err('doc checklist list requires <id|slug>'); return 1; }
    const row = await docs.resolve(db, projectId, documentRef);
    if (!row) { err(`no document matching '${documentRef}' in this project`); return 1; }
    try {
      if (!docs.checklistLabel(row.type)) {
        err(`document type '${row.type}' does not support checklists`);
        return 1;
      }
      const items = await docs.listChecklistItems(db, projectId, row.id);
      const result = { document_id: row.id, label: docs.checklistLabel(row.type), items };
      if (flags['--json']) { printJson(result); return 0; }
      out(`${result.label} for [${row.id}] ${docLabel(row)}`);
      if (!items.length) { out('No checklist items.'); return 0; }
      for (const item of items) {
        const commit = item.commit_url ? ` — ${item.commit_url}` : '';
        out(`  [${item.id}] ${item.status.padEnd(12)} ${item.text}${commit}`);
      }
      return 0;
    } catch (e) { err(e.message); return 1; }
  }

  if (subcommand === 'add') {
    const documentRef = positionals[1];
    const text = flags['--text'] || positionals.slice(2).join(' ');
    if (!documentRef || !text) {
      err('doc checklist add requires <id|slug> <text>');
      return 1;
    }
    const row = await docs.resolve(db, projectId, documentRef);
    if (!row) { err(`no document matching '${documentRef}' in this project`); return 1; }
    try {
      const item = await docs.createChecklistItem(db, projectId, row.id, {
        text,
        status: flags['--status'],
        commitUrl: flags['--commit'],
      });
      if (flags['--json']) { printJson(item); return 0; }
      out(`✓ Added checklist item [${item.id}] to ${docLabel(row)} (${item.status})`);
      return 0;
    } catch (e) { err(e.message); return 1; }
  }

  if (subcommand === 'update') {
    const itemId = positionals[1];
    if (!itemId) { err('doc checklist update requires <item-id>'); return 1; }
    const changes = {};
    if (flags['--text'] !== undefined) changes.text = flags['--text'];
    if (flags['--status'] !== undefined) changes.status = flags['--status'];
    if (flags['--commit'] !== undefined) changes.commitUrl = flags['--commit'];
    if (flags['--no-commit']) changes.commitUrl = null;
    if (!Object.keys(changes).length) {
      err('doc checklist update requires --text, --status, --commit, or --no-commit');
      return 1;
    }
    try {
      const item = await docs.updateChecklistItem(db, projectId, Number(itemId), changes);
      if (!item) { err(`checklist item ${itemId} not found in this project`); return 1; }
      if (flags['--json']) { printJson(item); return 0; }
      out(`✓ Updated checklist item [${item.id}] (${item.status})`);
      return 0;
    } catch (e) { err(e.message); return 1; }
  }

  if (subcommand === 'remove') {
    const itemId = positionals[1];
    if (!itemId) { err('doc checklist remove requires <item-id>'); return 1; }
    try {
      const removed = await docs.deleteChecklistItem(db, projectId, Number(itemId));
      if (!removed) { err(`checklist item ${itemId} not found in this project`); return 1; }
      if (flags['--json']) { printJson({ id: Number(itemId), removed: true }); return 0; }
      out(`✓ Removed checklist item [${itemId}]`);
      return 0;
    } catch (e) { err(e.message); return 1; }
  }

  err(`unknown checklist subcommand '${subcommand}'. Try: list, add, update, remove`);
  return 1;
}

async function resolveDocument(db, projectId, documentRef) {
  const row = await docs.resolve(db, projectId, documentRef);
  if (!row) {
    err(`document '${documentRef}' not found in this project`);
    return null;
  }
  return row;
}

function readContentFile(filePath, { markdownOnly = false } = {}) {
  if (!filePath) throw new Error('a file path is required');
  if (markdownOnly && path.extname(filePath).toLowerCase() !== '.md') {
    throw new Error('file must have a .md extension');
  }
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`file not found: ${filePath}`);
    if (e.code === 'EISDIR') throw new Error(`path is not a file: ${filePath}`);
    throw new Error(`cannot read file '${filePath}': ${e.message}`);
  }
}

async function cmdDocUpdate(db, projectId, flags, positionals) {
  const [documentRef, filePath] = positionals;
  if (!documentRef || !filePath) {
    err('doc update requires <id|slug> <file.md>');
    return 1;
  }
  const row = await resolveDocument(db, projectId, documentRef);
  if (!row) return 1;
  let content;
  try {
    content = readContentFile(filePath, { markdownOnly: true });
  } catch (e) {
    err(e.message);
    return 1;
  }
  await docs.writeContent(db, projectId, row.id, content);
  const result = {
    id: row.id,
    slug: row.slug,
    type: row.type,
    suffix: row.suffix,
    file: filePath,
    bytes: Buffer.byteLength(content),
  };
  if (flags['--json']) { printJson(result); return 0; }
  out(`✓ Updated [${row.id}] ${docLabel(row)} from ${filePath} (${result.bytes} bytes)`);
  return 0;
}

async function cmdDocWrite(db, projectId, flags, positionals) {
  const documentRef = positionals[0];
  if (!documentRef) { err('doc write requires <id|slug>'); return 1; }
  const row = await resolveDocument(db, projectId, documentRef);
  if (!row) return 1;
  let content;
  if (flags['--stdin']) {
    content = fs.readFileSync(0, 'utf-8');
  } else if (flags['--file']) {
    try {
      content = readContentFile(flags['--file']);
    } catch (e) {
      err(e.message);
      return 1;
    }
  } else {
    err('doc write requires --file <path> or --stdin'); return 1;
  }
  await docs.writeContent(db, projectId, row.id, content);
  if (flags['--json']) { printJson({ id: row.id, bytes: Buffer.byteLength(content) }); return 0; }
  out(`✓ Wrote ${Buffer.byteLength(content)} bytes to [${row.id}]`);
  return 0;
}

async function cmdDocEdit(db, projectId, flags, positionals) {
  err('doc edit is deprecated; use `doc update <id|slug> <file.md> --project <p>` for CLI/agents or `syntagraphia ui` for human editing');
  return 1;
}

async function cmdRelate(db, projectId, flags, positionals) {
  const [src, tgt, relType] = positionals;
  if (!src || !tgt || !relType) { err('relate requires <source-id> <target-id> <type>'); return 1; }
  try {
    const created = await docs.relate(db, projectId, Number(src), Number(tgt), relType);
    if (flags['--json']) { printJson({ source_id: Number(src), target_id: Number(tgt), relation_type: relType, created }); return 0; }
    out(created ? `✓ ${src} →${relType}→ ${tgt}` : `• relation already exists: ${src} →${relType}→ ${tgt}`);
    return 0;
  } catch (e) { err(e.message); return 1; }
}

async function cmdUnrelate(db, projectId, flags, positionals) {
  const [src, tgt] = positionals;
  if (!src || !tgt) { err('unrelate requires <source-id> <target-id>'); return 1; }
  try {
    const removed = await docs.unrelate(db, projectId, Number(src), Number(tgt));
    if (flags['--json']) { printJson({ source_id: Number(src), target_id: Number(tgt), removed }); return 0; }
    if (removed) { out(`✓ Removed relation: ${src} → ${tgt}`); return 0; }
    err(`no relation found between ${src} and ${tgt}`);
    return 1;
  } catch (e) { err(e.message); return 1; }
}

async function cmdConstitutionShow(db, projectId, flags) {
  const c = await constitution.get(db, projectId);
  if (!c) {
    if (flags['--json']) { printJson({ error: 'no constitution for this project' }); return 1; }
    err('no constitution found for this project.'); return 1;
  }
  if (flags['--json']) { printJson(c); return 0; }
  out(c.content || '(empty)');
  return 0;
}

async function cmdConstitutionSet(db, projectId, flags, positionals) {
  const filePath = positionals[0];
  if (!filePath) { err('constitution set requires <file.md|file.json>'); return 1; }
  let content;
  try {
    content = constitution.readFromFile(filePath);
  } catch (e) {
    if (e.code === 'ENOENT') { err(`file not found: ${filePath}`); return 1; }
    err(`cannot read constitution file '${filePath}': ${e.message}`);
    return 1;
  }
  const saved = await constitution.set(db, projectId, content);
  const result = { id: saved.id, slug: saved.slug, file: filePath, bytes: Buffer.byteLength(content) };
  if (flags['--json']) { printJson(result); return 0; }
  out(`✓ Updated constitution from ${filePath} (${result.bytes} bytes)`);
  return 0;
}

async function cmdStatus(db, projectId, flags) {
  const all = await docs.list(db, projectId);
  const rels = await docs.listRelations(db, projectId);

  const byType = {}, byStatus = {};
  for (const d of all) {
    byType[d.type] = (byType[d.type] || 0) + 1;
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  }
  const hasParent = new Set(rels.map((r) => r.target_id));
  const orphans = all.filter((d) => (d.type === 'task' || d.type === 'verification') && !hasParent.has(d.id));
  const hasConstitution = !!all.find((d) => d.type === 'constitution');

  const summary = {
    total: all.length,
    by_type: byType,
    by_status: byStatus,
    has_constitution: hasConstitution,
    relations: rels.length,
    orphans: orphans.map((o) => ({ id: o.id, type: o.type, slug: o.slug, suffix: o.suffix })),
  };
  if (flags['--json']) { printJson(summary); return 0; }

  out(`Syntagraphia status`);
  out(`${'─'.repeat(40)}`);
  out(`Total documents : ${summary.total}`);
  out(`Constitution    : ${hasConstitution ? 'yes' : 'NO — re-capture via `project create`'}`);
  out(`Relations       : ${rels.length}`);
  out(`\nBy type:`);
  for (const t of ['constitution', 'feature', 'tech_spec', 'task', 'verification']) {
    out(`  ${t.padEnd(14)} ${(byType[t] || 0)}`);
  }
  out(`\nBy status:`);
  for (const s of docs.STATUSES) {
    out(`  ${s.padEnd(14)} ${(byStatus[s] || 0)}`);
  }
  out(`\nOrphan tasks/verifications (Rule 4): ${orphans.length}`);
  for (const o of orphans) out(`  • [${o.id}] ${o.type} — ${docLabel(o)}`);
  return 0;
}

// ── db ────────────────────────────────────────────────────────
async function cmdDb(positionals, flags) {
  const subcommand = positionals[0];
  if (subcommand === 'status') {
    const selected = resolveDbConfig();
    const status = selected.kind === 'postgres'
      ? { kind: 'postgres', url: maskUrl(selected.url), source: selected.source }
      : { kind: 'sqlite', path: require('./paths').globalDbPath(), source: selected.source };
    if (flags['--json']) printJson(status);
    else out(status.kind === 'postgres'
      ? `Database: postgres (${status.url})${status.source === 'environment' ? ' [environment]' : ''}`
      : `Database: sqlite (${status.path})`);
    return 0;
  }

  if (subcommand !== 'use') {
    err(`unknown db subcommand '${subcommand}'. Try: status, use`);
    return 1;
  }
  const kind = positionals[1];
  if (kind === 'sqlite') {
    saveConfig({ db: { kind: 'sqlite' } });
    if (flags['--json']) printJson({ kind: 'sqlite', switched: true });
    else out('✓ Switched database backend to sqlite. Existing Postgres data was not migrated.');
    return 0;
  }
  if (kind !== 'postgres') {
    err('db use requires sqlite or postgres');
    return 1;
  }
  const url = flags['--url'];
  if (!url) { err('db use postgres requires --url <connection-string>'); return 1; }
  let db;
  try {
    db = await openDb({ kind: 'postgres', url }, { ignoreEnvironment: true });
    await db.close();
    saveConfig({ db: { kind: 'postgres', url } });
    if (flags['--json']) printJson({ kind: 'postgres', url: maskUrl(url), switched: true });
    else out(`✓ Switched database backend to postgres (${maskUrl(url)}). Existing SQLite data was not migrated.`);
    return 0;
  } catch (error) {
    if (db) await db.close().catch(() => {});
    err(error.message);
    return 1;
  }
}

// ── ui ────────────────────────────────────────────────────────
function uiServerRecordPath() {
  return require('./paths').globalUiServerPath();
}

function readUiServerRecord() {
  try {
    const record = JSON.parse(fs.readFileSync(uiServerRecordPath(), 'utf8'));
    return Number.isInteger(record.pid) && record.pid > 0 && Number.isInteger(record.port) ? record : null;
  } catch { return null; }
}

function removeUiServerRecord() {
  try { fs.unlinkSync(uiServerRecordPath()); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function isProcessRunning(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

function parseUiPort(flags) {
  const port = Number(flags['--port'] || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be an integer from 1 to 65535');
  return port;
}

async function cmdUiServe(flags) {
  const port = parseUiPort(flags);
  const app = await createApp();
  const dbPath = require('./paths').globalDbPath();
  const server = app.listen(port, () => {
    out(`✓ Syntagraphia UI running at http://localhost:${port}`);
    out(`  DB: ${dbPath}`);
    out(`  Serves all projects. Pick one from the dropdown in the header.`);
    out(`  Press Ctrl+C to stop.`);
    if (!flags['--no-open']) openBrowser(`http://localhost:${port}`);
  });
  const shutdown = () => {
    server.close(async () => {
      await app.locals.db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return null; // long-running
}

function cmdUiStart(flags) {
  const port = parseUiPort(flags);
  const existing = readUiServerRecord();
  if (existing && isProcessRunning(existing.pid)) {
    err(`UI is already running at http://localhost:${existing.port} (PID ${existing.pid}). Use \`syntagraphia ui stop\` first.`);
    return 1;
  }
  if (existing) removeUiServerRecord();

  const child = spawn(process.execPath, [process.argv[1], 'ui', 'serve', '--port', String(port), '--no-open'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  const record = { pid: child.pid, port, started_at: new Date().toISOString() };
  fs.writeFileSync(uiServerRecordPath(), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(uiServerRecordPath(), 0o600); } catch { /* best effort */ }
  const result = { ...record, url: `http://localhost:${port}`, started: true };
  if (flags['--json']) { printJson(result); return 0; }
  out(`✓ Syntagraphia UI started at ${result.url} (PID ${child.pid})`);
  out('  Stop it with `syntagraphia ui stop`.');
  if (!flags['--no-open']) openBrowser(result.url);
  return 0;
}

async function cmdUiStop(flags) {
  const record = readUiServerRecord();
  if (!record) {
    const result = { stopped: false, reason: 'not running' };
    if (flags['--json']) { printJson(result); return 0; }
    out('• No background UI server is running.');
    return 0;
  }
  if (!isProcessRunning(record.pid)) {
    removeUiServerRecord();
    const result = { ...record, stopped: false, reason: 'stale record' };
    if (flags['--json']) { printJson(result); return 0; }
    out('• Removed a stale background UI server record.');
    return 0;
  }
  process.kill(record.pid, 'SIGTERM');
  for (let attempt = 0; attempt < 20 && isProcessRunning(record.pid); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (isProcessRunning(record.pid)) {
    err(`UI process ${record.pid} did not stop within 1 second.`);
    return 1;
  }
  removeUiServerRecord();
  const result = { ...record, stopped: true };
  if (flags['--json']) { printJson(result); return 0; }
  out(`✓ Stopped Syntagraphia UI (PID ${record.pid}).`);
  return 0;
}

async function cmdUi(positionals, flags) {
  const subcommand = positionals[0];
  if (!subcommand || subcommand === 'serve') return cmdUiServe(flags);
  if (subcommand === 'start') return cmdUiStart(flags);
  if (subcommand === 'stop') return cmdUiStop(flags);
  err(`unknown ui subcommand '${subcommand}'. Try: start, stop`);
  return 1;
}

function openBrowser(url) {
  try {
    const cmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start ""'
      : 'xdg-open';
    spawnSync(cmd, [url], { stdio: 'ignore', shell: process.platform === 'win32' });
  } catch { /* ignore */ }
}

// ── router ────────────────────────────────────────────────────
async function main(argv) {
  const { positionals, flags } = parseArgs(argv);

  if (flags['--help'] || flags['-h'] || (positionals.length === 0 && Object.keys(flags).length === 0)) {
    printUsage();
    return 0;
  }
  if (flags['--version'] || flags['-v']) {
    const pkg = require('../package.json');
    out(`syntagraphia ${pkg.version}`);
    return 0;
  }
  const cmd = positionals[0];

  try {
    switch (cmd) {
      case 'project': {
        const sub = positionals[1];
        const rest = positionals.slice(2);
        switch (sub) {
          case 'create': return await cmdProjectCreate(flags, rest);
          case 'list':   return await cmdProjectList(flags);
          default:       err(`unknown project subcommand '${sub}'. Try: create, list`); return 1;
        }
      }
      case 'doc': {
        const db = await openDb();
        const p = await requireProject(db, flags);
        if (!p) { await db.close?.(); return 1; }
        const sub = positionals[1];
        const rest = positionals.slice(2);
        let rc;
        switch (sub) {
          case 'list':       rc = await cmdDocList(db, p.id, flags); break;
          case 'show':       rc = await cmdDocShow(db, p.id, flags, rest); break;
          case 'create':     rc = await cmdDocCreate(db, p.id, flags, rest); break;
          case 'set-status': rc = await cmdDocSetStatus(db, p.id, flags, rest); break;
          case 'rename':     rc = await cmdDocRename(db, p.id, flags, rest); break;
          case 'checklist':  rc = await cmdDocChecklist(db, p.id, flags, rest); break;
          case 'update':     rc = await cmdDocUpdate(db, p.id, flags, rest); break;
          case 'write':      rc = await cmdDocWrite(db, p.id, flags, rest); break;
          case 'edit':       rc = await cmdDocEdit(db, p.id, flags, rest); break;
          default:           err(`unknown doc subcommand '${sub}'. Try: list, show, create, set-status, rename, checklist, update, write, edit`); rc = 1;
        }
        await db.close?.();
        return rc;
      }
      case 'relate': {
        const db = await openDb();
        const p = await requireProject(db, flags);
        if (!p) { await db.close?.(); return 1; }
        const rc = await cmdRelate(db, p.id, flags, positionals.slice(1));
        await db.close?.();
        return rc;
      }
      case 'unrelate': {
        const db = await openDb();
        const p = await requireProject(db, flags);
        if (!p) { await db.close?.(); return 1; }
        const rc = await cmdUnrelate(db, p.id, flags, positionals.slice(1));
        await db.close?.();
        return rc;
      }
      case 'constitution': {
        const db = await openDb();
        const p = await requireProject(db, flags);
        if (!p) { await db.close?.(); return 1; }
        const sub = positionals[1];
        let rc;
        if (sub === 'show') rc = await cmdConstitutionShow(db, p.id, flags);
        else if (sub === 'set') rc = await cmdConstitutionSet(db, p.id, flags, positionals.slice(2));
        else { err(`unknown constitution subcommand '${sub}'. Try: show, set`); rc = 1; }
        await db.close?.();
        return rc;
      }
      case 'status': {
        const db = await openDb();
        const p = await requireProject(db, flags);
        if (!p) { await db.close?.(); return 1; }
        const rc = await cmdStatus(db, p.id, flags);
        await db.close?.();
        return rc;
      }
      case 'search': {
        const db = await openDb();
        const p = await requireProject(db, flags);
        if (!p) { await db.close?.(); return 1; }
        const rc = await cmdSearch(db, p.id, flags, positionals.slice(1));
        await db.close?.();
        return rc;
      }
      case 'db':
        return await cmdDb(positionals.slice(1), flags);
      case 'template':
        return cmdTemplate(positionals.slice(1), flags);
      case 'ui':
        return await cmdUi(positionals.slice(1), flags);
      default:
        err(`unknown command '${cmd}'. Run 'syntagraphia --help'.`); return 1;
    }
  } catch (e) {
    err(e.message);
    return 1;
  }
}

module.exports = { main };
