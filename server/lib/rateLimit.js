'use strict';

/**
 * Very small in-process limiter (resets on restart). Good enough for single-node dev.
 * TODO: replace with Redis / edge limiter for multi-instance production.
 */
const buckets = new Map();

function rateLimitHit(key, { windowMs = 60_000, max = 30 } = {}) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    b = { start: now, count: 0 };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count > max;
}

module.exports = { rateLimitHit };
