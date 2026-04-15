'use strict';
require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL   = 'claude-sonnet-4-6';
const SYSTEM_PROMPT     = fs.readFileSync(path.join(__dirname, 'CLAUDE.md'), 'utf8');

app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* ── POST /api/chat ─────────────────────────────────── */
// Proxies the request to Anthropic and pipes the SSE stream straight back.
// The API key never touches the browser.

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your-key-here') {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in .env' });
  }

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        stream: true,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach Anthropic API.' });
  }

  if (!upstream.ok) {
    let msg = `Anthropic API error ${upstream.status}`;
    try { const err = await upstream.json(); msg = err.error?.message || msg; } catch {}
    return res.status(upstream.status).json({ error: msg });
  }

  // Stream SSE events straight through to the browser
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { res.end(); break; }
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

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 15,
        messages: [{
          role: 'user',
          content: `Generate a concise report title (3–5 words, title case, no punctuation) for this reporting request: "${message}". Reply with ONLY the title — no explanation, no quotes.`,
        }],
      }),
    });
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
