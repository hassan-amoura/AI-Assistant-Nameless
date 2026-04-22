'use strict';

/**
 * Postgres connection pool — one per process.
 *
 * Created lazily on first call to getPool(). Returns null when DATABASE_URL is
 * not set so callers can detect the fallback-to-file-store case without
 * importing this module conditionally.
 *
 * Production tuning lives in env vars (PGPOOL_MAX, etc.) so we don't hard-code
 * a value that suits one deploy shape over another.
 */

const { Pool } = require('pg');

let _pool = null;

function getPool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  _pool = new Pool({
    connectionString: url,
    max: Number(process.env.PGPOOL_MAX) || 10,
    idleTimeoutMillis: Number(process.env.PGPOOL_IDLE_MS) || 30_000,
    // Managed Postgres providers (Render/Fly/Supabase/Neon) require TLS.
    // Local docker-compose doesn't; keep both paths working.
    ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
  });

  _pool.on('error', (err) => {
    // A connection error on an idle client should not crash the server.
    console.error('[pg] idle client error:', err.message);
  });

  return _pool;
}

async function closePool() {
  if (!_pool) return;
  await _pool.end();
  _pool = null;
}

module.exports = { getPool, closePool };
