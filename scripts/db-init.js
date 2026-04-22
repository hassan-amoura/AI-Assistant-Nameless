'use strict';

/**
 * Apply db/schema.sql against DATABASE_URL. Idempotent — safe to re-run.
 * Usage: npm run db:init
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

  const sqlPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const pool = new Pool({
    connectionString: url,
    ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await pool.query(sql);
    console.log('db:init — schema applied.');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('db:init failed:', err.message);
  process.exit(1);
});
