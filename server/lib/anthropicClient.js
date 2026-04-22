'use strict';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Build an Anthropic `system` array with prompt caching markers.
 *
 * Inputs are two string arrays, already ordered:
 *   cachedBlocks   — stable prefix content. Each becomes a text block with
 *                    cache_control: { type: 'ephemeral' }. These form the
 *                    cache breakpoint chain — identical prefix content across
 *                    requests short-circuits on the Anthropic side, cutting
 *                    input cost ~90% on cache hit.
 *   dynamicBlocks  — per-request / per-user tail (mode suffix, template hint,
 *                    user preferences, etc.). Never cached.
 *
 * Empty / whitespace-only strings are dropped so cache keys stay stable.
 *
 * @param {string[]} cachedBlocks
 * @param {string[]} dynamicBlocks
 * @returns {Array<{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }>}
 */
function buildSystemWithCache(cachedBlocks, dynamicBlocks) {
  const out = [];
  for (const text of cachedBlocks || []) {
    if (typeof text !== 'string' || !text.trim()) continue;
    out.push({
      type: 'text',
      text,
      cache_control: { type: 'ephemeral' },
    });
  }
  for (const text of dynamicBlocks || []) {
    if (typeof text !== 'string' || !text.trim()) continue;
    out.push({ type: 'text', text });
  }
  return out;
}

/**
 * Low-level POST helper with simple 429 / 529 backoff for production guardrails.
 * `body.system` may be a string (legacy / uncached) or an array of text blocks
 * produced by buildSystemWithCache — Anthropic accepts both.
 */
async function anthropicMessagesOnce(body, apiKey) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  return res;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function anthropicMessagesWithRetry(body, apiKey, { maxRetries = 3 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= maxRetries) {
    const res = await anthropicMessagesOnce(body, apiKey);
    if (res.ok) {
      // TEMPORARY: log the Anthropic usage object after each successful call.
      // Clones the response so streaming consumers are unaffected. Fire-and-forget.
      logUsageFromResponse(res).catch(() => {});
      return res;
    }
    const status = res.status;
    const retryable = status === 429 || status === 529 || status === 503;
    lastErr = res;
    if (!retryable || attempt === maxRetries) return res;
    const delay = Math.min(8000, 400 * 2 ** attempt) + Math.random() * 200;
    await sleep(delay);
    attempt += 1;
  }
  return lastErr;
}

// TEMPORARY: scans a cloned response for the Anthropic `usage` object and
// logs it once per call. Handles both streaming (SSE — usage arrives in
// message_start and message_delta events) and non-streaming JSON responses.
// Remove when caching/metrics instrumentation lands properly.
async function logUsageFromResponse(res) {
  try {
    const clone = res.clone();
    const ct = clone.headers.get('content-type') || '';

    if (ct.includes('text/event-stream')) {
      const reader = clone.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const usage = {};
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const ev of events) {
          for (const line of ev.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'message_start' && data.message && data.message.usage) {
                Object.assign(usage, data.message.usage);
              } else if (data.type === 'message_delta' && data.usage) {
                Object.assign(usage, data.usage);
              }
            } catch { /* skip non-JSON lines */ }
          }
        }
      }
      console.log('[anthropic usage]', usage);
      return;
    }

    const json = await clone.json();
    if (json && json.usage) console.log('[anthropic usage]', json.usage);
  } catch { /* logging must never affect the caller */ }
}

module.exports = { anthropicMessagesOnce, anthropicMessagesWithRetry, buildSystemWithCache };
