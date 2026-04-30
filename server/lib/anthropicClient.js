'use strict';

const { createAnthropicProvider } = require('./ai/providers/anthropicProvider');

/**
 * Build an Anthropic `system` array with prompt caching markers.
 *
 * Inputs are two string arrays, already ordered:
 *   cachedBlocks   — stable prefix content. Each becomes a text block with
 *                    cache_control: { type: 'ephemeral' }. These form the
 *                    cache breakpoint chain.
 *   dynamicBlocks  — per-request / per-user tail. Never cached.
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
 * Compatibility facade for existing call sites.
 *
 * The browser streaming contract still expects Anthropic-shaped SSE, so these
 * helpers deliberately preserve Anthropic transport behavior while the broader
 * provider abstraction grows alongside it.
 */
function anthropicMessagesOnce(body, apiKey) {
  return createAnthropicProvider().anthropicMessagesOnce(body, apiKey);
}

function anthropicMessagesWithRetry(body, apiKey, options) {
  return createAnthropicProvider().anthropicMessagesWithRetry(body, apiKey, options);
}

module.exports = {
  anthropicMessagesOnce,
  anthropicMessagesWithRetry,
  buildSystemWithCache,
};
