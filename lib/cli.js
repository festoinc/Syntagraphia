'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { resolveRootDir } = require('./paths');
const { openDb } = require('./db');
const docs = require('./documents');
const constitution = require('./constitution');
const { createApp } = require('./server');

const INSTRUCTIONS_PATH = path.join(__dirname, '..', 'templates', 'instructions.md');

// ── arg parsing ───────────────────────────────────────────────
const VALUE_FLAGS = new Set(['--dir', '--type', '--status', '--suffix', '--file', '--port', '--constitution-file']);
const BOOL_FLAGS = new Set(['--json', '--stdin', '--no-open', '--force', '--instructions', '--help', '-h', '--version', '-v']);

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

// ── usage / instructions ──────────────────────────────────────
function printUsage() {
  out(`Syntagraphia — structured, connected project docs in a local SQLite DB.

Usage: syntagraphia <command> [options]

Commands:
  init [--dir <path>] [--force] [--constitution-file <path>]
                                              Create the DB and capture the constitution
  instructions, --instructions                Print agent-facing instructions
  doc list   [--type <t>] [--status <s>]      List documents
  doc show   <id|slug>                         Show a document (with content + relations)
  doc create <type> <slug> [--suffix <s>]      Create a document from a template
              [--status <STATUS>]
  doc set-status <id> <STATUS>                 Change a document's status
  doc write  <id> --file <path> | --stdin      Overwrite a document's content
  doc edit   <id>                              Open \$EDITOR to edit a document's content
  relate <source-id> <target-id> <type>        Link two documents
  constitution show                            Show the constitution
  status                                       Dashboard summary + orphan check
  ui [--port 3001] [--no-open]                 Start the web UI (long-running)

Common: --dir <path>, --json. Env: SYNTAGRAPHIA_DIR. Run 'syntagraphia instructions' for the
full agent workflow. Node >= 22 required.`);
}

function printInstructions() {
  process.stdout.write(fs.readFileSync(INSTRUCTIONS_PATH, 'utf-8'));
}

// ── commands ──────────────────────────────────────────────────
function cmdInit(rootDir, flags) {
  const db = openDb(rootDir);
  const existing = constitution.get(db);

  if (existing && !flags['--force']) {
    out(`Already initialized at ${rootDir} (constitution present).`);
    out(`Re-run with --force to re-capture the constitution, or 'syntagraphia constitution show' to view it.`);
    db.close?.();
    return 0;
  }

  let content;
  if (flags['--constitution-file']) {
    const f = flags['--constitution-file'];
    if (!fs.existsSync(f)) { err(`constitution file not found: ${f}`); return 1; }
    content = constitution.readFromFile(f);
  } else if (!process.stdin.isTTY) {
    err('Non-interactive shell: provide --constitution-file <path> (markdown or JSON).');
    return 1;
  } else {
    content = interactiveConstitution();
  }

  constitution.set(db, content);
  out(`✓ Initialized Syntagraphia at ${rootDir}`);
  out(`  DB: ${path.join(rootDir, 'project-tracker.db')}`);
  out(`  Constitution captured (${content.length} chars).`);
  db.close?.();
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
    process.stdout.write('=== Syntagraphia init — capture your project constitution ===\n');
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

function cmdDocList(db, flags) {
  const rows = docs.list(db, { type: flags['--type'], status: flags['--status'] });
  if (flags['--json']) { printJson(rows); return 0; }
  if (!rows.length) { out('No documents.'); return 0; }
  out('ID   TYPE            STATUS        DOCUMENT');
  out('---  --------------  ------------  ------------------------------');
  for (const d of rows) {
    out(`${String(d.id).padEnd(4)} ${d.type.padEnd(14)}  ${d.status.padEnd(12)}  ${docLabel(d)}`);
  }
  return 0;
}

function cmdDocShow(db, flags, positionals) {
  const idOrSlug = positionals[0];
  if (!idOrSlug) { err('doc show requires <id|slug>'); return 1; }
  const row = docs.resolve(db, idOrSlug);
  if (!row) { err(`no document matching '${idOrSlug}'`); return 1; }
  const full = docs.get(db, row.id);
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
  out(`\n${'─'.repeat(60)}\n`);
  out(full.content || '(empty)');
  return 0;
}

function cmdDocCreate(db, flags, positionals) {
  const [type, slug] = positionals;
  if (!type || !slug) { err('doc create requires <type> <slug>'); return 1; }
  try {
    const doc = docs.create(db, {
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

function cmdDocSetStatus(db, flags, positionals) {
  const [idStr, status] = positionals;
  if (!idStr || !status) { err('doc set-status requires <id> <STATUS>'); return 1; }
  try {
    const ok = docs.setStatus(db, Number(idStr), status);
    if (!ok) { err(`id ${idStr} not found`); return 1; }
    if (flags['--json']) { printJson({ id: Number(idStr), status }); return 0; }
    out(`✓ [${idStr}] status → ${status}`);
    return 0;
  } catch (e) { err(e.message); return 1; }
}

function cmdDocWrite(db, flags, positionals) {
  const idStr = positionals[0];
  if (!idStr) { err('doc write requires <id>'); return 1; }
  let content;
  if (flags['--stdin']) {
    content = fs.readFileSync(0, 'utf-8');
  } else if (flags['--file']) {
    if (!fs.existsSync(flags['--file'])) { err(`file not found: ${flags['--file']}`); return 1; }
    content = fs.readFileSync(flags['--file'], 'utf-8');
  } else {
    err('doc write requires --file <path> or --stdin'); return 1;
  }
  const ok = docs.writeContent(db, Number(idStr), content);
  if (!ok) { err(`id ${idStr} not found`); return 1; }
  if (flags['--json']) { printJson({ id: Number(idStr), bytes: Buffer.byteLength(content) }); return 0; }
  out(`✓ Wrote ${Buffer.byteLength(content)} bytes to [${idStr}]`);
  return 0;
}

function cmdDocEdit(db, flags, positionals) {
  const idStr = positionals[0];
  if (!idStr) { err('doc edit requires <id>'); return 1; }
  const row = docs.get(db, Number(idStr));
  if (!row) { err(`id ${idStr} not found`); return 1; }
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  const tmp = path.join(os.tmpdir(), `syntagraphia-${row.id}-${Date.now()}.md`);
  fs.writeFileSync(tmp, row.content || '', 'utf-8');
  const r = spawnSync(editor, [tmp], { stdio: 'inherit' });
  if (r.status !== 0) { err(`editor exited with status ${r.status}`); fs.unlinkSync(tmp); return 1; }
  const content = fs.readFileSync(tmp, 'utf-8');
  fs.unlinkSync(tmp);
  docs.writeContent(db, row.id, content);
  if (flags['--json']) { printJson({ id: row.id, bytes: Buffer.byteLength(content) }); return 0; }
  out(`✓ Saved edits to [${row.id}]`);
  return 0;
}

function cmdRelate(db, flags, positionals) {
  const [src, tgt, relType] = positionals;
  if (!src || !tgt || !relType) { err('relate requires <source-id> <target-id> <type>'); return 1; }
  try {
    const created = docs.relate(db, Number(src), Number(tgt), relType);
    if (flags['--json']) { printJson({ source_id: Number(src), target_id: Number(tgt), relation_type: relType, created }); return 0; }
    out(created ? `✓ ${src} →${relType}→ ${tgt}` : `• relation already exists: ${src} →${relType}→ ${tgt}`);
    return 0;
  } catch (e) { err(e.message); return 1; }
}

function cmdConstitutionShow(db, flags) {
  const c = constitution.get(db);
  if (!c) {
    if (flags['--json']) { printJson({ error: 'no constitution; run `syntagraphia init`' }); return 1; }
    err('no constitution found. Run `syntagraphia init` first.'); return 1;
  }
  if (flags['--json']) { printJson(c); return 0; }
  out(c.content || '(empty)');
  return 0;
}

function cmdStatus(db, flags) {
  const all = docs.list(db);
  const rels = docs.listRelations(db);

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
  out(`Constitution    : ${hasConstitution ? 'yes' : 'NO — run `syntagraphia init`'}`);
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

function cmdUi(rootDir, flags) {
  const port = Number(flags['--port'] || 3001);
  const app = createApp(rootDir);
  const server = app.listen(port, () => {
    out(`✓ Syntagraphia UI running at http://localhost:${port}`);
    out(`  DB: ${path.join(rootDir, 'project-tracker.db')}`);
    out(`  Press Ctrl+C to stop.`);
    if (!flags['--no-open']) openBrowser(`http://localhost:${port}`);
  });
  const shutdown = () => { server.close(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return null; // long-running
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
function main(argv) {
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
  if (flags['--instructions'] || positionals[0] === 'instructions') {
    printInstructions();
    return 0;
  }

  const rootDir = resolveRootDir(flags['--dir']);
  const cmd = positionals[0];

  try {
    switch (cmd) {
      case 'init':
        return cmdInit(rootDir, flags); // opens its own db handle internally
      case 'doc': {
        const db = openDb(rootDir);
        const sub = positionals[1];
        const rest = positionals.slice(2);
        switch (sub) {
          case 'list':       return cmdDocList(db, flags);
          case 'show':       return cmdDocShow(db, flags, rest);
          case 'create':     return cmdDocCreate(db, flags, rest);
          case 'set-status': return cmdDocSetStatus(db, flags, rest);
          case 'write':      return cmdDocWrite(db, flags, rest);
          case 'edit':       return cmdDocEdit(db, flags, rest);
          default:           err(`unknown doc subcommand '${sub}'. Try: list, show, create, set-status, write, edit`); return 1;
        }
      }
      case 'relate': {
        const db = openDb(rootDir);
        return cmdRelate(db, flags, positionals.slice(1));
      }
      case 'constitution': {
        const db = openDb(rootDir);
        const sub = positionals[1];
        if (sub === 'show') return cmdConstitutionShow(db, flags);
        err(`unknown constitution subcommand '${sub}'. Try: show`); return 1;
      }
      case 'status': {
        const db = openDb(rootDir);
        return cmdStatus(db, flags);
      }
      case 'ui':
        return cmdUi(rootDir, flags);
      default:
        err(`unknown command '${cmd}'. Run 'syntagraphia --help'.`); return 1;
    }
  } catch (e) {
    err(e.message);
    return 1;
  }
}

module.exports = { main };
