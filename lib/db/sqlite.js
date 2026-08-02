'use strict';

const { DatabaseSync } = require('node:sqlite');

// Suppress node:sqlite ExperimentalWarning noise in CLI output.
const originalEmit = process.emit;
process.emit = function (name, ...args) {
  if (name === 'warning' && args[0] && args[0].name === 'ExperimentalWarning') return false;
  return originalEmit.apply(process, [name, ...args]);
};

function createSqlite(filePath) {
  const native = new DatabaseSync(filePath);
  native.exec('PRAGMA journal_mode = WAL');
  native.exec('PRAGMA foreign_keys = ON');
  return {
    async run(sql, params = []) {
      const statement = native.prepare(sql);
      const hasReturning = /^\s*INSERT\b/i.test(sql) && /\bRETURNING\b/i.test(sql);
      if (hasReturning) {
        const rows = statement.all(...params);
        const changes = native.prepare('SELECT changes() AS changes').get().changes;
        return { lastInsertRowid: rows[0]?.id, changes: Number(changes) };
      }
      const result = statement.run(...params);
      return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
    },
    async get(sql, params = []) {
      return native.prepare(sql).get(...params);
    },
    async all(sql, params = []) {
      return native.prepare(sql).all(...params);
    },
    async exec(sql) {
      native.exec(sql);
    },
    async close() {
      native.close();
    },
  };
}

module.exports = { createSqlite };
