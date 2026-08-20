import { useState, useRef, useEffect } from 'react';

const KNOWN_COLORS = {
  DRAFT: 'var(--status-draft)',
  IN_PROGRESS: 'var(--status-progress)',
  REVIEW: 'var(--status-review)',
  DONE: 'var(--status-done)',
};

const CUSTOM_COLOR = 'var(--status-custom)';

const FALLBACK_STATUSES = [
  { code: 'DRAFT', label: 'Draft' },
  { code: 'IN_PROGRESS', label: 'In Progress' },
  { code: 'REVIEW', label: 'Review' },
  { code: 'DONE', label: 'Done' },
];

export default function StatusBadge({ status, statuses = [], onChange, small }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const all = statuses.length ? statuses : FALLBACK_STATUSES;
  const current = all.find((s) => s.code === status) || { code: status, label: status };
  const color = KNOWN_COLORS[current.code] || CUSTOM_COLOR;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className={`status-badge${small ? ' small' : ''}`} style={{ '--color': color }}>
      {onChange ? (
        <button
          type="button"
          className="status-badge-btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Change status, currently ${current.label}`}
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        >
          <span className="status-dot" />
          <span>{current.label}</span>
        </button>
      ) : (
        <span className="status-badge-btn static">
          <span className="status-dot" />
          <span>{current.label}</span>
        </span>
      )}
      {open && onChange && (
        <div className="status-dropdown" role="listbox" aria-label="Document status">
          {all.map((s) => {
            const optColor = KNOWN_COLORS[s.code] || CUSTOM_COLOR;
            return (
              <button
                key={s.code}
                type="button"
                role="option"
                aria-selected={s.code === status}
                className={`status-option${s.code === status ? ' active' : ''}`}
                style={{ '--opt-color': optColor }}
                onClick={(e) => { e.stopPropagation(); onChange(s.code); setOpen(false); }}
              >
                <span className="status-dot" />
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
