'use strict';

/**
 * JSON file persistence for v1 users, sessions, and preferences.
 *
 * REPLACE LATER: swap this module for a database-backed repository without
 * changing callers — userRepository / sessionRepository / preferencesRepository
 * should depend on an interface, not this file format.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_DOC = {
  version: 1,
  users: [],
  sessions: [],
  preferences: {},
};

class DocumentStore {
  /**
   * @param {string} filePath Absolute path to the JSON document (e.g. server/data/app-data.json)
   */
  constructor(filePath) {
    this.filePath = filePath;
    this._dir = path.dirname(filePath);
    /** @type {Promise<void>} */
    this._chain = Promise.resolve();
  }

  _ensureDir() {
    try {
      fs.mkdirSync(this._dir, { recursive: true });
    } catch (_) {}
  }

  /** @returns {typeof DEFAULT_DOC} */
  _readSync() {
    this._ensureDir();
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_DOC,
        ...parsed,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        preferences: parsed.preferences && typeof parsed.preferences === 'object'
          ? parsed.preferences
          : {},
      };
    } catch (e) {
      if (e && e.code === 'ENOENT') return structuredClone(DEFAULT_DOC);
      throw e;
    }
  }

  /** @param {typeof DEFAULT_DOC} doc */
  _writeSync(doc) {
    this._ensureDir();
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    const payload = JSON.stringify(doc, null, 2);
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  /**
   * Serialize mutations to avoid torn writes under concurrent requests.
   * @template T
   * @param {(doc: typeof DEFAULT_DOC) => T} fn
   * @returns {Promise<T>}
   */
  mutate(fn) {
    const run = () => {
      const doc = this._readSync();
      const out = fn(doc);
      this._writeSync(doc);
      return out;
    };
    const p = this._chain.then(run, run);
    // Keep the queue alive even when `run` rejects (caller still gets the rejection).
    this._chain = p.catch(() => {});
    return p;
  }

  /**
   * Read-only snapshot (no lock — use mutate for consistency-critical reads).
   * @returns {typeof DEFAULT_DOC}
   */
  readSnapshot() {
    return this._readSync();
  }
}

module.exports = { DocumentStore, DEFAULT_DOC };
