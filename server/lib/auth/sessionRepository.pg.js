'use strict';

/**
 * Postgres-backed session repository.
 *
 * Opaque 32-byte hex tokens → user_id with an expires_at guard. Matches the
 * file-store interface exactly.
 *
 * The file-store version opportunistically GCs every expired row on every
 * read — fine on a local JSON file, wasteful in SQL. findValidSession here
 * guards on `expires_at > NOW()` in the WHERE clause; deleting expired rows
 * is handled by sweepExpired(), called from a scheduled interval in server.js.
 */

const crypto = require('crypto');

function rowToSession(row) {
  if (!row) return null;
  return {
    token: row.token,
    userId: row.user_id,
    expiresAt: row.expires_at instanceof Date
      ? row.expires_at.toISOString()
      : row.expires_at,
  };
}

/** @param {import('pg').Pool} pool */
function createPgSessionRepository(pool) {
  return {
    async createSession(userId, expiresAtMs) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(expiresAtMs);
      await pool.query(
        'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [token, userId, expiresAt],
      );
      return { token, userId, expiresAt: expiresAt.toISOString() };
    },

    async findValidSession(token) {
      if (!token) return null;
      const { rows } = await pool.query(
        `SELECT token, user_id, expires_at
         FROM sessions
         WHERE token = $1 AND expires_at > NOW()`,
        [token],
      );
      return rowToSession(rows[0]);
    },

    async revokeSession(token) {
      if (!token) return;
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    },

    async revokeAllForUser(userId) {
      if (!userId) return;
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    },

    /**
     * Delete rows whose expires_at is older than (NOW - graceMs). Called from
     * the session-sweep interval in server.js. Returns the number of rows
     * removed so the caller can log.
     */
    async sweepExpired(graceMs) {
      const ms = Math.max(0, Number(graceMs) || 0);
      const { rowCount } = await pool.query(
        `DELETE FROM sessions WHERE expires_at < NOW() - ($1::bigint * interval '1 millisecond')`,
        [ms],
      );
      return rowCount || 0;
    },
  };
}

module.exports = { createPgSessionRepository };
