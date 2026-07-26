'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Path to the single global Syntagraphia DB for this machine.
 * Lives at ~/.syntagraphia/project-tracker.db; the directory is created on demand.
 */
function globalDbPath() {
  const dir = path.join(os.homedir(), '.syntagraphia');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'project-tracker.db');
}

module.exports = { globalDbPath };
