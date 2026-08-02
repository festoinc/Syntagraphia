'use strict';

function toPostgresPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function createPostgres(connectionString) {
  let Pool;
  try {
    ({ Pool } = require('pg'));
  } catch {
    throw new Error("Postgres support requires the 'pg' package. Run npm install.");
  }
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  const query = (sql, params = []) => pool.query(toPostgresPlaceholders(sql), params);
  return {
    async run(sql, params = []) {
      const result = await query(sql, params);
      return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount || 0 };
    },
    async get(sql, params = []) {
      const result = await query(sql, params);
      return result.rows[0];
    },
    async all(sql, params = []) {
      const result = await query(sql, params);
      return result.rows;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

module.exports = { createPostgres, toPostgresPlaceholders };
