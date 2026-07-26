'use strict';

const path = require('path');

/**
 * Resolve the project root directory Syntagraphia operates on.
 * Precedence: explicit --dir flag  >  SYNTAGRAPHIA_DIR env  >  process.cwd()
 */
function resolveRootDir(explicitDir) {
  if (explicitDir) return path.resolve(explicitDir);
  if (process.env.SYNTAGRAPHIA_DIR) return path.resolve(process.env.SYNTAGRAPHIA_DIR);
  return path.resolve(process.cwd());
}

/** Path to the project-tracker.db inside a root dir. */
function dbPath(rootDir) {
  return path.join(rootDir, 'project-tracker.db');
}

module.exports = { resolveRootDir, dbPath };
