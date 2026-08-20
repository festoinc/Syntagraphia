'use strict';

const fs = require('fs');
const path = require('path');
const { globalDbPath } = require('./paths');
const { loadConfig, resolveDbConfig } = require('./config');
const { createSqlite } = require('./db/sqlite');
const { createPostgres } = require('./db/postgres');
const { ensureDefaults } = require('./statuses');

const SCHEMA_PATHS = {
  sqlite: path.join(__dirname, '..', 'schema.sql'),
  postgres: path.join(__dirname, '..', 'schema.postgres.sql'),
};

async function openDb(override, options = {}) {
  const config = override ? { db: override } : loadConfig();
  const selected = override || resolveDbConfig(config, { environment: options.ignoreEnvironment !== true });
  const db = selected.kind === 'postgres'
    ? await createPostgres(selected.url)
    : await createSqlite(globalDbPath());

  try {
    const schema = fs.readFileSync(SCHEMA_PATHS[selected.kind], 'utf8');
    await db.exec(schema);
    await ensureDefaults(db);
    return db;
  } catch (error) {
    await db.close().catch(() => {});
    throw error;
  }
}

module.exports = { openDb };
