'use strict';

const fs = require('fs');
const path = require('path');
const { globalTemplateDir, globalTemplatePath } = require('./paths');

const TEMPLATE_TYPES = ['feature', 'tech_spec', 'task', 'verification'];
const DEFAULT_TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'doc-content');

function assertType(type) {
  if (!TEMPLATE_TYPES.includes(type)) {
    throw new Error(`Invalid template type '${type}'. Valid: ${TEMPLATE_TYPES.join(', ')}`);
  }
}

function defaultPath(type) {
  assertType(type);
  return path.join(DEFAULT_TEMPLATE_DIR, `${type}.md`);
}

function customPath(type) {
  assertType(type);
  return globalTemplatePath(type);
}

function hasCustom(type) {
  const filePath = customPath(type);
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function read(type) {
  const overridePath = customPath(type);
  try {
    return {
      type,
      source: 'custom',
      path: overridePath,
      content: fs.readFileSync(overridePath, 'utf8'),
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const packagedPath = defaultPath(type);
    return {
      type,
      source: 'default',
      path: packagedPath,
      content: fs.readFileSync(packagedPath, 'utf8'),
    };
  }
}

function list() {
  return TEMPLATE_TYPES.map((type) => {
    const custom = hasCustom(type);
    return {
      type,
      source: custom ? 'custom' : 'default',
      path: custom ? customPath(type) : defaultPath(type),
    };
  });
}

function set(type, content) {
  const filePath = customPath(type);
  globalTemplateDir();
  fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return filePath;
}

function reset(type) {
  const filePath = customPath(type);
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = {
  TEMPLATE_TYPES,
  assertType,
  defaultPath,
  customPath,
  read,
  list,
  set,
  reset,
};
