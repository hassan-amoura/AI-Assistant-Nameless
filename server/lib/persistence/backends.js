'use strict';

/**
 * Persistence backend selector.
 *
 * One public entry point — createPersistence() — decides at boot whether to
 * wire Postgres-backed or file-backed repositories based on DATABASE_URL.
 * Returns { backend, userRepo, sessionRepo, preferencesService, pool? }.
 *
 * The three repository method signatures are identical across backends so
 * callers (server.js, httpAuthHandlers.js) do not branch on backend type.
 */

const path = require('path');

const { getPool } = require('./pgPool');

// File-store factories
const { DocumentStore } = require('./documentStore');
const { createUserRepository } = require('../auth/userRepository');
const { createSessionRepository } = require('../auth/sessionRepository');
const { createPreferencesService } = require('../preferences/preferencesService');

// Postgres-backed factories
const { createPgUserRepository } = require('../auth/userRepository.pg');
const { createPgSessionRepository } = require('../auth/sessionRepository.pg');
const { createPgPreferencesService } = require('../preferences/preferencesService.pg');

/**
 * @returns {{
 *   backend: 'pg' | 'file',
 *   userRepo: any,
 *   sessionRepo: any,
 *   preferencesService: any,
 *   pool: import('pg').Pool | null,
 * }}
 */
function createPersistence() {
  const pool = getPool();

  if (pool) {
    return {
      backend: 'pg',
      pool,
      userRepo: createPgUserRepository(pool),
      sessionRepo: createPgSessionRepository(pool),
      preferencesService: createPgPreferencesService(pool),
    };
  }

  const DATA_PATH = process.env.PW_DATA_FILE
    || path.join(process.cwd(), 'server', 'data', 'app-data.json');
  const store = new DocumentStore(DATA_PATH);

  return {
    backend: 'file',
    pool: null,
    userRepo: createUserRepository(store),
    sessionRepo: createSessionRepository(store),
    preferencesService: createPreferencesService(store),
  };
}

module.exports = { createPersistence };
