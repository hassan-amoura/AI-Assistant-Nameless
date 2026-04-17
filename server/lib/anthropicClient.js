'use strict';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Low-level POST helper with simple 429 / 529 backoff for production guardrails.
 * TODO: wire Anthropic official SDK here if you need tool-use / prompt caching APIs.
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
    if (res.ok) return res;
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

module.exports = { anthropicMessagesOnce, anthropicMessagesWithRetry };
