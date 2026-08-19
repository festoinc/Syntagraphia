'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'syntagraphia.js');

function createSandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'syntagraphia-cli-'));
  return {
    home,
    write(name, content) {
      const filePath = path.join(home, name);
      fs.writeFileSync(filePath, content, 'utf-8');
      return filePath;
    },
  };
}

function run(home, ...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, HOME: home },
    encoding: 'utf-8',
  });
}

function createProject(sandbox, name = 'Test Project') {
  const constitution = sandbox.write(`${name}.md`, '# Constitution\n');
  const result = run(
    sandbox.home,
    'project', 'create', name,
    '--constitution-file', constitution,
    '--json',
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function createDocument(sandbox, project, typeOrSlug, slug) {
  const type = slug === undefined ? 'feature' : typeOrSlug;
  const documentSlug = slug === undefined ? (typeOrSlug || 'user-auth') : slug;
  const result = run(
    sandbox.home,
    'doc', 'create', type, documentSlug,
    '--project', project.slug,
    '--json',
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForUrl(url, timeoutMs = 2000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`UI did not start at ${url}`);
}

test('agent instructions are provided as an editable template, not a CLI command', () => {
  const templatePath = path.join(ROOT, 'AGENTS_template.md');
  assert.equal(fs.existsSync(templatePath), true);
  const template = fs.readFileSync(templatePath, 'utf8');
  assert.match(template, /^# Syntagraphia Agent Workflow/m);
  assert.match(template, /Run every document command with `--project <project>`/);
  assert.doesNotMatch(template, /syntagraphia (?:--instructions|instructions)/);

  const help = run(createSandbox().home, '--help');
  assert.equal(help.status, 0, help.stderr);
  assert.doesNotMatch(help.stdout, /syntagraphia (?:--instructions|instructions)/);

  const removedCommand = run(createSandbox().home, 'instructions');
  assert.equal(removedCommand.status, 1);
  assert.match(removedCommand.stderr, /unknown command/);

  const removedFlag = run(createSandbox().home, '--instructions');
  assert.equal(removedFlag.status, 1);
  assert.match(removedFlag.stderr, /unknown command/);
});

test('document templates can be listed, overridden, used, and reset', () => {
  const sandbox = createSandbox();
  const project = createProject(sandbox, 'Template Project');

  const initial = run(sandbox.home, 'template', 'list', '--json');
  assert.equal(initial.status, 0, initial.stderr);
  assert.deepEqual(JSON.parse(initial.stdout).map(template => template.source), [
    'default', 'default', 'default', 'default',
  ]);

  const customTemplates = [
    ['feature', 'custom-feature', undefined],
    ['tech_spec', 'custom-spec', undefined],
    ['task', 'custom-task', 'backend'],
    ['verification', 'custom-verification', undefined],
  ];
  for (const [type] of customTemplates) {
    const file = sandbox.write(`${type}.md`, `# Custom ${type} — {{slug}}{{suffix_label}}\nTemplate suffix: {{suffix}}\n`);
    const set = run(sandbox.home, 'template', 'set', type, file, '--json');
    assert.equal(set.status, 0, set.stderr);
    assert.equal(JSON.parse(set.stdout).source, 'custom');
  }

  const listed = run(sandbox.home, 'template', 'list', '--json');
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).map(template => template.source), [
    'custom', 'custom', 'custom', 'custom',
  ]);

  for (const [type, slug, suffix] of customTemplates) {
    const args = ['doc', 'create', type, slug, '--project', project.slug, '--json'];
    if (suffix) args.splice(4, 0, '--suffix', suffix);
    const created = run(sandbox.home, ...args);
    assert.equal(created.status, 0, created.stderr);
    const document = JSON.parse(created.stdout);
    assert.match(document.content, new RegExp(`# Custom ${type} — ${slug}${suffix ? ' \\(backend\\)' : ''}`));
    assert.match(document.content, new RegExp(`Template suffix: ${suffix || ''}`));
  }

  const shown = run(sandbox.home, 'template', 'show', 'task', '--json');
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).source, 'custom');
  assert.match(JSON.parse(shown.stdout).content, /\{\{suffix_label\}\}/);

  const reset = run(sandbox.home, 'template', 'reset', 'feature', '--json');
  assert.equal(reset.status, 0, reset.stderr);
  assert.deepEqual(JSON.parse(reset.stdout), { type: 'feature', source: 'default', removed: true });

  const afterReset = run(sandbox.home, 'doc', 'create', 'feature', 'default-feature', '--project', project.slug, '--json');
  assert.equal(afterReset.status, 0, afterReset.stderr);
  assert.match(JSON.parse(afterReset.stdout).content, /^# Feature — default-feature/);
  assert.doesNotMatch(JSON.parse(afterReset.stdout).content, /Custom feature/);
});

test('template commands validate types and Markdown input files', () => {
  const sandbox = createSandbox();
  const invalidType = run(sandbox.home, 'template', 'show', 'constitution');
  assert.equal(invalidType.status, 1);
  assert.match(invalidType.stderr, /Invalid template type/);

  const invalidExtension = sandbox.write('template.txt', '# Invalid\n');
  const extensionResult = run(sandbox.home, 'template', 'set', 'feature', invalidExtension);
  assert.equal(extensionResult.status, 1);
  assert.match(extensionResult.stderr, /\.md extension/);

  const missing = run(sandbox.home, 'template', 'set', 'feature', path.join(sandbox.home, 'missing.md'));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /file not found/);

  const invalidReset = run(sandbox.home, 'template', 'reset', 'constitution');
  assert.equal(invalidReset.status, 1);
  assert.match(invalidReset.stderr, /Invalid template type/);
});

test('constitution can be shown and replaced from Markdown or JSON', () => {
  const sandbox = createSandbox();
  const project = createProject(sandbox, 'Constitution Commands');
  const shown = run(sandbox.home, 'constitution', 'show', '--project', project.slug, '--json');
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).content, '# Constitution\n');

  const markdown = sandbox.write('constitution.md', '# Updated Constitution\n');
  const updated = run(sandbox.home, 'constitution', 'set', markdown, '--project', project.slug, '--json');
  assert.equal(updated.status, 0, updated.stderr);
  assert.equal(JSON.parse(updated.stdout).bytes, Buffer.byteLength('# Updated Constitution\n'));

  const json = sandbox.write('constitution.json', JSON.stringify({ Vision: 'Make project context clear.' }));
  const jsonUpdate = run(sandbox.home, 'constitution', 'set', json, '--project', project.slug);
  assert.equal(jsonUpdate.status, 0, jsonUpdate.stderr);
  const afterJson = run(sandbox.home, 'constitution', 'show', '--project', project.slug);
  assert.match(afterJson.stdout, /## Vision\nMake project context clear\./);
});

test('ui start runs in the background and ui stop terminates it', async () => {
  const sandbox = createSandbox();
  const port = await availablePort();
  const started = run(sandbox.home, 'ui', 'start', '--port', String(port), '--no-open', '--json');
  assert.equal(started.status, 0, started.stderr);
  const server = JSON.parse(started.stdout);
  assert.equal(server.port, port);
  assert.equal(server.started, true);
  await waitForUrl(server.url);

  try {
    const duplicate = run(sandbox.home, 'ui', 'start', '--port', String(port), '--no-open');
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /already running/);
  } finally {
    const stopped = run(sandbox.home, 'ui', 'stop', '--json');
    assert.equal(stopped.status, 0, stopped.stderr);
    assert.equal(JSON.parse(stopped.stdout).stopped, true);
  }

  const secondStop = run(sandbox.home, 'ui', 'stop', '--json');
  assert.equal(secondStop.status, 0, secondStop.stderr);
  assert.equal(JSON.parse(secondStop.stdout).reason, 'not running');
});

test('checklists support type labels, ordering, statuses, and commit links', () => {
  const sandbox = createSandbox();
  const project = createProject(sandbox, 'Checklist Project');
  const feature = createDocument(sandbox, project, 'feature', 'user-auth');
  const task = createDocument(sandbox, project, 'task', 'user-auth');

  const first = run(
    sandbox.home,
    'doc', 'checklist', 'add', 'user-auth', 'Login endpoint is documented',
    '--project', project.slug,
    '--status', 'IN_PROGRESS',
    '--commit', 'https://github.com/festoinc/Syntagraphia/commit/abc123',
    '--json',
  );
  assert.equal(first.status, 0, first.stderr);
  const firstItem = JSON.parse(first.stdout);
  assert.equal(firstItem.document_id, feature.id);
  assert.equal(firstItem.position, 0);
  assert.equal(firstItem.status, 'IN_PROGRESS');
  assert.equal(firstItem.commit_url, 'https://github.com/festoinc/Syntagraphia/commit/abc123');

  const second = run(
    sandbox.home,
    'doc', 'checklist', 'add', 'user-auth',
    '--text', 'Authentication flow is verified',
    '--status', 'DONE',
    '--project', project.slug,
    '--json',
  );
  assert.equal(second.status, 0, second.stderr);
  const secondItem = JSON.parse(second.stdout);
  assert.equal(secondItem.position, 1);

  const list = run(
    sandbox.home,
    'doc', 'checklist', 'list', 'user-auth',
    '--project', project.slug,
    '--json',
  );
  assert.equal(list.status, 0, list.stderr);
  const listed = JSON.parse(list.stdout);
  assert.equal(listed.label, 'Acceptance Criteria');
  assert.deepEqual(listed.items.map(item => item.id), [firstItem.id, secondItem.id]);

  const update = run(
    sandbox.home,
    'doc', 'checklist', 'update', String(firstItem.id),
    '--project', project.slug,
    '--text', 'Login endpoint and error cases are documented',
    '--status', 'REVIEW',
    '--no-commit',
    '--json',
  );
  assert.equal(update.status, 0, update.stderr);
  const updated = JSON.parse(update.stdout);
  assert.equal(updated.text, 'Login endpoint and error cases are documented');
  assert.equal(updated.status, 'REVIEW');
  assert.equal(updated.commit_url, null);

  const taskList = run(
    sandbox.home,
    'doc', 'checklist', 'list', String(task.id),
    '--project', project.slug,
    '--json',
  );
  assert.equal(taskList.status, 0, taskList.stderr);
  assert.equal(JSON.parse(taskList.stdout).label, 'Subtasks');

  const shown = run(
    sandbox.home,
    'doc', 'show', String(feature.id),
    '--project', project.slug,
    '--json',
  );
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).checklist.length, 2);

  const remove = run(
    sandbox.home,
    'doc', 'checklist', 'remove', String(secondItem.id),
    '--project', project.slug,
    '--json',
  );
  assert.equal(remove.status, 0, remove.stderr);
  assert.deepEqual(JSON.parse(remove.stdout), { id: secondItem.id, removed: true });
});

test('checklists validate input length and remain project-scoped', () => {
  const sandbox = createSandbox();
  const project = createProject(sandbox, 'Checklist Scope');
  const otherProject = createProject(sandbox, 'Other Checklist Scope');
  const feature = createDocument(sandbox, project, 'feature', 'payments');
  const constitution = run(
    sandbox.home,
    'doc', 'checklist', 'add', 'constitution', 'Not supported',
    '--project', project.slug,
  );
  assert.equal(constitution.status, 1);
  assert.match(constitution.stderr, /does not support checklists/);

  const note = run(
    sandbox.home,
    'doc', 'checklist', 'add', 'payments', 'Checklist note',
    '--project', project.slug,
    '--commit', 'Needs product review before release',
  );
  assert.equal(note.status, 0, note.stderr);

  const tooLongNote = run(
    sandbox.home,
    'doc', 'checklist', 'add', 'payments', 'Too long note',
    '--project', project.slug,
    '--commit', 'x'.repeat(256),
  );
  assert.equal(tooLongNote.status, 1);
  assert.match(tooLongNote.stderr, /255 characters/);

  const added = run(
    sandbox.home,
    'doc', 'checklist', 'add', 'payments', 'Project scoped item',
    '--project', project.slug,
    '--json',
  );
  assert.equal(added.status, 0, added.stderr);
  const item = JSON.parse(added.stdout);

  const wrongProjectUpdate = run(
    sandbox.home,
    'doc', 'checklist', 'update', String(item.id),
    '--project', otherProject.slug,
    '--status', 'DONE',
  );
  assert.equal(wrongProjectUpdate.status, 1);
  assert.match(wrongProjectUpdate.stderr, /not found in this project/);

  const list = run(
    sandbox.home,
    'doc', 'checklist', 'list', String(feature.id),
    '--project', project.slug,
    '--json',
  );
  assert.equal(list.status, 0, list.stderr);
  assert.equal(JSON.parse(list.stdout).items[0].status, 'DRAFT');
});

test('doc update replaces content by slug and ID and returns JSON metadata', () => {
  const sandbox = createSandbox();
  const project = createProject(sandbox);
  const document = createDocument(sandbox, project);
  const firstFile = sandbox.write('first.md', '# First version\n');

  const bySlug = run(
    sandbox.home,
    'doc', 'update', 'user-auth', firstFile,
    '--project', project.slug,
    '--json',
  );
  assert.equal(bySlug.status, 0, bySlug.stderr);
  assert.deepEqual(JSON.parse(bySlug.stdout), {
    id: document.id,
    slug: 'user-auth',
    type: 'feature',
    suffix: null,
    file: firstFile,
    bytes: Buffer.byteLength('# First version\n'),
  });

  const secondFile = sandbox.write('second.md', '# Second version\n');
  const byId = run(
    sandbox.home,
    'doc', 'update', String(document.id), secondFile,
    '--project', project.slug,
  );
  assert.equal(byId.status, 0, byId.stderr);
  assert.match(byId.stdout, new RegExp(`Updated \\[${document.id}\\]`));

  const shown = run(
    sandbox.home,
    'doc', 'show', String(document.id),
    '--project', project.slug,
    '--json',
  );
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).content, '# Second version\n');
});

test('doc rename changes one slug while preserving relations and checklist items', () => {
  const sandbox = createSandbox();
  const project = createProject(sandbox, 'Rename Project');
  const feature = createDocument(sandbox, project, 'feature', 'old-name');
  const task = createDocument(sandbox, project, 'task', 'old-name');
  const relation = run(sandbox.home, 'relate', String(feature.id), String(task.id), 'has_task', '--project', project.slug);
  assert.equal(relation.status, 0, relation.stderr);
  const checklist = run(sandbox.home, 'doc', 'checklist', 'add', String(feature.id), 'Keep this acceptance criterion', '--project', project.slug, '--json');
  assert.equal(checklist.status, 0, checklist.stderr);

  const renamed = run(sandbox.home, 'doc', 'rename', 'old-name', 'new-name', '--project', project.slug, '--json');
  assert.equal(renamed.status, 0, renamed.stderr);
  assert.deepEqual(JSON.parse(renamed.stdout), {
    id: feature.id, old_slug: 'old-name', slug: 'new-name', type: 'feature', suffix: null,
  });

  const shown = run(sandbox.home, 'doc', 'show', 'new-name', '--project', project.slug, '--json');
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).checklist[0].text, 'Keep this acceptance criterion');
  const taskShown = run(sandbox.home, 'doc', 'show', String(task.id), '--project', project.slug, '--json');
  assert.equal(taskShown.status, 0, taskShown.stderr);
  assert.deepEqual(JSON.parse(taskShown.stdout).incoming, [{ source_id: feature.id, relation_type: 'has_task' }]);

  const collision = run(sandbox.home, 'doc', 'rename', String(task.id), 'new-name', '--project', project.slug);
  assert.equal(collision.status, 0, collision.stderr); // Different document type may share a slug.
  const duplicate = run(sandbox.home, 'doc', 'create', 'task', 'other', '--project', project.slug, '--json');
  assert.equal(duplicate.status, 0, duplicate.stderr);
  const duplicateDoc = JSON.parse(duplicate.stdout);
  const conflictingRename = run(sandbox.home, 'doc', 'rename', String(duplicateDoc.id), 'new-name', '--project', project.slug);
  assert.equal(conflictingRename.status, 1);
  assert.match(conflictingRename.stderr, /already exists/);
});

test('doc update validates files and project scope without changing content', () => {
  const sandbox = createSandbox();
  const project = createProject(sandbox);
  const otherProject = createProject(sandbox, 'Other Project');
  const document = createDocument(sandbox, project);
  const markdown = sandbox.write('valid.md', '# Valid\n');
  const text = sandbox.write('invalid.txt', '# Invalid\n');

  const invalidExtension = run(
    sandbox.home,
    'doc', 'update', 'user-auth', text,
    '--project', project.slug,
  );
  assert.equal(invalidExtension.status, 1);
  assert.match(invalidExtension.stderr, /\.md extension/);

  const missingFile = run(
    sandbox.home,
    'doc', 'update', 'user-auth', path.join(sandbox.home, 'missing.md'),
    '--project', project.slug,
  );
  assert.equal(missingFile.status, 1);
  assert.match(missingFile.stderr, /file not found/);

  const wrongProject = run(
    sandbox.home,
    'doc', 'update', String(document.id), markdown,
    '--project', otherProject.slug,
  );
  assert.equal(wrongProject.status, 1);
  assert.match(wrongProject.stderr, /not found in this project/);

  const shown = run(
    sandbox.home,
    'doc', 'show', String(document.id),
    '--project', project.slug,
    '--json',
  );
  assert.equal(shown.status, 0, shown.stderr);
  assert.notEqual(JSON.parse(shown.stdout).content, '# Invalid\n');
});

test('doc write remains available and doc edit is deprecated', () => {
  const sandbox = createSandbox();
  const project = createProject(sandbox);
  createDocument(sandbox, project);
  const legacyFile = sandbox.write('legacy.txt', 'legacy content\n');

  const write = run(
    sandbox.home,
    'doc', 'write', 'user-auth',
    '--file', legacyFile,
    '--project', project.slug,
  );
  assert.equal(write.status, 0, write.stderr);

  const edit = run(
    sandbox.home,
    'doc', 'edit', 'user-auth',
    '--project', project.slug,
  );
  assert.equal(edit.status, 1);
  assert.match(edit.stderr, /deprecated/);
  assert.match(edit.stderr, /syntagraphia ui/);
});

test('database backend status and sqlite selection are persisted safely', () => {
  const sandbox = createSandbox();
  const initial = run(sandbox.home, 'db', 'status', '--json');
  assert.equal(initial.status, 0, initial.stderr);
  assert.equal(JSON.parse(initial.stdout).kind, 'sqlite');

  const switched = run(sandbox.home, 'db', 'use', 'sqlite', '--json');
  assert.equal(switched.status, 0, switched.stderr);
  assert.deepEqual(JSON.parse(switched.stdout), { kind: 'sqlite', switched: true });

  const configPath = path.join(sandbox.home, '.syntagraphia', 'config.json');
  assert.equal(fs.statSync(configPath).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), { db: { kind: 'sqlite' } });
});

test('search finds document content and supports type, status, and project filters', () => {
  const sandbox = createSandbox();
  const project = createProject(sandbox, 'Search Project');
  const otherProject = createProject(sandbox, 'Other Search Project');
  const feature = createDocument(sandbox, project, 'feature', 'user-auth');
  const task = run(sandbox.home, 'doc', 'create', 'task', 'deployment', '--suffix', 'backend', '--project', project.slug, '--status', 'DONE', '--json');
  assert.equal(task.status, 0, task.stderr);
  const taskDoc = JSON.parse(task.stdout);
  const review = run(sandbox.home, 'doc', 'create', 'task', 'review', '--suffix', 'frontend', '--project', project.slug, '--status', 'REVIEW', '--json');
  assert.equal(review.status, 0, review.stderr);
  const reviewDoc = JSON.parse(review.stdout);
  const notes = sandbox.write('search-notes.md', 'Authentication uses a secure session cookie.');
  const write = run(sandbox.home, 'doc', 'write', String(feature.id), '--project', project.slug, '--file', notes);
  assert.equal(write.status, 0, write.stderr);

  const contentMatches = run(sandbox.home, 'search', 'SESSION', '--project', project.slug, '--json');
  assert.equal(contentMatches.status, 0, contentMatches.stderr);
  assert.deepEqual(JSON.parse(contentMatches.stdout).map(doc => doc.id), [feature.id]);

  const suffixMatches = run(sandbox.home, 'search', 'backend', '--project', project.slug, '--json');
  assert.equal(suffixMatches.status, 0, suffixMatches.stderr);
  assert.deepEqual(JSON.parse(suffixMatches.stdout).map(doc => doc.id), [taskDoc.id]);

  const filtered = run(sandbox.home, 'search', '--project', project.slug, '--type', 'task', '--status', 'DONE', '--json');
  assert.equal(filtered.status, 0, filtered.stderr);
  assert.deepEqual(JSON.parse(filtered.stdout).map(doc => doc.id), [taskDoc.id]);

  const multipleStatuses = run(sandbox.home, 'search', '--project', project.slug, '--status', 'DRAFT,REVIEW', '--json');
  assert.equal(multipleStatuses.status, 0, multipleStatuses.stderr);
  assert.deepEqual(JSON.parse(multipleStatuses.stdout).map(doc => doc.id), [feature.id, reviewDoc.id]);

  const invalid = run(sandbox.home, 'search', 'anything', '--project', project.slug, '--type', 'unknown');
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Invalid type/);

  const invalidStatus = run(sandbox.home, 'search', '--project', project.slug, '--status', 'DRAFT,INVALID');
  assert.equal(invalidStatus.status, 1);
  assert.match(invalidStatus.stderr, /Invalid status 'INVALID'/);

  const otherFeature = createDocument(sandbox, otherProject, 'feature', 'user-auth');
  const isolated = run(sandbox.home, 'search', 'user-auth', '--project', project.slug, '--json');
  assert.equal(isolated.status, 0, isolated.stderr);
  assert.deepEqual(JSON.parse(isolated.stdout).map(doc => doc.id), [feature.id]);
  assert.notEqual(otherFeature.id, feature.id);
});
