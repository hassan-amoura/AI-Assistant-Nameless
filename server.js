'use strict';

// ══════════════════════════════════════════════════════════════
// DEMO MODE — current state of this application
// ══════════════════════════════════════════════════════════════
//
// WHAT WORKS NOW
//   ✓ AI chat interface — main stream uses ANTHROPIC_MODEL / ANTHROPIC_MODEL_MAIN
//   ✓ Cheap intake + title path uses ANTHROPIC_MODEL_LIGHT (see server/lib/models.js)
//   ✓ T-SQL generation for Metabase with Projectworks schema awareness
//   ✓ Query reasoning block (transparent AI decision-making)
//   ✓ SQL syntax highlighting, copy, and download
//   ✓ Conversation history persisted in browser localStorage
//   ✓ Email + password auth, cookie sessions, self sign-up (internal + pilot allowlist)
//   ✓ iFrame embedding with CSP frame-ancestors allowlist
//   ✓ orgID context capture for multi-tenant iFrame embedding
//   ✓ Schema version tracking via CLAUDE.md metadata
//   ✓ Live schema fetcher scaffold (schemaFetcher.js) — awaiting DB creds
//
// REQUIRES DATABASE CONNECTION  (set DB_HOST … DB_NAME in .env)
//   → Live schema introspection via schemaFetcher.js
//     (currently falls back to the static schema in CLAUDE.md)
//   → Actual SQL execution and live result display in the UI
//   → CSV export of real query results (currently exports query text only)
//   → Org-scoped data access driven by the pw_org_id cookie
//
// REQUIRES PROJECTWORKS SSO (future)
//   → Replace cookie session creation with SSO callback + tenant claims
//   → Wire "Login with Projectworks" to OAuth / SAML as appropriate
//
// REQUIRES DATABASE (or equivalent persistence layer)
//   → Swap server/lib/persistence/documentStore.js for SQL repositories
//   → Server-side conversation history (currently localStorage only)
//   → Per-user query history and audit log; stronger session store
//
// ══════════════════════════════════════════════════════════════

require('dotenv').config();

const express = require('express');
const path = require('path');

const { readClaudeMd, buildLegacySystemPrompt } = require('./server/lib/claudeMd');
const { getAnthropicModelMain, getAnthropicModelLight } = require('./server/lib/models');
const { truncateMessages } = require('./server/lib/contextBuilder');
const { classifyIntent } = require('./server/lib/intake');
const { buildChatSystemForRequest } = require('./server/lib/buildChatSystem');
const { anthropicMessagesWithRetry } = require('./server/lib/anthropicClient');
const { rateLimitHit } = require('./server/lib/rateLimit');

const app  = express();
const PORT = process.env.PORT || 3000;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Live schema fetcher — returns null when DB_HOST is not set, falling back
// to the static schema embedded in CLAUDE.md.
// See schemaFetcher.js for the full upgrade path description.
const { fetchLiveSchema } = require('./schemaFetcher');

// ─────────────────────────────────────────────────────────
// PROJECTWORKS IFRAME INTEGRATION
//
// This is the integration point for embedding PW Report Builder
// inside the Projectworks product shell as an iframe widget.
//
// When embedding is ready, this will grow to include:
//   - Signed JWT URL verification (so only authorised PW tenants can load it)
//   - Org-scoped database access driven by the orgID below
//
// Reference: Metabase uses a signed-JWT iframe embedding pattern for exactly
// this use case. See metabase.com/docs/latest/embedding/signed-embedding
// for the approach to discuss with Rob when that conversation happens.
// ─────────────────────────────────────────────────────────

// Comma-separated list of domains allowed to embed this app in an iframe.
// e.g. ALLOWED_EMBED_DOMAINS=projectworks.com,projectworks.io,localhost
const ALLOWED_EMBED_DOMAINS = (process.env.ALLOWED_EMBED_DOMAINS || '')
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean);

// Builds the frame-ancestors CSP directive from the domain list.
// Each domain gets both the apex and wildcard-subdomain variant.
// 'localhost' maps to http://localhost:* for local dev convenience.
function buildFrameAncestors(domains) {
  if (!domains.length) return null;
  const sources = domains.flatMap(d => {
    if (d === 'localhost') return ['http://localhost:*'];
    return [`https://${d}`, `https://*.${d}`];
  });
  return `frame-ancestors 'self' ${sources.join(' ')}`;
}

// ═══ v1 auth — cookie sessions + JSON file store (migration-friendly) ═══
// REPLACE: swap DocumentStore + repositories for Postgres / managed auth without
// changing Express route names used by the SPA (`/auth/*`, `/api/auth/me`, …).

const { DocumentStore } = require('./server/lib/persistence/documentStore');
const { createUserRepository } = require('./server/lib/auth/userRepository');
const { createSessionRepository } = require('./server/lib/auth/sessionRepository');
const { createPreferencesService } = require('./server/lib/preferences/preferencesService');
const { createAttachUserMiddleware, requireAuthenticatedPage } = require('./server/lib/auth/authMiddleware');
const { createHttpAuthHandlers } = require('./server/lib/auth/httpAuthHandlers');

const DATA_PATH = process.env.PW_DATA_FILE || path.join(__dirname, 'server', 'data', 'app-data.json');
const documentStore = new DocumentStore(DATA_PATH);
const userRepo = createUserRepository(documentStore);
const sessionRepo = createSessionRepository(documentStore);
const preferencesService = createPreferencesService(documentStore);

const SESSION_MAX_DAYS = Math.max(1, Math.min(366, parseInt(process.env.SESSION_MAX_DAYS || '30', 10) || 30));
const sessionMaxAgeMs = SESSION_MAX_DAYS * 24 * 60 * 60 * 1000;

const authHandlers = createHttpAuthHandlers({
  users: userRepo,
  sessions: sessionRepo,
  preferences: preferencesService,
  sessionMaxAgeMs,
});
const attachUser = createAttachUserMiddleware(sessionRepo, userRepo);

function isPublicAuthRoute(req) {
  const { path: p, method: m } = req;
  if (p === '/login' && m === 'GET') return true;
  if (p === '/login.css' && m === 'GET') return true;
  if (p === '/auth/login' && m === 'POST') return true;
  if (p === '/auth/signup' && m === 'POST') return true;
  if (p === '/logout' && m === 'GET') return true;
  return false;
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/* ── iframe embedding headers ───────────────────────── */
// Set on every response. Allows embedding from ALLOWED_EMBED_DOMAINS only.
// When no domains are configured, embedding is denied entirely.
// Note: X-Frame-Options is a legacy header superseded by CSP frame-ancestors
// in all modern browsers — we remove it to avoid conflicts.

app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  const ancestors = buildFrameAncestors(ALLOWED_EMBED_DOMAINS);
  res.setHeader(
    'Content-Security-Policy',
    ancestors || "frame-ancestors 'none'",
  );
  next();
});

/* ── Session + auth gate ─────────────────────────────── */
// Public: /login, /login.css, /auth/login, /auth/signup, /logout — see isPublicAuthRoute.

app.use(attachUser);
app.use((req, res, next) => {
  if (isPublicAuthRoute(req)) return next();
  return requireAuthenticatedPage(req, res, next);
});

app.get('/login', authHandlers.handleGetLogin);
app.get('/login.css', (req, res) => {
  res.type('text/css');
  res.sendFile(path.join(__dirname, 'server', 'views', 'login.css'));
});
app.post('/auth/login', authHandlers.handlePostLogin);
app.post('/auth/signup', authHandlers.handlePostSignup);
app.get('/logout', authHandlers.handleGetLogout);

/* ── orgID context (iframe embedding) ──────────────── */
// Projectworks passes ?orgID=<id> when embedding this tool in an iframe.
// We capture it here and store it in a short-lived cookie so downstream
// request handlers can read it without re-parsing the URL.
//
// TODO: once the database connection is wired up, use pw_org_id to scope
// all reporting queries to the correct tenant's data.

app.use((req, res, next) => {
  const orgID = req.query.orgID;
  if (orgID && /^[a-zA-Z0-9_-]{1,64}$/.test(orgID)) {
    res.cookie('pw_org_id', orgID, {
      httpOnly: true,
      path: '/',
      // SameSite=None + Secure required for cross-site iframe cookies in production.
      // In development we fall back to Lax so it works without HTTPS.
      ...(process.env.NODE_ENV === 'production'
        ? { sameSite: 'none', secure: true }
        : { sameSite: 'lax' }),
    });
    console.log(`[org-context] orgID=${orgID} — will be used for org-scoped data access`);
  }
  next();
});

app.use(express.static(path.join(__dirname)));

/* ── GET /api/schema-version ────────────────────────── */
// Returns the schema version metadata from CLAUDE.md and whether a live
// database is configured. Useful for confirming which schema the AI is using.

app.get('/api/schema-version', (req, res) => {
  const md             = readClaudeMd();
  const versionMatch   = md.match(/SCHEMA_VERSION:\s*([^\s|]+)/);
  const updatedMatch   = md.match(/SCHEMA_LAST_UPDATED:\s*([^\s|]+)/);
  res.json({
    version:      versionMatch ? versionMatch[1] : 'unknown',
    lastUpdated:  updatedMatch ? updatedMatch[1] : 'unknown',
    // 'live' means DB credentials are present; the actual fetch may still
    // fall back to static if the connection fails at request time.
    schemaSource: process.env.DB_HOST ? 'live' : 'static',
  });
});

/* ── GET /api/auth/me · PATCH /api/preferences ─────── */
// FUTURE: merge preferredRevenueMethod + explanationStyle into AI prompt / memory layer.

app.get('/api/auth/me', authHandlers.handleGetMe);
app.patch('/api/preferences', authHandlers.handlePatchPreferences);

/* ── POST /api/chat ─────────────────────────────────── */
// Proxies the request to Anthropic and pipes the SSE stream straight back.
// The API key never touches the browser.

app.post('/api/chat', async (req, res) => {
  const { messages, advisorMode: advisorModeBody, userMemory } = req.body;
  const advisorMode = !!advisorModeBody;

  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your-key-here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in .env' });
  }

  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const clientIp = req.ip || req.socket?.remoteAddress || 'global';
  if (rateLimitHit(`chat:${clientIp}`, { windowMs: 60_000, max: 40 })) {
    return res.status(429).json({ error: 'Too many requests — try again in a minute.' });
  }

  // UI keeps full history; API only forwards a tail to Anthropic (token control).
  const truncated = truncateMessages(messages);

  /**
   * Optional escape hatch: DISABLE_AI_INTAKE=1 forces legacy behaviour
   * (full schema every turn, main model only) for debugging / regression.
   */
  let system;
  let model = getAnthropicModelMain();
  let maxTokens = 3072;

  if (process.env.DISABLE_AI_INTAKE === '1') {
    const liveSchema = await fetchLiveSchema();
    system = buildLegacySystemPrompt(liveSchema);
    maxTokens = 4096;
  } else {
    // Intake (cheap) and live schema fetch can run concurrently to hide latency.
    const [liveSchema, intake] = await Promise.all([
      fetchLiveSchema(),
      classifyIntent(truncated, ANTHROPIC_API_KEY),
    ]);
    // UI Advisor mode: always conversation layer (no SQL engine route), per CLAUDE.md.
    const route = advisorMode
      ? 'data_advisor'
      : intake.route === 'data_advisor'
        ? 'data_advisor'
        : 'sql_engine';
    const built = buildChatSystemForRequest({
      route,
      family: intake.family,
      liveSchema,
      messages: truncated,
    });
    system = built.system;
    if (route === 'data_advisor') maxTokens = 2048;
  }

  // PLACEHOLDER: pw_user_memory injection.
  // In production, retrieve userMemory from the server-side user record after
  // the persistence layer is added — do not trust the client-supplied value for auth.
  if (userMemory && typeof userMemory === 'string' && userMemory.trim()) {
    const memBlock = `--- USER MEMORY ---\n${userMemory.trim()}\n--- END USER MEMORY ---\n\n`;
    system = memBlock + system;
  }

  let upstream;
  try {
    upstream = await anthropicMessagesWithRetry(
      {
        model,
        max_tokens: maxTokens,
        stream: true,
        system,
        messages: truncated,
      },
      ANTHROPIC_API_KEY,
      { maxRetries: 3 },
    );
  } catch {
    return res.status(502).json({ error: 'Could not reach Anthropic API.' });
  }

  if (!upstream.ok) {
    let msg = `Anthropic API error ${upstream.status}`;
    try {
      const err = await upstream.json();
      msg = err.error?.message || msg;
    } catch {}
    return res.status(upstream.status).json({ error: msg });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        break;
      }
      res.write(value);
    }
  } catch {
    res.end();
  }
});

/* ── POST /api/title ────────────────────────────────── */
// Generates a short sidebar title for the conversation.

app.post('/api/title', async (req, res) => {
  const { message } = req.body;

  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your-key-here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in .env' });
  }

  const clientIp = req.ip || req.socket?.remoteAddress || 'global';
  if (rateLimitHit(`title:${clientIp}`, { windowMs: 60_000, max: 60 })) {
    return res.status(429).json({ error: 'Too many requests — try again shortly.' });
  }

  let upstream;
  try {
    upstream = await anthropicMessagesWithRetry(
      {
        model: getAnthropicModelLight(),
        max_tokens: 24,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Generate a concise report title (3–5 words, title case, no punctuation) for this reporting request: "${String(message || '').slice(0, 2000)}". Reply with ONLY the title — no explanation, no quotes.`,
        }],
      },
      ANTHROPIC_API_KEY,
      { maxRetries: 2 },
    );
  } catch {
    return res.status(502).json({ error: 'Could not reach Anthropic API.' });
  }

  if (!upstream.ok) return res.status(upstream.status).json({ error: 'Title generation failed.' });

  const data = await upstream.json().catch(() => ({}));
  res.json({ title: data.content?.[0]?.text?.trim() || null });
});

app.listen(PORT, () => {
  console.log(`\nPW Report Builder → http://localhost:${PORT}\n`);
});
