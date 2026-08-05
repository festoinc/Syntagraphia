import { useState, useEffect, useCallback, useMemo } from 'react';
import DocumentCard from './components/DocumentCard';
import DocumentModal from './components/DocumentModal';
import {
  fetchProjects,
  createProject,
  fetchDocuments,
  searchDocuments,
  fetchDocument,
  updateContent,
  updateStatus,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  createDocument,
  createRelation,
} from './api';
import './App.css';

const PANELS = [
  { type: 'feature',     gridArea: 'features',     title: 'Features',      canAdd: true },
  { type: 'task',        gridArea: 'tasks',        title: 'Tasks',         canAdd: false },
  { type: 'tech_spec',   gridArea: 'specs',        title: 'Specs',         canAdd: true },
  { type: 'verification',gridArea: 'verifications', title: 'Verifications', canAdd: false },
];

// Stroke-only line icons — the system's only ornamental mark (cf. Ollama lock/llama).
const svg = (children) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICONS = {
  feature:      svg(<><path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
  task:         svg(<><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
  tech_spec:    svg(<><rect x="6" y="4" width="12" height="16" rx="1.5" /><path d="M9 9h6M9 12h6M9 15h4" /></>),
  verification: svg(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>),
};

const LS_KEY = 'syntagraphia.selectedProjectId';
const PROJECT_LABEL_MAX_LENGTH = 40;

function truncateProjectLabel(label) {
  return label.length > PROJECT_LABEL_MAX_LENGTH
    ? `${label.slice(0, PROJECT_LABEL_MAX_LENGTH)}...`
    : label;
}

export default function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [relations, setRelations] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedContent, setExpandedContent] = useState('');
  const [expandedChecklist, setExpandedChecklist] = useState([]);
  const [expandedChecklistLabel, setExpandedChecklistLabel] = useState(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [showCreate, setShowCreate] = useState({});
  const [createSlugs, setCreateSlugs] = useState({});
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const [error, setError] = useState(null);
  const [showProjectCreate, setShowProjectCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [searchIds, setSearchIds] = useState(null);
  const [searching, setSearching] = useState(false);

  // ── Full-screen document modal ───────────────────────────────
  const [modalDocId, setModalDocId] = useState(null);
  const [modalContent, setModalContent] = useState('');
  const [modalChecklist, setModalChecklist] = useState([]);
  const [modalChecklistLabel, setModalChecklistLabel] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  // ── Load project list ────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    try {
      setError(null);
      const rows = await fetchProjects();
      setProjects(rows);
      // Pick a selected project: last-used (if still present) → first available.
      if (rows.length) {
        const saved = localStorage.getItem(LS_KEY);
        const savedId = saved != null ? Number(saved) : null;
        const exists = savedId != null && rows.some((p) => p.id === savedId);
        if (!exists && !selectedProjectId) setSelectedProjectId(rows[0].id);
        else if (exists && selectedProjectId == null) setSelectedProjectId(savedId);
      } else {
        setSelectedProjectId(null);
      }
    } catch (e) {
      setError('Failed to load projects — is the server running?');
      console.error(e);
    }
  }, [selectedProjectId]);

  useEffect(() => { loadProjects(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist the selected project across reloads.
  useEffect(() => {
    if (selectedProjectId != null) localStorage.setItem(LS_KEY, String(selectedProjectId));
  }, [selectedProjectId]);

  // Reset expansion when switching projects.
  useEffect(() => {
    setExpandedId(null);
    setExpandedContent('');
    setExpandedChecklist([]);
    setExpandedChecklistLabel(null);
    setHighlightedIds(new Set());
    setShowCreate({});
    setCreateSlugs({});
    setSearchQuery('');
    setSearchType('');
    setSearchStatus('');
    setSearchIds(null);
    setModalDocId(null);
    setModalContent('');
    setModalChecklist([]);
    setModalChecklistLabel(null);
  }, [selectedProjectId]);

  // ── Load documents for the selected project ─────────────────
  const loadData = useCallback(async () => {
    if (selectedProjectId == null) return;
    try {
      setError(null);
      const data = await fetchDocuments(selectedProjectId);
      setDocuments(data.documents);
      setRelations(data.relations);
    } catch (e) {
      setError('Failed to load data — is the server running?');
      console.error(e);
    }
  }, [selectedProjectId]);

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
      setExpandedChecklist([]);
      setExpandedChecklistLabel(null);
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
        const doc = await fetchDocument(selectedProjectId, id);
        setExpandedContent(doc.content || '');
        setExpandedChecklist(doc.checklist || []);
        setExpandedChecklistLabel(doc.checklist_label || null);
      } catch (e) {
        console.error(e);
        setExpandedContent('');
      } finally {
        setContentLoading(false);
      }
    }
  }, [expandedId, getRelatedIds, selectedProjectId]);

  // ── Save content ─────────────────────────────────────────────
  const handleSave = useCallback(async (id, content) => {
    await updateContent(selectedProjectId, id, content);
    setExpandedContent(content);
  }, [selectedProjectId]);

  // ── Status change ────────────────────────────────────────────
  const handleStatusChange = useCallback(async (id, status) => {
    try {
      await updateStatus(selectedProjectId, id, status);
      setDocuments(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    } catch (e) {
      console.error(e);
    }
  }, [selectedProjectId]);

  // ── Checklist changes ──────────────────────────────────────
  const handleChecklistAdd = useCallback(async (documentId, item) => {
    const created = await createChecklistItem(selectedProjectId, documentId, item);
    setExpandedChecklist(prev => [...prev, created]);
    setDocuments(prev => prev.map(d => d.id === documentId
      ? { ...d, checklist_total: Number(d.checklist_total || 0) + 1 }
      : d));
    return created;
  }, [selectedProjectId]);

  const handleChecklistUpdate = useCallback(async (documentId, itemId, changes) => {
    const existing = expandedChecklist.find(item => item.id === itemId);
    const updated = await updateChecklistItem(selectedProjectId, documentId, itemId, changes);
    setExpandedChecklist(prev => prev.map(item => item.id === itemId ? updated : item));
    if (existing && existing.status !== updated.status) {
      setDocuments(prev => prev.map(d => d.id === documentId
        ? {
            ...d,
            checklist_done: Number(d.checklist_done || 0)
              + (updated.status === 'DONE' ? 1 : 0)
              - (existing.status === 'DONE' ? 1 : 0),
          }
        : d));
    }
    return updated;
  }, [expandedChecklist, selectedProjectId]);

  const handleChecklistDelete = useCallback(async (documentId, itemId) => {
    const existing = expandedChecklist.find(item => item.id === itemId);
    await deleteChecklistItem(selectedProjectId, documentId, itemId);
    setExpandedChecklist(prev => prev.filter(item => item.id !== itemId));
    setDocuments(prev => prev.map(d => d.id === documentId
      ? {
          ...d,
          checklist_total: Math.max(0, Number(d.checklist_total || 0) - 1),
          checklist_done: Math.max(0, Number(d.checklist_done || 0) - (existing?.status === 'DONE' ? 1 : 0)),
        }
      : d));
  }, [expandedChecklist, selectedProjectId]);

  // ── Reload ───────────────────────────────────────────────────
  const reload = useCallback(async () => {
    const data = await fetchDocuments(selectedProjectId);
    setDocuments(data.documents);
    setRelations(data.relations);
  }, [selectedProjectId]);

  // ── Create document ──────────────────────────────────────────
  const handleCreate = useCallback(async (type, slug) => {
    await createDocument(selectedProjectId, { slug, type });
    await reload();
    setShowCreate(prev => ({ ...prev, [type]: false }));
    setCreateSlugs(prev => ({ ...prev, [type]: '' }));
  }, [selectedProjectId, reload]);

  // ── Add task from expanded view ──────────────────────────────
  const handleAddTask = useCallback(async (parentId, slug, suffix) => {
    try {
      const newDoc = await createDocument(selectedProjectId, { slug, type: 'task', suffix });
      await createRelation(selectedProjectId, { source_id: parentId, target_id: newDoc.id, relation_type: 'has_task' });
      await reload();
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, [selectedProjectId, reload]);

  // ── Add verification from expanded view ──────────────────────
  const handleAddVerification = useCallback(async (parentId, slug) => {
    const existing = documents.find(d => d.type === 'verification' && d.slug === slug);
    if (existing) {
      try { await createRelation(selectedProjectId, { source_id: parentId, target_id: existing.id, relation_type: 'verifies' }); }
      catch { /* duplicate is fine */ }
      await reload();
    } else {
      const newDoc = await createDocument(selectedProjectId, { slug, type: 'verification' });
      await createRelation(selectedProjectId, { source_id: parentId, target_id: newDoc.id, relation_type: 'verifies' });
      await reload();
    }
  }, [documents, selectedProjectId, reload]);

  // ── Create project ───────────────────────────────────────────
  const handleCreateProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreatingProject(true);
    try {
      const project = await createProject(name);
      await loadProjects();
      setSelectedProjectId(project.id);
      setNewProjectName('');
      setShowProjectCreate(false);
    } catch (e) {
      console.error(e);
      alert('Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  }, [newProjectName, loadProjects]);

  // ── Search ──────────────────────────────────────────────────
  const handleSearch = useCallback(async (event) => {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (!query && !searchType && !searchStatus) {
      setSearchIds(null);
      return;
    }
    setSearching(true);
    try {
      const data = await searchDocuments(selectedProjectId, {
        query,
        type: searchType,
        status: searchStatus,
      });
      const ids = new Set(data.documents.map(doc => doc.id));
      setSearchIds(ids);
      setExpandedId(null);
      setExpandedContent('');
      setExpandedChecklist([]);
      setExpandedChecklistLabel(null);
      setHighlightedIds(new Set());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchType, searchStatus, selectedProjectId]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchType('');
    setSearchStatus('');
    setSearchIds(null);
  }, []);

  // ── Modal open / close ───────────────────────────────────────
  const openModal = useCallback(async (id) => {
    setModalDocId(id);
    setModalLoading(true);
    setModalContent('');
    setModalChecklist([]);
    setModalChecklistLabel(null);
    try {
      const doc = await fetchDocument(selectedProjectId, id);
      setModalContent(doc.content || '');
      setModalChecklist(doc.checklist || []);
      setModalChecklistLabel(doc.checklist_label || null);
    } catch (e) {
      console.error(e);
    } finally {
      setModalLoading(false);
    }
  }, [selectedProjectId]);

  const closeModal = useCallback(() => {
    setModalDocId(null);
    setModalContent('');
    setModalChecklist([]);
    setModalChecklistLabel(null);
  }, []);

  // Modal-scoped content save (keeps modal buffer in sync).
  const handleModalSave = useCallback(async (id, content) => {
    await updateContent(selectedProjectId, id, content);
    setModalContent(content);
  }, [selectedProjectId]);

  const handleModalChecklistAdd = useCallback(async (documentId, item) => {
    const created = await createChecklistItem(selectedProjectId, documentId, item);
    setModalChecklist(prev => [...prev, created]);
    setDocuments(prev => prev.map(d => d.id === documentId
      ? { ...d, checklist_total: Number(d.checklist_total || 0) + 1 }
      : d));
    return created;
  }, [selectedProjectId]);

  const handleModalChecklistUpdate = useCallback(async (documentId, itemId, changes) => {
    const existing = modalChecklist.find(item => item.id === itemId);
    const updated = await updateChecklistItem(selectedProjectId, documentId, itemId, changes);
    setModalChecklist(prev => prev.map(item => item.id === itemId ? updated : item));
    if (existing && existing.status !== updated.status) {
      setDocuments(prev => prev.map(d => d.id === documentId
        ? {
            ...d,
            checklist_done: Number(d.checklist_done || 0)
              + (updated.status === 'DONE' ? 1 : 0)
              - (existing.status === 'DONE' ? 1 : 0),
          }
        : d));
    }
    return updated;
  }, [modalChecklist, selectedProjectId]);

  const handleModalChecklistDelete = useCallback(async (documentId, itemId) => {
    const existing = modalChecklist.find(item => item.id === itemId);
    await deleteChecklistItem(selectedProjectId, documentId, itemId);
    setModalChecklist(prev => prev.filter(item => item.id !== itemId));
    setDocuments(prev => prev.map(d => d.id === documentId
      ? {
          ...d,
          checklist_total: Math.max(0, Number(d.checklist_total || 0) - 1),
          checklist_done: Math.max(0, Number(d.checklist_done || 0) - (existing?.status === 'DONE' ? 1 : 0)),
        }
      : d));
  }, [modalChecklist, selectedProjectId]);

  // ── Grouped documents ────────────────────────────────────────
  const visibleDocuments = useMemo(
    () => searchIds == null ? documents : documents.filter(d => searchIds.has(d.id)),
    [documents, searchIds]
  );

  const byType = useMemo(() => {
    const g = {};
    for (const d of visibleDocuments) {
      if (!g[d.type]) g[d.type] = [];
      g[d.type].push(d);
    }
    return g;
  }, [visibleDocuments]);

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

  const modalDoc = useMemo(
    () => documents.find(d => d.id === modalDocId) || null,
    [documents, modalDocId]
  );



  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">S</span>
          <div>
            <p className="brand-kicker">Project intelligence</p>
            <h1>Syntagraphia</h1>
          </div>
        </div>
        <div className="header-controls">
          <select
            className="project-select"
            value={selectedProjectId ?? ''}
            onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
            disabled={projects.length === 0}
          >
            {projects.length === 0 && <option value="">No projects yet</option>}
            {projects.map(p => {
              const fullLabel = `${p.name} (${p.slug})`;
              return (
                <option key={p.id} value={p.id} title={fullLabel}>
                  {truncateProjectLabel(fullLabel)}
                </option>
              );
            })}
          </select>
          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="search"
              aria-label="Search documents"
              placeholder="Search documents…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select aria-label="Filter by document type" value={searchType} onChange={(e) => setSearchType(e.target.value)}>
              <option value="">All types</option>
              <option value="feature">Features</option>
              <option value="tech_spec">Specs</option>
              <option value="task">Tasks</option>
              <option value="verification">Verifications</option>
            </select>
            <select aria-label="Filter by document status" value={searchStatus} onChange={(e) => setSearchStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="REVIEW">Review</option>
              <option value="DONE">Done</option>
            </select>
            <button className="btn btn-secondary btn-sm" type="submit" disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </button>
            {searchIds != null && <button className="btn btn-ghost btn-sm" type="button" onClick={clearSearch}>Clear</button>}
          </form>
          <button className="btn btn-ghost" onClick={loadData}>Refresh</button>
          <button className="btn btn-primary" onClick={() => setShowProjectCreate(s => !s)}>+ Project</button>
        </div>
      </header>

      {showProjectCreate && (
        <div className="project-create-bar">
          <input
            type="text"
            placeholder="Project name (e.g. My App)…"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') setShowProjectCreate(false); }}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={handleCreateProject} disabled={creatingProject || !newProjectName.trim()}>
            {creatingProject ? 'Creating…' : 'Create'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowProjectCreate(false)}>✕</button>
        </div>
      )}

      {error && <div className="error-banner" role="alert">{error}</div>}

      {selectedProjectId == null ? (
        <div className="empty-state">
          <div className="empty-state-card">
            <h2>Welcome to Syntagraphia</h2>
            <p>{projects.length === 0
              ? 'No projects yet. Create a project to get started.'
              : 'Select a project from the dropdown above to view its documents.'}</p>
            {projects.length === 0 && (
              <button className="btn btn-primary" onClick={() => setShowProjectCreate(true)}>+ Create a project</button>
            )}
          </div>
        </div>
      ) : (
        <>
          {searchIds != null && (
            <div className="search-summary" role="status">
              Showing {visibleDocuments.length} matching document{visibleDocuments.length === 1 ? '' : 's'}.
            </div>
          )}
          <div className="app-grid">
            {PANELS.map(panel => (
            <div key={panel.type} className="panel" style={{ gridArea: panel.gridArea }}>
              <div className="panel-header">
                <h2>
                  <span className="panel-icon">{ICONS[panel.type]}</span>
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
                    checklist={expandedId === doc.id ? expandedChecklist : []}
                    checklistLabel={expandedId === doc.id ? expandedChecklistLabel : null}
                    onChecklistAdd={handleChecklistAdd}
                    onChecklistUpdate={handleChecklistUpdate}
                    onChecklistDelete={handleChecklistDelete}
                    relatedTasks={getChildren(doc.id, 'has_task')}
                    relatedVerifications={getChildren(doc.id, 'verifies')}
                    onAddTask={handleAddTask}
                    onAddVerification={handleAddVerification}
                    isHighlighted={highlightedIds.has(doc.id)}
                    parentLabel={getParentLabel(doc.id)}
                    onOpenModal={openModal}
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
        </>
      )}

      {modalDocId != null && modalDoc && (
        <DocumentModal
          doc={modalDoc}
          parentLabel={getParentLabel(modalDoc.id)}
          content={modalContent}
          isLoading={modalLoading}
          onContentSave={handleModalSave}
          checklist={modalChecklist}
          checklistLabel={modalChecklistLabel}
          onChecklistAdd={handleModalChecklistAdd}
          onChecklistUpdate={handleModalChecklistUpdate}
          onChecklistDelete={handleModalChecklistDelete}
          relatedTasks={getChildren(modalDoc.id, 'has_task')}
          relatedVerifications={getChildren(modalDoc.id, 'verifies')}
          onAddTask={handleAddTask}
          onAddVerification={handleAddVerification}
          onStatusChange={handleStatusChange}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
