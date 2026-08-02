import StatusBadge from './StatusBadge';
import DocumentBody from './DocumentBody';

const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const Expand = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

export default function DocumentCard({
  doc,
  isExpanded,
  content,
  isLoading,
  onToggle,
  onContentSave,
  onStatusChange,
  checklist = [],
  checklistLabel = null,
  onChecklistAdd,
  onChecklistUpdate,
  onChecklistDelete,
  relatedTasks = [],
  relatedVerifications = [],
  onAddTask,
  onAddVerification,
  isHighlighted = false,
  parentLabel = null,
  onOpenModal,
}) {
  const label = doc.suffix ? `${doc.slug} (${doc.suffix})` : doc.slug;

  return (
    <article className={`doc-card${isExpanded ? ' expanded' : ''}${isHighlighted ? ' highlighted' : ''}`}>
      <div className="doc-card-header">
        <button
          type="button"
          className="doc-card-toggle"
          onClick={() => onToggle(doc.id)}
          aria-expanded={isExpanded}
          aria-controls={`document-body-${doc.id}`}
        >
          <span className="doc-card-arrow" aria-hidden="true"><Chevron /></span>
          <span className="doc-card-info">
            <span className="doc-card-title">{label}</span>
            {parentLabel && <span className="doc-card-parent">{parentLabel}</span>}
          </span>
        </button>
        <div className="doc-card-actions">
          {onOpenModal && (
            <button
              type="button"
              className="btn btn-ghost btn-sm doc-open-btn"
              onClick={() => onOpenModal(doc.id)}
              aria-label={`Open ${label} in full screen`}
              title="Open in full screen"
            >
              <Expand />
            </button>
          )}
          <StatusBadge status={doc.status} onChange={(s) => onStatusChange(doc.id, s)} />
        </div>
      </div>

      {isExpanded && (
        <div className="doc-card-body" id={`document-body-${doc.id}`}>
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
      )}
    </article>
  );
}
