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

module.exports = { globalDataDir, globalDbPath, globalConfigPath };
