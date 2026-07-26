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
    const documents = db.prepare(`
      SELECT id, slug, type, suffix, status, created_at, updated_at
      FROM documents
      WHERE project_id = ?
      ORDER BY
        CASE type WHEN 'constitution' THEN 0 WHEN 'feature' THEN 1 WHEN 'tech_spec' THEN 2 WHEN 'task' THEN 3 WHEN 'verification' THEN 4 END,
        slug, suffix
    `).all(id);
    const relations = docs.listRelations(db, id);
    res.json({ documents, relations });
  });

  // ── GET /api/projects/:projectId/documents/:id ──────────────
  app.get('/api/projects/:projectId/documents/:id', (req, res) => {
    const doc = docs.get(db, res.locals.project.id, Number(req.params.id));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
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
