'use strict';

/**
 * User records — backed by DocumentStore today, DB later.
 * FUTURE: replace with SQL/ORM; keep method names stable for callers.
 */

const crypto = require('crypto');
const { normalizeEmail } = require('./accessPolicy');

/** @param {import('../persistence/documentStore').DocumentStore} store */
function createUserRepository(store) {
  return {
    async findByEmail(email) {
      const n = normalizeEmail(email);
      const doc = store.readSnapshot();
      return doc.users.find(u => u.email === n) || null;
    },

    async findById(userId) {
      const doc = store.readSnapshot();
      return doc.users.find(u => u.id === userId) || null;
    },

    /**
     * @returns {Promise<{ id: string, email: string, passwordHash: string, createdAt: string }>}
     */
    async createUser(email, passwordHash) {
      const n = normalizeEmail(email);
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      await store.mutate(doc => {
        if (doc.users.some(u => u.email === n)) {
          const err = new Error('EMAIL_EXISTS');
          err.code = 'EMAIL_EXISTS';
          throw err;
        }
        doc.users.push({
          id,
          email: n,
          passwordHash,
          createdAt,
        });
      });
      return { id, email: n, passwordHash, createdAt };
    },
  };
}

module.exports = { createUserRepository };
