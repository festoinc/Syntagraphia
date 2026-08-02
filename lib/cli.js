'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { openDb } = require('./db');
const docs = require('./documents');
const projects = require('./projects');
const constitution = require('./constitution');
const { createApp } = require('./server');

const INSTRUCTIONS_PATH = path.join(__dirname, '..', 'templates', 'instructions.md');

// ── arg parsing ───────────────────────────────────────────────
const VALUE_FLAGS = new Set(['--project', '--type', '--status', '--suffix', '--file', '--port', '--constitution-file', '--name', '--text', '--commit']);
const BOOL_FLAGS = new Set(['--json', '--stdin', '--no-open', '--no-commit', '--force', '--instructions', '--help', '-h', '--version', '-v']);

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
  out(`Syntagraphia — structured, connected project docs in a single global SQLite DB.

Usage: syntagraphia <command> [options]

One global DB at ~/.syntagraphia/project-tracker.db holds every project on this machine.
Doc-level commands take a required --project <id|slug> to scope which project they touch.

Commands:
  project create <name> [--constitution-file <path>] [--force]
                                              Create a project and capture its constitution
                                              (refuses to duplicate an existing name; --force
                                               re-captures the constitution in place)
  project list                                List all projects on this machine
  instructions, --instructions                Print agent-facing instructions
  doc list   --project <p> [--type <t>] [--status <s>]
                                              List documents in a project
  doc show   <id|slug> --project <p>           Show a document (with content + relations)
  doc create <type> <slug> --project <p> [--suffix <s>] [--status <STATUS>]
                                              Create a document from a template
  doc set-status <id> <STATUS> --project <p>   Change a document's status
  doc checklist list <id|slug> --project <p>   List structured checklist items
  doc checklist add <id|slug> <text> --project <p> [--status] [--commit]
                                              Add a checklist item
  doc checklist update <item-id> --project <p> [--text] [--status] [--commit|--no-commit]
                                              Update a checklist item
  doc checklist remove <item-id> --project <p> Remove a checklist item
  doc write  <id> --project <p> --file <path> | --stdin
                                              Overwrite a document's content
  doc edit   <id> --project <p>                Open \$EDITOR to edit a document's content
  relate <source-id> <target-id> <type> --project <p>
                                              Link two documents (same project only)
  constitution show --project <p>             Show a project's constitution
  status --project <p>                        Dashboard summary + orphan check
  ui [--port 3001] [--no-open]                Start the web UI (serves all projects)

Common: --project <id|slug>, --json. Run 'syntagraphia instructions' for the full agent
workflow. Node >= 22 required.`);
}

function printInstructions() {
  process.stdout.write(fs.readFileSync(INSTRUCTIONS_PATH, 'utf-8'));
}

// ── project resolution helper ─────────────────────────────────
function requireProject(db, flags) {
  const idOrSlug = flags['--project'];
  if (!idOrSlug) {
    err('--project <id|slug> is required for this command. Run `syntagraphia project list` to see options.');
    return null;
  }
  const p = projects.resolve(db, idOrSlug);
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

  const db = openDb();

  // Idempotency guard: a project with the same display name already exists.
  // (The old `init` did the same — refuse to duplicate, point at the existing one.)
  const existing = projects.findByName(db, trimmed);
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
    constitution.set(db, existing.id, content);
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
    project = projects.create(db, { name });
  } catch (e) {
    err(e.message);
    return 1;
  }

  // Interactive constitution capture (TTY only, no --constitution-file).
  if (content == null) {
    content = await interactiveConstitution();
  }
  constitution.set(db, project.id, content);

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

function cmdProjectList(flags) {
  const db = openDb();
  const rows = projects.list(db);
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
function cmdDocList(db, projectId, flags) {
  const rows = docs.list(db, projectId, { type: flags['--type'], status: flags['--status'] });
  if (flags['--json']) { printJson(rows); return 0; }
  if (!rows.length) { out('No documents.'); return 0; }
  out('ID   TYPE            STATUS        DOCUMENT');
  out('---  --------------  ------------  ------------------------------');
  for (const d of rows) {
    out(`${String(d.id).padEnd(4)} ${d.type.padEnd(14)}  ${d.status.padEnd(12)}  ${docLabel(d)}`);
  }
  return 0;
}

function cmdDocShow(db, projectId, flags, positionals) {
  const idOrSlug = positionals[0];
  if (!idOrSlug) { err('doc show requires <id|slug>'); return 1; }
  const row = docs.resolve(db, projectId, idOrSlug);
  if (!row) { err(`no document matching '${idOrSlug}' in this project`); return 1; }
  const full = docs.get(db, projectId, row.id);
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

function cmdDocCreate(db, projectId, flags, positionals) {
  const [type, slug] = positionals;
  if (!type || !slug) { err('doc create requires <type> <slug>'); return 1; }
  try {
    const doc = docs.create(db, projectId, {
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

function cmdDocSetStatus(db, projectId, flags, positionals) {
  const [idStr, status] = positionals;
  if (!idStr || !status) { err('doc set-status requires <id> <STATUS>'); return 1; }
  try {
    const ok = docs.setStatus(db, projectId, Number(idStr), status);
    if (!ok) { err(`id ${idStr} not found in this project`); return 1; }
    if (flags['--json']) { printJson({ id: Number(idStr), status }); return 0; }
    out(`✓ [${idStr}] status → ${status}`);
    return 0;
  } catch (e) { err(e.message); return 1; }
}

function cmdDocChecklist(db, projectId, flags, positionals) {
  const subcommand = positionals[0];

  if (subcommand === 'list') {
    const documentRef = positionals[1];
    if (!documentRef) { err('doc checklist list requires <id|slug>'); return 1; }
    const row = docs.resolve(db, projectId, documentRef);
    if (!row) { err(`no document matching '${documentRef}' in this project`); return 1; }
    try {
      if (!docs.checklistLabel(row.type)) {
        err(`document type '${row.type}' does not support checklists`);
        return 1;
      }
      const items = docs.listChecklistItems(db, projectId, row.id);
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
    const row = docs.resolve(db, projectId, documentRef);
    if (!row) { err(`no document matching '${documentRef}' in this project`); return 1; }
    try {
      const item = docs.createChecklistItem(db, projectId, row.id, {
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
      const item = docs.updateChecklistItem(db, projectId, Number(itemId), changes);
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
      const removed = docs.deleteChecklistItem(db, projectId, Number(itemId));
      if (!removed) { err(`checklist item ${itemId} not found in this project`); return 1; }
      if (flags['--json']) { printJson({ id: Number(itemId), removed: true }); return 0; }
      out(`✓ Removed checklist item [${itemId}]`);
      return 0;
    } catch (e) { err(e.message); return 1; }
  }

  err(`unknown checklist subcommand '${subcommand}'. Try: list, add, update, remove`);
  return 1;
}

function cmdDocWrite(db, projectId, flags, positionals) {
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
  const ok = docs.writeContent(db, projectId, Number(idStr), content);
  if (!ok) { err(`id ${idStr} not found in this project`); return 1; }
  if (flags['--json']) { printJson({ id: Number(idStr), bytes: Buffer.byteLength(content) }); return 0; }
  out(`✓ Wrote ${Buffer.byteLength(content)} bytes to [${idStr}]`);
  return 0;
}

function cmdDocEdit(db, projectId, flags, positionals) {
  const idStr = positionals[0];
  if (!idStr) { err('doc edit requires <id>'); return 1; }
  const row = docs.get(db, projectId, Number(idStr));
  if (!row) { err(`id ${idStr} not found in this project`); return 1; }
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  const tmp = path.join(os.tmpdir(), `syntagraphia-${row.id}-${Date.now()}.md`);
  fs.writeFileSync(tmp, row.content || '', 'utf-8');
  const r = spawnSync(editor, [tmp], { stdio: 'inherit' });
  if (r.status !== 0) { err(`editor exited with status ${r.status}`); fs.unlinkSync(tmp); return 1; }
  const content = fs.readFileSync(tmp, 'utf-8');
  fs.unlinkSync(tmp);
  docs.writeContent(db, projectId, row.id, content);
  if (flags['--json']) { printJson({ id: row.id, bytes: Buffer.byteLength(content) }); return 0; }
  out(`✓ Saved edits to [${row.id}]`);
  return 0;
}

function cmdRelate(db, projectId, flags, positionals) {
  const [src, tgt, relType] = positionals;
  if (!src || !tgt || !relType) { err('relate requires <source-id> <target-id> <type>'); return 1; }
  try {
    const created = docs.relate(db, projectId, Number(src), Number(tgt), relType);
    if (flags['--json']) { printJson({ source_id: Number(src), target_id: Number(tgt), relation_type: relType, created }); return 0; }
    out(created ? `✓ ${src} →${relType}→ ${tgt}` : `• relation already exists: ${src} →${relType}→ ${tgt}`);
    return 0;
  } catch (e) { err(e.message); return 1; }
}

function cmdConstitutionShow(db, projectId, flags) {
  const c = constitution.get(db, projectId);
  if (!c) {
    if (flags['--json']) { printJson({ error: 'no constitution for this project' }); return 1; }
    err('no constitution found for this project.'); return 1;
  }
  if (flags['--json']) { printJson(c); return 0; }
  out(c.content || '(empty)');
  return 0;
}

function cmdStatus(db, projectId, flags) {
  const all = docs.list(db, projectId);
  const rels = docs.listRelations(db, projectId);

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

// ── ui ────────────────────────────────────────────────────────
function cmdUi(flags) {
  const port = Number(flags['--port'] || 3001);
  const app = createApp();
  const dbPath = require('./paths').globalDbPath();
  const server = app.listen(port, () => {
    out(`✓ Syntagraphia UI running at http://localhost:${port}`);
    out(`  DB: ${dbPath}`);
    out(`  Serves all projects. Pick one from the dropdown in the header.`);
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
  if (flags['--instructions'] || positionals[0] === 'instructions') {
    printInstructions();
    return 0;
  }

  const cmd = positionals[0];

  try {
    switch (cmd) {
      case 'project': {
        const sub = positionals[1];
        const rest = positionals.slice(2);
        switch (sub) {
          case 'create': return cmdProjectCreate(flags, rest);
          case 'list':   return cmdProjectList(flags);
          default:       err(`unknown project subcommand '${sub}'. Try: create, list`); return 1;
        }
      }
      case 'doc': {
        const db = openDb();
        const p = requireProject(db, flags);
        if (!p) { db.close?.(); return 1; }
        const sub = positionals[1];
        const rest = positionals.slice(2);
        let rc;
        switch (sub) {
          case 'list':       rc = cmdDocList(db, p.id, flags); break;
          case 'show':       rc = cmdDocShow(db, p.id, flags, rest); break;
          case 'create':     rc = cmdDocCreate(db, p.id, flags, rest); break;
          case 'set-status': rc = cmdDocSetStatus(db, p.id, flags, rest); break;
          case 'checklist':  rc = cmdDocChecklist(db, p.id, flags, rest); break;
          case 'write':      rc = cmdDocWrite(db, p.id, flags, rest); break;
          case 'edit':       rc = cmdDocEdit(db, p.id, flags, rest); break;
          default:           err(`unknown doc subcommand '${sub}'. Try: list, show, create, set-status, checklist, write, edit`); rc = 1;
        }
        db.close?.();
        return rc;
      }
      case 'relate': {
        const db = openDb();
        const p = requireProject(db, flags);
        if (!p) { db.close?.(); return 1; }
        const rc = cmdRelate(db, p.id, flags, positionals.slice(1));
        db.close?.();
        return rc;
      }
      case 'constitution': {
        const db = openDb();
        const p = requireProject(db, flags);
        if (!p) { db.close?.(); return 1; }
        const sub = positionals[1];
        let rc;
        if (sub === 'show') rc = cmdConstitutionShow(db, p.id, flags);
        else { err(`unknown constitution subcommand '${sub}'. Try: show`); rc = 1; }
        db.close?.();
        return rc;
      }
      case 'status': {
        const db = openDb();
        const p = requireProject(db, flags);
        if (!p) { db.close?.(); return 1; }
        const rc = cmdStatus(db, p.id, flags);
        db.close?.();
        return rc;
      }
      case 'ui':
        return cmdUi(flags);
      default:
        err(`unknown command '${cmd}'. Run 'syntagraphia --help'.`); return 1;
    }
  } catch (e) {
    err(e.message);
    return 1;
  }
}

module.exports = { main };
