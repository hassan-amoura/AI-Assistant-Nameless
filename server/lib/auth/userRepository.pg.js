'use strict';

/**
 * Postgres-backed user repository.
 *
 * Method names and return shapes mirror userRepository.js (the file-store
 * version) so server.js and httpAuthHandlers.js don't branch on backend.
 * Row columns (password_hash, created_at) are mapped back to the camelCase
 * shape callers already expect.
 */

const crypto = require('crypto');
const { normalizeEmail } = require('./accessPolicy');

const UNIQUE_VIOLATION = '23505';

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    memory: row.memory || null,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
  };
}

/** @param {import('pg').Pool} pool */
function createPgUserRepository(pool) {
  return {
    async findByEmail(email) {
      const n = normalizeEmail(email);
      const { rows } = await pool.query(
        'SELECT id, email, password_hash, memory, created_at FROM users WHERE email = $1',
        [n],
      );
      return rowToUser(rows[0]);
    },

    async findById(userId) {
      if (!userId) return null;
      const { rows } = await pool.query(
        'SELECT id, email, password_hash, memory, created_at FROM users WHERE id = $1',
        [userId],
      );
      return rowToUser(rows[0]);
    },

    async getMemory(userId) {
      if (!userId) return '';
      const { rows } = await pool.query(
        'SELECT memory FROM users WHERE id = $1',
        [userId],
      );
      const m = rows[0] && typeof rows[0].memory === 'string' ? rows[0].memory.trim() : '';
      return m;
    },

    async createUser(email, passwordHash) {
      const n = normalizeEmail(email);
      const id = crypto.randomUUID();
      try {
        const { rows } = await pool.query(
          `INSERT INTO users (id, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, email, password_hash, memory, created_at`,
          [id, n, passwordHash],
        );
        return rowToUser(rows[0]);
      } catch (e) {
        if (e && e.code === UNIQUE_VIOLATION) {
          const err = new Error('EMAIL_EXISTS');
          err.code = 'EMAIL_EXISTS';
          throw err;
        }
        throw e;
      }
    },
  };
}

module.exports = { createPgUserRepository };
