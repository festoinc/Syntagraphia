import { useState, useRef, useEffect } from 'react';

const STATUS = {
  DRAFT:        { label: 'Draft',       color: '#94a3b8' },
  IN_PROGRESS:  { label: 'In Progress', color: '#3b82f6' },
  REVIEW:       { label: 'Review',      color: '#f59e0b' },
  DONE:         { label: 'Done',        color: '#22c55e' },
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
        <button className="status-badge-btn" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
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
        <div className="status-dropdown">
          {Object.entries(STATUS).map(([key, val]) => (
            <button
              key={key}
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
