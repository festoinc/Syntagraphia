'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

function globalDataDir() {
  const dir = path.join(os.homedir(), '.syntagraphia');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Path to the single global Syntagraphia DB for this machine. */
function globalDbPath() {
  return path.join(globalDataDir(), 'project-tracker.db');
}

/** Path to the machine-level backend configuration. */
function globalConfigPath() {
  return path.join(globalDataDir(), 'config.json');
}

/** Path to the PID record for a background UI server. */
function globalUiServerPath() {
  return path.join(globalDataDir(), 'ui-server.json');
}

/** Directory for machine-wide document template overrides. */
function globalTemplateDir() {
  const dir = path.join(globalDataDir(), 'templates');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch { /* best effort on platforms without chmod */ }
  return dir;
}

function globalTemplatePath(type) {
  return path.join(globalTemplateDir(), `${type}.md`);
}

module.exports = { globalDataDir, globalDbPath, globalConfigPath, globalUiServerPath, globalTemplateDir, globalTemplatePath };
