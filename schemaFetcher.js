'use strict';

// ─────────────────────────────────────────────────────────
// SCHEMA FETCHER — Live database schema discovery
//
// This is the single most important upgrade path for PW Report Builder.
//
// Right now the schema in CLAUDE.md is maintained by hand. Every time a
// reporting view is added, renamed, or gets a new column, CLAUDE.md needs
// a manual edit — and if that edit is missed the AI silently works from
// stale information and may generate broken queries.
//
// When DB_HOST is set in .env this module connects to the Projectworks
// reporting database, introspects INFORMATION_SCHEMA, and returns an
// up-to-date schema string that server.js splices into the system prompt
// before every /api/chat request. The result:
//
//   - Zero schema drift between the reporting database and the AI
//   - No manual CLAUDE.md edits required for schema changes
//   - The app self-maintains as the Projectworks data model evolves
//
// Until DB_HOST is set this module returns null and server.js falls back
// to the static schema in CLAUDE.md silently.
// ─────────────────────────────────────────────────────────

// Simple in-memory cache — avoids a DB round-trip on every chat message.
// The schema rarely changes mid-session; 5 minutes is a safe TTL.
let _cachedSchema = null;
let _cacheExpiry  = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchLiveSchema() {
  // Fast-path: no DB configured — caller falls back to CLAUDE.md
  if (!process.env.DB_HOST) return null;

  // Return cached result if still fresh
  if (_cachedSchema && Date.now() < _cacheExpiry) return _cachedSchema;

  // Lazy-require so the app starts cleanly even if mssql is not installed
  let sql;
  try {
    sql = require('mssql');
  } catch {
    console.warn('[schema] mssql is not installed — run: npm install mssql');
    return null;
  }

  const config = {
    server:   process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT || '1433', 10),
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    options: {
      encrypt:               true,
      // Set DB_TRUST_CERT=true in .env for self-signed certs (dev/staging)
      trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
      connectTimeout:  10_000,
      requestTimeout:  20_000,
    },
  };

  let pool;
  try {
    pool = await sql.connect(config);

    // Introspect every table and column in the reporting schema.
    // ORDINAL_POSITION preserves the column order defined in the view/table
    // so the output matches the hand-written schema in CLAUDE.md.
    const result = await pool.request().query(`
      SELECT
          t.TABLE_NAME,
          c.COLUMN_NAME,
          c.ORDINAL_POSITION
      FROM INFORMATION_SCHEMA.TABLES  t
      JOIN INFORMATION_SCHEMA.COLUMNS c
          ON  t.TABLE_SCHEMA = c.TABLE_SCHEMA
          AND t.TABLE_NAME   = c.TABLE_NAME
      WHERE t.TABLE_SCHEMA = 'reporting'
        AND t.TABLE_TYPE   = 'BASE TABLE'
      ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
    `);

    if (!result.recordset.length) {
      console.warn('[schema] Live query returned no tables in the reporting schema — check DB_NAME and permissions.');
      return null;
    }

    // Group columns by table name preserving insertion order
    const tables = new Map();
    for (const row of result.recordset) {
      if (!tables.has(row.TABLE_NAME)) tables.set(row.TABLE_NAME, []);
      tables.get(row.TABLE_NAME).push(row.COLUMN_NAME);
    }

    // Build a schema description string that matches the CLAUDE.md format
    // so the AI receives exactly the same structure it was trained on
    const fetchedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    let schema = `## PROJECTWORKS REPORTING SCHEMA (live — fetched ${fetchedAt})\n\n`;
    for (const [tableName, columns] of tables) {
      schema += `- **reporting.${tableName}**: ${columns.join(', ')}\n`;
    }

    _cachedSchema = schema;
    _cacheExpiry  = Date.now() + CACHE_TTL_MS;
    console.log(`[schema] Live schema loaded — ${tables.size} tables (cached for 5 min)`);
    return schema;

  } catch (err) {
    // Log but don't crash — server.js will fall back to CLAUDE.md
    console.error(`[schema] Live schema fetch failed: ${err.message}`);
    return null;
  } finally {
    if (pool) pool.close().catch(() => {});
  }
}

// Expose for testing / manual cache invalidation if needed
function clearSchemaCache() {
  _cachedSchema = null;
  _cacheExpiry  = 0;
}

module.exports = { fetchLiveSchema, clearSchemaCache };
