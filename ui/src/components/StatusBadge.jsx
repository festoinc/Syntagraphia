import { useState, useRef, useEffect } from 'react';

const STATUS = {
  DRAFT:        { label: 'Draft',       color: 'var(--status-draft)' },
  IN_PROGRESS:  { label: 'In Progress', color: 'var(--status-progress)' },
  REVIEW:       { label: 'Review',      color: 'var(--status-review)' },
  DONE:         { label: 'Done',        color: 'var(--status-done)' },
};

export default function StatusBadge({ status, onChange, small }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cfg = STATUS[status] || STATUS.DRAFT;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className={`status-badge${small ? ' small' : ''}`} style={{ '--color': cfg.color }}>
      {onChange ? (
        <button
          type="button"
          className="status-badge-btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Change status, currently ${cfg.label}`}
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        >
          <span className="status-dot" />
          <span>{cfg.label}</span>
        </button>
      ) : (
        <span className="status-badge-btn static">
          <span className="status-dot" />
          <span>{cfg.label}</span>
        </span>
      )}
      {open && onChange && (
        <div className="status-dropdown" role="listbox" aria-label="Document status">
          {Object.entries(STATUS).map(([key, val]) => (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={key === status}
              className={`status-option${key === status ? ' active' : ''}`}
              style={{ '--opt-color': val.color }}
              onClick={(e) => { e.stopPropagation(); onChange(key); setOpen(false); }}
            >
              <span className="status-dot" />
              {val.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
