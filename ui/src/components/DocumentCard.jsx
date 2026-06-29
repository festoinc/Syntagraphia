import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import StatusBadge from './StatusBadge';

export default function DocumentCard({
  doc,
  isExpanded,
  content,
  isLoading,
  onToggle,
  onContentSave,
  onStatusChange,
  relatedTasks = [],
  relatedVerifications = [],
  onAddTask,
  onAddVerification,
  isHighlighted = false,
  parentLabel = null,
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskSuffix, setTaskSuffix] = useState('');

  const isParent = doc.type === 'feature' || doc.type === 'tech_spec';
  const label = doc.suffix ? `${doc.slug} (${doc.suffix})` : doc.slug;

  useEffect(() => {
    if (isExpanded && content != null) {
      setEditContent(content);
      setEditing(false);
    }
  }, [content, isExpanded]);

  useEffect(() => {
    if (!isExpanded) { setShowTaskForm(false); setTaskSuffix(''); }
  }, [isExpanded]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onContentSave(doc.id, editContent);
      setEditing(false);
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTask = async () => {
    if (!taskSuffix.trim()) return;
    try {
      await onAddTask(doc.id, doc.slug, taskSuffix.trim());
      setTaskSuffix('');
      setShowTaskForm(false);
    } catch {
      alert('Failed to add task');
    }
  };

  const handleAddVerification = async () => {
    try {
      await onAddVerification(doc.id, doc.slug);
    } catch {
      alert('Failed to add verification');
    }
  };

  return (
    <div className={`doc-card${isExpanded ? ' expanded' : ''}${isHighlighted ? ' highlighted' : ''}`}>
      <div className="doc-card-header" onClick={() => onToggle(doc.id)}>
        <span className="doc-card-arrow">{isExpanded ? '▾' : '▸'}</span>
        <div className="doc-card-info">
          <span className="doc-card-title">{label}</span>
          {parentLabel && <span className="doc-card-parent">{parentLabel}</span>}
        </div>
        <StatusBadge status={doc.status} onChange={(s) => onStatusChange(doc.id, s)} />
      </div>

      {isExpanded && (
        <div className="doc-card-body">
          {isLoading ? (
            <div className="loading">Loading...</div>
          ) : editing ? (
            <div className="editor-section">
              <textarea
                className="editor-textarea"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                autoFocus
              />
              <div className="editor-actions">
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : '💾 Save'}
                </button>
                <button className="btn btn-secondary" onClick={() => { setEditContent(content || ''); setEditing(false); }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="viewer-section">
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <p className="empty-content">No content yet. Click Edit to add some.</p>
              )}
              <button className="btn btn-secondary btn-edit" onClick={() => setEditing(true)}>
                ✏️ Edit
              </button>
            </div>
          )}

          {isParent && (
            <div className="related-section">
              {/* Tasks */}
              <div className="related-group">
                <div className="related-group-header">
                  <h4>📋 Tasks</h4>
                  <button className="btn btn-sm btn-add" onClick={() => setShowTaskForm(!showTaskForm)}>
                    + Add Task
                  </button>
                </div>
                {showTaskForm && (
                  <div className="inline-form">
                    <input
                      type="text"
                      placeholder="e.g. backend, frontend, tests"
                      value={taskSuffix}
                      onChange={(e) => setTaskSuffix(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') setShowTaskForm(false); }}
                      autoFocus
                    />
                    <button className="btn btn-primary btn-sm" onClick={handleAddTask}>Add</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowTaskForm(false)}>✕</button>
                  </div>
                )}
                {relatedTasks.length === 0 && !showTaskForm && (
                  <p className="empty-related">No tasks yet</p>
                )}
                {relatedTasks.map(task => (
                  <div key={task.id} className="related-item">
                    <span className="related-item-label">
                      {task.suffix ? `${task.slug} (${task.suffix})` : task.slug}
                    </span>
                    <StatusBadge status={task.status} small />
                  </div>
                ))}
              </div>

              {/* Verifications */}
              <div className="related-group">
                <div className="related-group-header">
                  <h4>✅ Verifications</h4>
                  <button className="btn btn-sm btn-add" onClick={handleAddVerification}>
                    + Add Verification
                  </button>
                </div>
                {relatedVerifications.length === 0 && (
                  <p className="empty-related">No verifications yet</p>
                )}
                {relatedVerifications.map(v => (
                  <div key={v.id} className="related-item">
                    <span className="related-item-label">{v.slug}</span>
                    <StatusBadge status={v.status} small />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
