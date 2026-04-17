'use strict';

/**
 * Opaque session tokens → userId. Replace with Redis/DB session table later.
 */

const crypto = require('crypto');

/** @param {import('../persistence/documentStore').DocumentStore} store */
function createSessionRepository(store) {
  return {
    async createSession(userId, expiresAtMs) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(expiresAtMs).toISOString();
      await store.mutate(doc => {
        doc.sessions.push({ token, userId, expiresAt });
      });
      return { token, userId, expiresAt };
    },

    /** @returns {Promise<{ token: string, userId: string, expiresAt: string } | null>} */
    async findValidSession(token) {
      if (!token) return null;
      const now = Date.now();
      let found = null;
      await store.mutate(doc => {
        doc.sessions = doc.sessions.filter(s => new Date(s.expiresAt).getTime() > now);
        found = doc.sessions.find(s => s.token === token) || null;
      });
      return found;
    },

    async revokeSession(token) {
      if (!token) return;
      await store.mutate(doc => {
        doc.sessions = doc.sessions.filter(s => s.token !== token);
      });
    },

    async revokeAllForUser(userId) {
      await store.mutate(doc => {
        doc.sessions = doc.sessions.filter(s => s.userId !== userId);
      });
    },
  };
}

module.exports = { createSessionRepository };
