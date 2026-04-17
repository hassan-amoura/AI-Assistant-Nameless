'use strict';

/**
 * Central model selection — keeps expensive vs cheap paths explicit.
 *
 * - MAIN: streaming report / advisor quality (default unchanged for prod UX).
 * - LIGHT: intake classification + short title copy (Haiku-class by default).
 *
 * TODO: When you add Anthropic prompt caching at the HTTP layer, attach
 * cache_control breakpoints to the *largest stable* system blocks first
 * (static instructions, then schema slice). Dynamic user/history must stay
 * outside cached segments.
 */
function getAnthropicModelMain() {
  return process.env.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL_MAIN || 'claude-sonnet-4-6';
}

function getAnthropicModelLight() {
  return (
    process.env.ANTHROPIC_MODEL_LIGHT ||
    'claude-3-5-haiku-20241022'
  );
}

module.exports = { getAnthropicModelMain, getAnthropicModelLight };
