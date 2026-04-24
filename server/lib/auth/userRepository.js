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
     * Server-side memory/notes for a user — free-text preferences the AI may
     * read. Always fetched server-side from the authenticated user's record;
     * never trusted from client input (that would be a prompt-injection hole).
     * Returns '' if the user has no memory stored or the user is not found.
     */
    async getMemory(userId) {
      if (!userId) return '';
      const doc = store.readSnapshot();
      const row = doc.users.find(u => u.id === userId);
      if (!row) return '';
      const m = typeof row.memory === 'string' ? row.memory.trim() : '';
      return m;
    },

    async setMemory(userId, text) {
      if (!userId) return;
      await store.mutate(doc => {
        const user = doc.users.find(u => u.id === userId);
        if (user) user.memory = typeof text === 'string' ? text.slice(0, 8000) : '';
      });
    },

    /**
     * @returns {Promise<{ id: string, email: string, passwordHash: string, createdAt: string }>}
     */
    async setResetToken(userId, token, expiresAt) {
      await store.mutate(doc => {
        const user = doc.users.find(u => u.id === userId);
        if (user) {
          user.resetToken = token;
          user.resetTokenExpiresAt = expiresAt;
        }
      });
    },

    async findByResetToken(token) {
      const doc = store.readSnapshot();
      return doc.users.find(u => u.resetToken === token) || null;
    },

    async clearResetToken(userId) {
      await store.mutate(doc => {
        const user = doc.users.find(u => u.id === userId);
        if (user) {
          user.resetToken = null;
          user.resetTokenExpiresAt = null;
        }
      });
    },

    async updatePasswordHash(userId, newHash) {
      await store.mutate(doc => {
        const user = doc.users.find(u => u.id === userId);
        if (user) user.passwordHash = newHash;
      });
    },

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
