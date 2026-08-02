import { useEffect } from 'react';
import StatusBadge from './StatusBadge';
import DocumentBody from './DocumentBody';

const TYPE_LABELS = {
  feature: 'Feature',
  task: 'Task',
  tech_spec: 'Spec',
  verification: 'Verification',
};

export default function DocumentModal({
  doc,
  parentLabel = null,
  content,
  isLoading,
  onContentSave,
  checklist = [],
  checklistLabel = null,
  onChecklistAdd,
  onChecklistUpdate,
  onChecklistDelete,
  relatedTasks = [],
  relatedVerifications = [],
  onAddTask,
  onAddVerification,
  onStatusChange,
  onClose,
}) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!doc) return null;
  const label = doc.suffix ? `${doc.slug} (${doc.suffix})` : doc.slug;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-type">{TYPE_LABELS[doc.type] || doc.type}</span>
            <h2>{label}</h2>
            {parentLabel && <span className="modal-parent">{parentLabel}</span>}
          </div>
          <div className="modal-header-actions">
            <StatusBadge status={doc.status} onChange={(s) => onStatusChange(doc.id, s)} />
            <button
              type="button"
              className="btn btn-ghost btn-sm modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="modal-body">
          <DocumentBody
            key={doc.id}
            doc={doc}
            content={content}
            isLoading={isLoading}
            onContentSave={onContentSave}
            checklist={checklist}
            checklistLabel={checklistLabel}
            onChecklistAdd={onChecklistAdd}
            onChecklistUpdate={onChecklistUpdate}
            onChecklistDelete={onChecklistDelete}
            relatedTasks={relatedTasks}
            relatedVerifications={relatedVerifications}
            onAddTask={onAddTask}
            onAddVerification={onAddVerification}
          />
        </div>
      </div>
    </div>
  );
}
