'use strict';

const fs = require('fs');
const { globalConfigPath } = require('./paths');

const DEFAULT_CONFIG = { db: { kind: 'sqlite' } };

function cloneDefault() {
  return { db: { kind: 'sqlite' } };
}

function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(globalConfigPath(), 'utf8'));
    if (!parsed || !parsed.db || !['sqlite', 'postgres'].includes(parsed.db.kind)) return cloneDefault();
    if (parsed.db.kind === 'postgres' && typeof parsed.db.url !== 'string') return cloneDefault();
    return parsed;
  } catch {
    return cloneDefault();
  }
}

function saveConfig(config) {
  const value = config && config.db ? config : DEFAULT_CONFIG;
  fs.writeFileSync(globalConfigPath(), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(globalConfigPath(), 0o600);
}

function resolveDbConfig(config = loadConfig(), { environment = true } = {}) {
  if (environment && process.env.SYNTAGRAPHIA_DATABASE_URL) {
    return { kind: 'postgres', url: process.env.SYNTAGRAPHIA_DATABASE_URL, source: 'environment' };
  }
  if (config?.db?.kind === 'postgres' && config.db.url) {
    return { kind: 'postgres', url: config.db.url, source: 'config' };
  }
  return { kind: 'sqlite', source: 'default' };
}

function maskUrl(value) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (url.password) url.password = '****';
    return url.toString();
  } catch {
    return String(value).replace(/(\/\/[^/:@]+:)[^@]+@/, '$1****@');
  }
}

module.exports = { DEFAULT_CONFIG, loadConfig, saveConfig, resolveDbConfig, maskUrl };
