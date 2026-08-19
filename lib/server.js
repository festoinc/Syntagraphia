'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const Csrf = require('csrf');
const { openDb } = require('./db');
const docs = require('./documents');
const projects = require('./projects');
const constitution = require('./constitution');

const UI_DIST = path.join(__dirname, '..', 'ui', 'dist');
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Create an Express app backed by the selected global Syntagraphia DB. */
async function createApp() {
  const db = await openDb();
  const app = express();
  app.locals.db = db;
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  const tokens = new Csrf();
  const csrfSecret = await tokens.secret();

  app.get('/api/csrf-token', (_req, res) => {
    res.json({ csrfToken: tokens.create(csrfSecret) });
  });

  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (!req.headers.origin) return next(); // non-browser clients (CLI, agents)
    const token = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
    if (!tokens.verify(csrfSecret, token)) return res.status(403).json({ error: 'Invalid CSRF token' });
    next();
  });

  app.get('/api/projects', ah(async (_req, res) => {
    res.json(await projects.list(db));
  }));

  app.post('/api/projects', ah(async (req, res) => {
    const { name, constitution: content } = req.body || {};
    try {
      const project = await projects.create(db, { name });
      if (content != null) await constitution.set(db, project.id, content);
      res.json(project);
    } catch (error) { res.status(400).json({ error: error.message }); }
  }));

  app.use('/api/projects/:projectId', ah(async (req, res, next) => {
    const project = await projects.resolve(db, req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.locals.project = project;
    next();
  }));

  app.get('/api/projects/:projectId/constitution', ah(async (_req, res) => {
    const document = await constitution.get(db, res.locals.project.id);
    res.json({ content: document?.content || '' });
  }));

  app.put('/api/projects/:projectId/constitution', ah(async (req, res) => {
    const { content } = req.body || {};
    if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });
    const document = await constitution.set(db, res.locals.project.id, content);
    res.json({ id: document.id, content: document.content });
  }));

  app.get('/api/projects/:projectId/documents', ah(async (_req, res) => {
    const { id } = res.locals.project;
    res.json({ documents: await docs.list(db, id), relations: await docs.listRelations(db, id) });
  }));

  app.get('/api/projects/:projectId/documents/search', ah(async (req, res) => {
    try {
      const documents = await docs.search(db, res.locals.project.id, {
        query: req.query.q,
        type: req.query.type,
        status: req.query.status,
      });
      res.json({ documents });
    } catch (error) { res.status(400).json({ error: error.message }); }
  }));

  app.get('/api/projects/:projectId/documents/:id', ah(async (req, res) => {
    const doc = await docs.get(db, res.locals.project.id, Number(req.params.id));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  }));

  app.get('/api/projects/:projectId/documents/:id/checklist', ah(async (req, res) => {
    try {
      const document = await docs.get(db, res.locals.project.id, Number(req.params.id));
      if (!document) return res.status(404).json({ error: 'Not found' });
      res.json({ label: document.checklist_label, items: document.checklist });
    } catch (error) { res.status(400).json({ error: error.message }); }
  }));

  app.post('/api/projects/:projectId/documents/:id/checklist', ah(async (req, res) => {
    const { text, status, commit_url } = req.body || {};
    try {
      const item = await docs.createChecklistItem(db, res.locals.project.id, Number(req.params.id), { text, status, commitUrl: commit_url });
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.status(201).json(item);
    } catch (error) { res.status(400).json({ error: error.message }); }
  }));

  app.put('/api/projects/:projectId/documents/:id/checklist/:itemId', ah(async (req, res) => {
    const { text, status, commit_url } = req.body || {};
    try {
      const itemId = Number(req.params.itemId);
      const existing = await docs.listChecklistItems(db, res.locals.project.id, Number(req.params.id));
      if (!existing || !existing.some((item) => item.id === itemId)) return res.status(404).json({ error: 'Not found' });
      const changes = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'text')) changes.text = text;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) changes.status = status;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'commit_url')) changes.commitUrl = commit_url;
      res.json(await docs.updateChecklistItem(db, res.locals.project.id, itemId, changes));
    } catch (error) { res.status(400).json({ error: error.message }); }
  }));

  app.delete('/api/projects/:projectId/documents/:id/checklist/:itemId', ah(async (req, res) => {
    try {
      const itemId = Number(req.params.itemId);
      const existing = await docs.listChecklistItems(db, res.locals.project.id, Number(req.params.id));
      if (!existing || !existing.some((item) => item.id === itemId)) return res.status(404).json({ error: 'Not found' });
      await docs.deleteChecklistItem(db, res.locals.project.id, itemId);
      res.json({ success: true });
    } catch (error) { res.status(400).json({ error: error.message }); }
  }));

  app.put('/api/projects/:projectId/documents/:id/content', ah(async (req, res) => {
    const ok = await docs.writeContent(db, res.locals.project.id, Number(req.params.id), req.body.content);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  }));

  app.put('/api/projects/:projectId/documents/:id/status', ah(async (req, res) => {
    const { status } = req.body;
    try {
      const ok = await docs.setStatus(db, res.locals.project.id, Number(req.params.id), status);
      if (!ok) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true, status });
    } catch (error) { res.status(400).json({ error: error.message }); }
  }));

  app.post('/api/projects/:projectId/documents', ah(async (req, res) => {
    const { slug, type, suffix, status } = req.body;
    try {
      const doc = await docs.create(db, res.locals.project.id, { slug, type, suffix, status });
      res.json({ id: doc.id, slug: doc.slug, type: doc.type, suffix: doc.suffix, status: doc.status });
    } catch (error) {
      if (error.code === 'EXISTS') return res.status(409).json({ error: 'Document already exists', id: error.id });
      res.status(400).json({ error: error.message });
    }
  }));

  app.post('/api/projects/:projectId/relations', ah(async (req, res) => {
    const { source_id, target_id, relation_type } = req.body;
    try {
      const created = await docs.relate(db, res.locals.project.id, Number(source_id), Number(target_id), relation_type);
      res.json({ success: true, created });
    } catch (error) { res.status(400).json({ error: error.message }); }
  }));

  app.delete('/api/projects/:projectId/relations', ah(async (req, res) => {
    const { source_id, target_id } = req.body;
    try {
      const removed = await docs.unrelate(db, res.locals.project.id, Number(source_id), Number(target_id));
      res.json({ success: true, removed });
    } catch (error) { res.status(400).json({ error: error.message }); }
  }));

  if (fs.existsSync(UI_DIST)) {
    app.use(express.static(UI_DIST));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(UI_DIST, 'index.html')));
  }

  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    res.status(500).json({ error: error.message || 'Internal server error' });
  });
  return app;
}

module.exports = { createApp, UI_DIST };
