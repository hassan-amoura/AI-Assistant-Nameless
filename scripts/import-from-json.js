'use strict';

/**
 * Import users / sessions / preferences from the file-store JSON into Postgres.
 *
 * Usage:
 *   npm run db:import                 # uses PW_DATA_FILE or the default path
 *   node scripts/import-from-json.js <path-to-json>
 *
 * Idempotent — upserts on email (users) and primary key (sessions, prefs).
 * Run after db:init. Safe to re-run; existing rows are updated, not duplicated.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and set it.');
    process.exit(1);
  }

  const jsonPath = process.argv[2]
    || process.env.PW_DATA_FILE
    || path.join(__dirname, '..', 'server', 'data', 'app-data.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`No JSON file at ${jsonPath} — nothing to import.`);
    process.exit(1);
  }

  const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const users = Array.isArray(doc.users) ? doc.users : [];
  const sessions = Array.isArray(doc.sessions) ? doc.sessions : [];
  const preferences = doc.preferences && typeof doc.preferences === 'object' ? doc.preferences : {};

  const pool = new Pool({
    connectionString: url,
    ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let uCount = 0;
    for (const u of users) {
      if (!u || !u.id || !u.email || !u.passwordHash) continue;
      await client.query(
        `INSERT INTO users (id, email, password_hash, memory, created_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
         ON CONFLICT (email) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           memory        = EXCLUDED.memory`,
        [u.id, String(u.email).toLowerCase(), u.passwordHash, u.memory || null, u.createdAt || null],
      );
      uCount += 1;
    }

    let sCount = 0;
    for (const s of sessions) {
      if (!s || !s.token || !s.userId || !s.expiresAt) continue;
      await client.query(
        `INSERT INTO sessions (token, user_id, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (token) DO UPDATE SET
           user_id    = EXCLUDED.user_id,
           expires_at = EXCLUDED.expires_at`,
        [s.token, s.userId, s.expiresAt],
      );
      sCount += 1;
    }

    let pCount = 0;
    for (const [userId, prefs] of Object.entries(preferences)) {
      if (!userId || !prefs || typeof prefs !== 'object') continue;
      await client.query(
        `INSERT INTO user_preferences
           (user_id, preferred_revenue_method, explanation_style, native_reports_first, updated_at)
         VALUES ($1, $2, $3, COALESCE($4, false), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           preferred_revenue_method = EXCLUDED.preferred_revenue_method,
           explanation_style        = EXCLUDED.explanation_style,
           native_reports_first     = EXCLUDED.native_reports_first,
           updated_at               = NOW()`,
        [
          userId,
          prefs.preferredRevenueMethod || null,
          prefs.explanationStyle || null,
          typeof prefs.nativeReportsFirst === 'boolean' ? prefs.nativeReportsFirst : false,
        ],
      );
      pCount += 1;
    }

    await client.query('COMMIT');
    console.log(`db:import — users=${uCount}, sessions=${sCount}, preferences=${pCount}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('db:import failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('db:import crashed:', err.message);
  process.exit(1);
});
