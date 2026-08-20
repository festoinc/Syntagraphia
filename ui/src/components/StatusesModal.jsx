import { useEffect, useState } from 'react';

export default function StatusesModal({ statuses, onAdd, onRename, onRemove, onClose }) {
  const [addCode, setAddCode] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [editingCode, setEditingCode] = useState(null);
  const [editCode, setEditCode] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const run = async (action) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleAdd = async () => {
    const code = addCode.trim();
    if (!code) return;
    await run(async () => {
      await onAdd(code, addLabel.trim());
      setAddCode('');
      setAddLabel('');
    });
  };

  const handleRename = async () => {
    const code = editCode.trim();
    if (!code) return;
    await run(async () => {
      await onRename(editingCode, code, editLabel.trim());
      setEditingCode(null);
      setEditCode('');
      setEditLabel('');
    });
  };

  const handleRemove = async (code) => {
    await run(() => onRemove(code));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal statuses-modal" role="dialog" aria-modal="true" aria-label="Manage statuses" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-type">Global vocabulary</span>
            <h2>Statuses</h2>
          </div>
          <div className="modal-header-actions">
            <button type="button" className="btn btn-ghost btn-sm modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="modal-body">
          {error && <div className="error-banner" role="alert">{error}</div>}

          <div className="statuses-add">
            <input
              type="text"
              placeholder="CODE (e.g. BLOCKED)"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              autoFocus
            />
            <input
              type="text"
              placeholder="Label (e.g. Blocked)"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!addCode.trim()}>Add</button>
          </div>

          <div className="statuses-list">
            {statuses.map((s) => (
              <div key={s.code} className="statuses-item">
                {editingCode === s.code ? (
                  <>
                    <input
                      type="text"
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
                    />
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={handleRename} disabled={!editCode.trim()}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingCode(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <span className="statuses-item-code">{s.code}</span>
                    <span className="statuses-item-label">{s.label}</span>
                    <span className="statuses-item-usage">{s.usage} used</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setEditingCode(s.code); setEditCode(s.code); setEditLabel(s.label); }}
                    >
                      Rename
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleRemove(s.code)}>✕</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
