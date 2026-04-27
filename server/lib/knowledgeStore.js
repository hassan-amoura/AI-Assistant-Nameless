'use strict';

/**
 * JSON file persistence for workspace knowledge items.
 *
 * Follows the same pattern as documentStore.js — atomic writes via temp file
 * rename, serialized mutations to avoid torn writes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_DOC = {
  version: 1,
  workspaces: {},
};

class KnowledgeStore {
  /**
   * @param {string} filePath Absolute path to the JSON document
   */
  constructor(filePath) {
    this.filePath = filePath;
    this._dir = path.dirname(filePath);
    this._chain = Promise.resolve();
  }

  _ensureDir() {
    try {
      fs.mkdirSync(this._dir, { recursive: true });
    } catch (_) {}
  }

  _readSync() {
    this._ensureDir();
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_DOC,
        ...parsed,
        workspaces: parsed.workspaces && typeof parsed.workspaces === 'object'
          ? parsed.workspaces
          : {},
      };
    } catch (e) {
      if (e && e.code === 'ENOENT') return structuredClone(DEFAULT_DOC);
      throw e;
    }
  }

  _writeSync(doc) {
    this._ensureDir();
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    const payload = JSON.stringify(doc, null, 2);
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  mutate(fn) {
    const run = () => {
      const doc = this._readSync();
      const out = fn(doc);
      this._writeSync(doc);
      return out;
    };
    const p = this._chain.then(run, run);
    this._chain = p.catch(() => {});
    return p;
  }

  readSnapshot() {
    return this._readSync();
  }
}

const KNOWLEDGE_FILE = path.join(__dirname, '..', 'data', 'knowledge.json');
const _store = new KnowledgeStore(KNOWLEDGE_FILE);

/**
 * Get all knowledge items for a workspace.
 * @param {string} workspaceId
 * @returns {Promise<Array<{id, workspaceId, term, definition, category, source, createdAt, updatedAt}>>}
 */
async function getWorkspaceKnowledge(workspaceId) {
  const doc = _store.readSnapshot();
  return doc.workspaces[workspaceId] || [];
}

/**
 * Add a knowledge item to a workspace.
 * @param {string} workspaceId
 * @param {{term: string, definition: string, category?: string, source?: string}} item
 * @returns {Promise<{id, workspaceId, term, definition, category, source, createdAt, updatedAt}>}
 */
async function addWorkspaceKnowledge(workspaceId, item) {
  return _store.mutate((doc) => {
    if (!doc.workspaces[workspaceId]) {
      doc.workspaces[workspaceId] = [];
    }
    const now = new Date().toISOString();
    const newItem = {
      id: crypto.randomUUID(),
      workspaceId,
      term: item.term,
      definition: item.definition,
      category: item.category || null,
      source: item.source || 'user',
      createdAt: now,
      updatedAt: now,
    };
    doc.workspaces[workspaceId].push(newItem);
    return newItem;
  });
}

/**
 * Update a knowledge item.
 * @param {string} workspaceId
 * @param {string} itemId
 * @param {{term?: string, definition?: string, category?: string, source?: string}} patch
 * @returns {Promise<{id, workspaceId, term, definition, category, source, createdAt, updatedAt}|null>}
 */
async function updateWorkspaceKnowledge(workspaceId, itemId, patch) {
  return _store.mutate((doc) => {
    const items = doc.workspaces[workspaceId];
    if (!items) return null;
    const idx = items.findIndex(i => i.id === itemId);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    items[idx] = {
      ...items[idx],
      ...patch,
      id: items[idx].id,
      workspaceId: items[idx].workspaceId,
      createdAt: items[idx].createdAt,
      updatedAt: now,
    };
    return items[idx];
  });
}

module.exports = {
  getWorkspaceKnowledge,
  addWorkspaceKnowledge,
  updateWorkspaceKnowledge,
  KnowledgeStore,
};
