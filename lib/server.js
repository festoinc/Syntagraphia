'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { openDb } = require('./db');
const docs = require('./documents');
const projects = require('./projects');
const constitution = require('./constitution');

const UI_DIST = path.join(__dirname, '..', 'ui', 'dist');

/** Create an Express app backed by the single global Syntagraphia DB (all projects). */
function createApp() {
  const db = openDb();
  const app = express();
  app.locals.db = db;
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // ── GET /api/projects ───────────────────────────────────────
  app.get('/api/projects', (_req, res) => {
    res.json(projects.list(db));
  });

  // ── POST /api/projects ──────────────────────────────────────
  app.post('/api/projects', (req, res) => {
    const { name, constitution: content } = req.body || {};
    try {
      const project = projects.create(db, { name });
      if (content != null) constitution.set(db, project.id, content);
      res.json(project);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Resolve :projectId (numeric id or slug) once for the nested routes below.
  app.use('/api/projects/:projectId', (req, res, next) => {
    const p = projects.resolve(db, req.params.projectId);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    res.locals.project = p;
    next();
  });

  // ── GET /api/projects/:projectId/documents ──────────────────
  app.get('/api/projects/:projectId/documents', (_req, res) => {
    const { id } = res.locals.project;
    const documents = docs.list(db, id);
    const relations = docs.listRelations(db, id);
    res.json({ documents, relations });
  });

  // ── GET /api/projects/:projectId/documents/:id ──────────────
  app.get('/api/projects/:projectId/documents/:id', (req, res) => {
    const doc = docs.get(db, res.locals.project.id, Number(req.params.id));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  });

  // ── GET /api/projects/:projectId/documents/:id/checklist ────
  app.get('/api/projects/:projectId/documents/:id/checklist', (req, res) => {
    try {
      const documentId = Number(req.params.id);
      const document = docs.get(db, res.locals.project.id, documentId);
      if (!document) return res.status(404).json({ error: 'Not found' });
      res.json({ label: document.checklist_label, items: document.checklist });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── POST /api/projects/:projectId/documents/:id/checklist ───
  app.post('/api/projects/:projectId/documents/:id/checklist', (req, res) => {
    const { text, status, commit_url } = req.body || {};
    try {
      const item = docs.createChecklistItem(db, res.locals.project.id, Number(req.params.id), {
        text, status, commitUrl: commit_url,
      });
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.status(201).json(item);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── PUT /api/projects/:projectId/documents/:id/checklist/:itemId
  app.put('/api/projects/:projectId/documents/:id/checklist/:itemId', (req, res) => {
    const { text, status, commit_url } = req.body || {};
    try {
      const itemId = Number(req.params.itemId);
      const existing = docs.listChecklistItems(db, res.locals.project.id, Number(req.params.id));
      if (!existing || !existing.some((item) => item.id === itemId)) {
        return res.status(404).json({ error: 'Not found' });
      }
      const changes = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'text')) changes.text = text;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) changes.status = status;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'commit_url')) changes.commitUrl = commit_url;
      const item = docs.updateChecklistItem(db, res.locals.project.id, itemId, changes);
      res.json(item);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── DELETE /api/projects/:projectId/documents/:id/checklist/:itemId
  app.delete('/api/projects/:projectId/documents/:id/checklist/:itemId', (req, res) => {
    try {
      const itemId = Number(req.params.itemId);
      const existing = docs.listChecklistItems(db, res.locals.project.id, Number(req.params.id));
      if (!existing || !existing.some((item) => item.id === itemId)) {
        return res.status(404).json({ error: 'Not found' });
      }
      docs.deleteChecklistItem(db, res.locals.project.id, itemId);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── PUT /api/projects/:projectId/documents/:id/content ─────
  app.put('/api/projects/:projectId/documents/:id/content', (req, res) => {
    const ok = docs.writeContent(db, res.locals.project.id, Number(req.params.id), req.body.content);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });

  // ── PUT /api/projects/:projectId/documents/:id/status ──────
  app.put('/api/projects/:projectId/documents/:id/status', (req, res) => {
    const { status } = req.body;
    try {
      const ok = docs.setStatus(db, res.locals.project.id, Number(req.params.id), status);
      if (!ok) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true, status });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── POST /api/projects/:projectId/documents ────────────────
  app.post('/api/projects/:projectId/documents', (req, res) => {
    const { slug, type, suffix, status } = req.body;
    try {
      const doc = docs.create(db, res.locals.project.id, { slug, type, suffix, status });
      res.json({
        id: doc.id, slug: doc.slug, type: doc.type,
        suffix: doc.suffix, status: doc.status,
      });
    } catch (e) {
      if (e.code === 'EXISTS') return res.status(409).json({ error: 'Document already exists', id: e.id });
      res.status(400).json({ error: e.message });
    }
  });

  // ── POST /api/projects/:projectId/relations ────────────────
  app.post('/api/projects/:projectId/relations', (req, res) => {
    const { source_id, target_id, relation_type } = req.body;
    try {
      const created = docs.relate(db, res.locals.project.id, Number(source_id), Number(target_id), relation_type);
      res.json({ success: true, created });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── Static UI (bundled SPA) ────────────────────────────────
  if (fs.existsSync(UI_DIST)) {
    app.use(express.static(UI_DIST));
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(UI_DIST, 'index.html'));
    });
  }

  return app;
}

module.exports = { createApp, UI_DIST };
