import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ConstitutionModal({ content, isLoading, onSave, onClose }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(content);
    setEditing(false);
  }, [content]);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      alert('Failed to save constitution');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal constitution-modal" role="dialog" aria-modal="true" aria-label="Project constitution" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-type">Project foundation</span>
            <h2>Project Constitution</h2>
          </div>
          <div className="modal-header-actions">
            {!isLoading && !editing && <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button>}
            <button type="button" className="btn btn-ghost btn-sm modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="modal-body">
          {isLoading ? <div className="loading">Loading...</div> : editing ? (
            <div className="editor-section">
              <textarea className="editor-textarea constitution-editor" value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
              <div className="editor-actions">
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                <button className="btn btn-secondary" onClick={() => { setDraft(content); setEditing(false); }} disabled={saving}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="viewer-section">
              {content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown> : <p className="empty-content">No constitution has been captured yet. Click Edit to add one.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
