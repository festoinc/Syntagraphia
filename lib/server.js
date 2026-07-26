'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { openDb } = require('./db');
const docs = require('./documents');

const UI_DIST = path.join(__dirname, '..', 'ui', 'dist');

/** Create an Express app backed by the DB at rootDir. */
function createApp(rootDir) {
  const db = openDb(rootDir);
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // ── GET /api/documents ──────────────────────────────────────
  app.get('/api/documents', (_req, res) => {
    const documents = db.prepare(`
      SELECT id, slug, type, suffix, status, created_at, updated_at
      FROM documents
      ORDER BY
        CASE type WHEN 'constitution' THEN 0 WHEN 'feature' THEN 1 WHEN 'tech_spec' THEN 2 WHEN 'task' THEN 3 WHEN 'verification' THEN 4 END,
        slug, suffix
    `).all();
    const relations = docs.listRelations(db);
    res.json({ documents, relations });
  });

  // ── GET /api/documents/:id ──────────────────────────────────
  app.get('/api/documents/:id', (req, res) => {
    const doc = docs.get(db, Number(req.params.id));
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  });

  // ── PUT /api/documents/:id/content ─────────────────────────
  app.put('/api/documents/:id/content', (req, res) => {
    const ok = docs.writeContent(db, Number(req.params.id), req.body.content);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });

  // ── PUT /api/documents/:id/status ──────────────────────────
  app.put('/api/documents/:id/status', (req, res) => {
    const { status } = req.body;
    try {
      const ok = docs.setStatus(db, Number(req.params.id), status);
      if (!ok) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true, status });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── POST /api/documents ────────────────────────────────────
  app.post('/api/documents', (req, res) => {
    const { slug, type, suffix, status } = req.body;
    try {
      const doc = docs.create(db, { slug, type, suffix, status });
      res.json({
        id: doc.id, slug: doc.slug, type: doc.type,
        suffix: doc.suffix, status: doc.status,
      });
    } catch (e) {
      if (e.code === 'EXISTS') return res.status(409).json({ error: 'Document already exists', id: e.id });
      res.status(400).json({ error: e.message });
    }
  });

  // ── POST /api/relations ────────────────────────────────────
  app.post('/api/relations', (req, res) => {
    const { source_id, target_id, relation_type } = req.body;
    try {
      const created = docs.relate(db, Number(source_id), Number(target_id), relation_type);
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
