import { useState, useEffect, useCallback, useMemo } from 'react';
import DocumentCard from './components/DocumentCard';
import {
  fetchDocuments,
  fetchDocument,
  updateContent,
  updateStatus,
  createDocument,
  createRelation,
} from './api';
import './App.css';

const PANELS = [
  { type: 'feature',      gridArea: 'features',     title: 'Features',      icon: '📌', color: 'violet',   canAdd: true },
  { type: 'task',          gridArea: 'tasks',        title: 'Tasks',         icon: '✅', color: 'orange',   canAdd: false },
  { type: 'tech_spec',     gridArea: 'specs',        title: 'Specs',         icon: '📐', color: 'blue',     canAdd: true },
  { type: 'verification',  gridArea: 'verifications', title: 'Verifications', icon: '🔍', color: 'emerald',  canAdd: false },
];

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [relations, setRelations] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedContent, setExpandedContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [showCreate, setShowCreate] = useState({});
  const [createSlugs, setCreateSlugs] = useState({});
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const [error, setError] = useState(null);

  // ── Load all ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchDocuments();
      setDocuments(data.documents);
      setRelations(data.relations);
    } catch (e) {
      setError('Failed to load data — is the server running?');
      console.error(e);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Relation helpers ─────────────────────────────────────────
  const getChildren = useCallback((docId, relType) => {
    return relations
      .filter(r => r.source_id === docId && r.relation_type === relType)
      .map(r => documents.find(d => d.id === r.target_id))
      .filter(Boolean);
  }, [relations, documents]);

  const hasParent = useCallback((docId) => {
    return relations.some(r => r.target_id === docId);
  }, [relations]);

  const getParentLabel = useCallback((docId) => {
    const parent = relations
      .filter(r => r.target_id === docId)
      .map(r => documents.find(d => d.id === r.source_id))
      .filter(Boolean)[0];
    if (!parent) return null;
    const typeLabel = parent.type === 'feature' ? 'Feature' : 'Spec';
    const name = parent.suffix ? `${parent.slug} (${parent.suffix})` : parent.slug;
    return `${typeLabel}: ${name}`;
  }, [relations, documents]);

  // ── Get all related IDs for a document ──────────────────────
  const getRelatedIds = useCallback((docId) => {
    const ids = new Set([docId]);
    const highlightableRels = ['has_task', 'verifies'];
    // If it's a feature/spec, add its tasks and verifications only
    relations
      .filter(r => r.source_id === docId && highlightableRels.includes(r.relation_type))
      .forEach(r => ids.add(r.target_id));
    // If it's a task/verification, find its parent(s) and their tasks/verifications
    relations
      .filter(r => r.target_id === docId && highlightableRels.includes(r.relation_type))
      .forEach(r => {
        ids.add(r.source_id);
        relations
          .filter(r2 => r2.source_id === r.source_id && highlightableRels.includes(r2.relation_type))
          .forEach(r2 => ids.add(r2.target_id));
      });
    return ids;
  }, [relations]);

  // ── Toggle expand ────────────────────────────────────────────
  const handleToggle = useCallback(async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedContent('');
      // Remove this doc's related IDs from highlights
      const related = getRelatedIds(id);
      setHighlightedIds(prev => {
        const next = new Set(prev);
        related.forEach(rid => next.delete(rid));
        return next;
      });
    } else {
      setExpandedId(id);
      setContentLoading(true);
      // Add this doc's related IDs to highlights (cumulative)
      const related = getRelatedIds(id);
      setHighlightedIds(prev => new Set([...prev, ...related]));
      try {
        const doc = await fetchDocument(id);
        setExpandedContent(doc.content || '');
      } catch (e) {
        console.error(e);
        setExpandedContent('');
      } finally {
        setContentLoading(false);
      }
    }
  }, [expandedId, getRelatedIds]);

  // ── Save content ─────────────────────────────────────────────
  const handleSave = useCallback(async (id, content) => {
    await updateContent(id, content);
    setExpandedContent(content);
  }, []);

  // ── Status change ────────────────────────────────────────────
  const handleStatusChange = useCallback(async (id, status) => {
    try {
      await updateStatus(id, status);
      setDocuments(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ── Reload ───────────────────────────────────────────────────
  const reload = useCallback(async () => {
    const data = await fetchDocuments();
    setDocuments(data.documents);
    setRelations(data.relations);
  }, []);

  // ── Create document ──────────────────────────────────────────
  const handleCreate = useCallback(async (type, slug) => {
    await createDocument({ slug, type });
    await reload();
    setShowCreate(prev => ({ ...prev, [type]: false }));
    setCreateSlugs(prev => ({ ...prev, [type]: '' }));
  }, [reload]);

  // ── Add task from expanded view ──────────────────────────────
  const handleAddTask = useCallback(async (parentId, slug, suffix) => {
    try {
      const newDoc = await createDocument({ slug, type: 'task', suffix });
      await createRelation({ source_id: parentId, target_id: newDoc.id, relation_type: 'has_task' });
      await reload();
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, [reload]);

  // ── Add verification from expanded view ──────────────────────
  const handleAddVerification = useCallback(async (parentId, slug) => {
    const existing = documents.find(d => d.type === 'verification' && d.slug === slug);
    if (existing) {
      try { await createRelation({ source_id: parentId, target_id: existing.id, relation_type: 'verifies' }); }
      catch { /* duplicate is fine */ }
      await reload();
    } else {
      const newDoc = await createDocument({ slug, type: 'verification' });
      await createRelation({ source_id: parentId, target_id: newDoc.id, relation_type: 'verifies' });
      await reload();
    }
  }, [documents, reload]);

  // ── Grouped documents ────────────────────────────────────────
  const byType = useMemo(() => {
    const g = {};
    for (const d of documents) {
      if (!g[d.type]) g[d.type] = [];
      g[d.type].push(d);
    }
    return g;
  }, [documents]);

  const tasksWithParent = useMemo(
    () => (byType.task || []).filter(t => hasParent(t.id)),
    [byType.task, hasParent]
  );
  const verifsWithParent = useMemo(
    () => (byType.verification || []).filter(v => hasParent(v.id)),
    [byType.verification, hasParent]
  );

  const getItems = (type) => {
    if (type === 'task') return tasksWithParent;
    if (type === 'verification') return verifsWithParent;
    return byType[type] || [];
  };



  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="app">
      <header className="app-header">
        <h1>📐 Syntagraphia</h1>
        <button className="btn btn-ghost" onClick={loadData}>🔄 Refresh</button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="app-grid">
        {PANELS.map(panel => (
          <div key={panel.type} className={`panel panel-${panel.color}`} style={{ gridArea: panel.gridArea }}>
            <div className="panel-header">
              <h2>
                <span className="panel-icon">{panel.icon}</span>
                {panel.title}
                <span className="panel-count">{getItems(panel.type).length}</span>
              </h2>
              {panel.canAdd && (
                <button
                  className="btn btn-sm btn-add"
                  onClick={() => setShowCreate(prev => ({ ...prev, [panel.type]: !prev[panel.type] }))}
                >
                  + New
                </button>
              )}
            </div>

            <div className="panel-content">
              {showCreate[panel.type] && (
                <form
                  className="create-form"
                  onSubmit={(e) => { e.preventDefault(); const s = createSlugs[panel.type]?.trim(); if (s) handleCreate(panel.type, s); }}
                >
                  <input
                    type="text"
                    placeholder="Enter slug (e.g. user-authentication)…"
                    value={createSlugs[panel.type] || ''}
                    onChange={(e) => setCreateSlugs(prev => ({ ...prev, [panel.type]: e.target.value }))}
                    autoFocus
                  />
                  <button className="btn btn-primary btn-sm" type="submit" disabled={!createSlugs[panel.type]?.trim()}>Add</button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowCreate(prev => ({ ...prev, [panel.type]: false }))}>✕</button>
                </form>
              )}

              {getItems(panel.type).map(doc => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  isExpanded={expandedId === doc.id}
                  content={expandedId === doc.id ? expandedContent : null}
                  isLoading={expandedId === doc.id && contentLoading}
                  onToggle={handleToggle}
                  onContentSave={handleSave}
                  onStatusChange={handleStatusChange}
                  relatedTasks={getChildren(doc.id, 'has_task')}
                  relatedVerifications={getChildren(doc.id, 'verifies')}
                  onAddTask={handleAddTask}
                  onAddVerification={handleAddVerification}
                  isHighlighted={highlightedIds.has(doc.id)}
                  parentLabel={getParentLabel(doc.id)}
                />
              ))}

              {getItems(panel.type).length === 0 && !showCreate[panel.type] && (
                <div className="panel-empty">
                  {(panel.type === 'task' || panel.type === 'verification')
                    ? 'No items yet. Create from a Feature or Spec.'
                    : 'No items yet. Click + New to add one.'}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
