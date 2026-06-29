const BASE = '/api';

export async function fetchDocuments() {
  const res = await fetch(`${BASE}/documents`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

export async function fetchDocument(id) {
  const res = await fetch(`${BASE}/documents/${id}`);
  if (!res.ok) throw new Error('Failed to fetch document');
  return res.json();
}

export async function updateContent(id, content) {
  const res = await fetch(`${BASE}/documents/${id}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to save content');
  return res.json();
}

export async function updateStatus(id, status) {
  const res = await fetch(`${BASE}/documents/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update status');
  return res.json();
}

export async function createDocument({ slug, type, suffix }) {
  const res = await fetch(`${BASE}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, type, suffix }),
  });
  if (res.status === 409) return res.json(); // already exists
  if (!res.ok) throw new Error('Failed to create document');
  return res.json();
}

export async function createRelation({ source_id, target_id, relation_type }) {
  const res = await fetch(`${BASE}/relations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_id, target_id, relation_type }),
  });
  if (res.status === 409) return { success: true, duplicate: true };
  if (!res.ok) throw new Error('Failed to create relation');
  return res.json();
}
