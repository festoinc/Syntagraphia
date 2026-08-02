import { useState } from 'react';
import StatusBadge from './StatusBadge';

export default function ChecklistSection({
  documentId,
  label,
  items = [],
  onAdd,
  onUpdate,
  onDelete,
}) {
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState('');
  const [commitUrl, setCommitUrl] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editCommitUrl, setEditCommitUrl] = useState('');

  if (!label) return null;

  const handleAdd = async () => {
    if (!text.trim()) return;
    try {
      await onAdd(documentId, { text: text.trim(), commit_url: commitUrl.trim() || null });
      setText('');
      setCommitUrl('');
      setShowForm(false);
    } catch (e) {
      alert(e.message || 'Failed to add checklist item');
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditText(item.text);
    setEditCommitUrl(item.commit_url || '');
  };

  const saveEdit = async (item) => {
    if (!editText.trim()) return;
    try {
      await onUpdate(documentId, item.id, {
        text: editText.trim(),
        commit_url: editCommitUrl.trim() || null,
      });
      setEditingId(null);
    } catch (e) {
      alert(e.message || 'Failed to update checklist item');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Remove checklist item “${item.text}”?`)) return;
    try {
      await onDelete(documentId, item.id);
    } catch (e) {
      alert(e.message || 'Failed to remove checklist item');
    }
  };

  const handleStatusChange = async (item, status) => {
    try {
      await onUpdate(documentId, item.id, { status });
    } catch (e) {
      alert(e.message || 'Failed to update checklist item');
    }
  };

  return (
    <div className="checklist-section">
      <div className="related-group-header">
        <h4>☑️ {label} <span className="checklist-count">{items.filter(item => item.status === 'DONE').length}/{items.length}</span></h4>
        <button className="btn btn-sm btn-add" onClick={() => setShowForm(!showForm)}>
          + Add Item
        </button>
      </div>

      {showForm && (
        <div className="checklist-form">
          <input
            type="text"
            placeholder="Checklist item"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowForm(false); }}
            autoFocus
          />
          <input
            type="url"
            placeholder="Optional commit URL"
            value={commitUrl}
            onChange={(e) => setCommitUrl(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!text.trim()}>Add</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>✕</button>
        </div>
      )}

      {items.length === 0 && !showForm && (
        <p className="empty-related">No checklist items yet</p>
      )}

      {items.map(item => (
        <div key={item.id} className="checklist-item">
          {editingId === item.id ? (
            <div className="checklist-edit-form">
              <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
              <input type="url" placeholder="Optional commit URL" value={editCommitUrl} onChange={(e) => setEditCommitUrl(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={() => saveEdit(item)} disabled={!editText.trim()}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <div className="checklist-item-main">
                <span className="checklist-item-text">{item.text}</span>
                {item.commit_url && (
                  <a className="checklist-commit" href={item.commit_url} target="_blank" rel="noreferrer" title={item.commit_url}>commit ↗</a>
                )}
              </div>
              <div className="checklist-item-actions">
                <StatusBadge status={item.status} small onChange={(status) => handleStatusChange(item, status)} />
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(item)} aria-label="Edit checklist item">✏️</button>
                <button className="btn btn-ghost btn-sm checklist-delete" onClick={() => handleDelete(item)} aria-label="Remove checklist item">✕</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
