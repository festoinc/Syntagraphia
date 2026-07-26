'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { dbPath } = require('./paths');

const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');

// Suppress node:sqlite ExperimentalWarning noise (warning still on stderr is fine,
// but a clean CLI is nicer). We only swallow ExperimentalWarning.
const _origEmit = process.emit;
process.emit = function (name, ...args) {
  if (name === 'warning' && args[0] && args[0].name === 'ExperimentalWarning') return false;
  return _origEmit.apply(process, [name, ...args]);
};

/**
 * Open (and ensure schema for) the Syntagraphia DB at rootDir.
 * Returns a DatabaseSync instance. Schema is applied idempotently so any
 * command is safe to run against a fresh or existing DB file.
 */
function openDb(rootDir) {
  const p = dbPath(rootDir);
  const db = new DatabaseSync(p);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  return db;
}

module.exports = { openDb };
