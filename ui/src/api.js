const BASE = '/api';

export async function fetchProjects() {
  const res = await fetch(`${BASE}/projects`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function createProject(name) {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create project');
  return res.json();
}

export async function fetchDocuments(projectId) {
  const res = await fetch(`${BASE}/projects/${projectId}/documents`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

export async function fetchDocument(projectId, id) {
  const res = await fetch(`${BASE}/projects/${projectId}/documents/${id}`);
  if (!res.ok) throw new Error('Failed to fetch document');
  return res.json();
}

export async function updateContent(projectId, id, content) {
  const res = await fetch(`${BASE}/projects/${projectId}/documents/${id}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to save content');
  return res.json();
}

export async function updateStatus(projectId, id, status) {
  const res = await fetch(`${BASE}/projects/${projectId}/documents/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update status');
  return res.json();
}

export async function createChecklistItem(projectId, documentId, { text, status, commit_url }) {
  const res = await fetch(`${BASE}/projects/${projectId}/documents/${documentId}/checklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, status, commit_url }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to add checklist item');
  return res.json();
}

export async function updateChecklistItem(projectId, documentId, itemId, changes) {
  const res = await fetch(`${BASE}/projects/${projectId}/documents/${documentId}/checklist/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to update checklist item');
  return res.json();
}

export async function deleteChecklistItem(projectId, documentId, itemId) {
  const res = await fetch(`${BASE}/projects/${projectId}/documents/${documentId}/checklist/${itemId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to remove checklist item');
  return res.json();
}

export async function createDocument(projectId, { slug, type, suffix }) {
  const res = await fetch(`${BASE}/projects/${projectId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, type, suffix }),
  });
  if (res.status === 409) return res.json(); // already exists
  if (!res.ok) throw new Error('Failed to create document');
  return res.json();
}

export async function createRelation(projectId, { source_id, target_id, relation_type }) {
  const res = await fetch(`${BASE}/projects/${projectId}/relations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_id, target_id, relation_type }),
  });
  if (res.status === 409) return { success: true, duplicate: true };
  if (!res.ok) throw new Error('Failed to create relation');
  return res.json();
}
