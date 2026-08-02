'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'syntagraphia-api-'));
const { createApp } = require('../lib/server');

let app;
let server;
let baseUrl;

test.before(async () => {
  app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  app.locals.db.close();
  await new Promise((resolve) => server.close(resolve));
});

async function request(pathname, options) {
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
}

test('checklist API supports CRUD and independent item status', async () => {
  const projectResponse = await request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'API Checklist Project', constitution: '# Constitution\n' }),
  });
  assert.equal(projectResponse.status, 200);
  const project = await projectResponse.json();

  const documentResponse = await request(`/api/projects/${project.id}/documents`, {
    method: 'POST',
    body: JSON.stringify({ slug: 'api-feature', type: 'feature' }),
  });
  assert.equal(documentResponse.status, 200);
  const document = await documentResponse.json();

  const createResponse = await request(`/api/projects/${project.id}/documents/${document.id}/checklist`, {
    method: 'POST',
    body: JSON.stringify({
      text: 'API contract is documented',
      status: 'IN_PROGRESS',
      commit_url: 'https://github.com/example/project/commit/abc123',
    }),
  });
  assert.equal(createResponse.status, 201);
  const item = await createResponse.json();
  assert.equal(item.status, 'IN_PROGRESS');

  const updateResponse = await request(`/api/projects/${project.id}/documents/${document.id}/checklist/${item.id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'DONE' }),
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).commit_url, item.commit_url);

  const getResponse = await request(`/api/projects/${project.id}/documents/${document.id}`);
  assert.equal(getResponse.status, 200);
  const fullDocument = await getResponse.json();
  assert.equal(fullDocument.checklist_label, 'Acceptance Criteria');
  assert.equal(fullDocument.checklist[0].status, 'DONE');

  const deleteResponse = await request(`/api/projects/${project.id}/documents/${document.id}/checklist/${item.id}`, {
    method: 'DELETE',
  });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { success: true });
});
