-- PW Report Builder — Phase 1 schema
--
-- Idempotent. Safe to run against a fresh DB or an existing one. CREATE IF NOT
-- EXISTS everywhere so `npm run db:init` and the startup safety-net both work.
--
-- Scope: users, sessions, user_preferences only. Conversations, messages,
-- tenants, and audit tables land in later phases.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY,
  email           CITEXT      NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  memory          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id                   UUID         PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_revenue_method  TEXT,
  explanation_style         TEXT,
  native_reports_first      BOOLEAN      NOT NULL DEFAULT false,
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
