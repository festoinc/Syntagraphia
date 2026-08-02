'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

test('checklists validate input and remain project-scoped', () => {
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

  const invalidUrl = run(
    sandbox.home,
    'doc', 'checklist', 'add', 'payments', 'Invalid commit link',
    '--project', project.slug,
    '--commit', 'javascript:alert(1)',
  );
  assert.equal(invalidUrl.status, 1);
  assert.match(invalidUrl.stderr, /http\(s\) URL/);

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
