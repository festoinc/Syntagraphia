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

function createDocument(sandbox, project, slug = 'user-auth') {
  const result = run(
    sandbox.home,
    'doc', 'create', 'feature', slug,
    '--project', project.slug,
    '--json',
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

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
