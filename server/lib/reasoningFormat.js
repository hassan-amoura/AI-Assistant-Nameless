'use strict';

/**
 * Normalizes model reasoning for the existing UI (reasoning rows are "Key: value").
 *
 * Future: if the model emits JSON inside <reasoning>, parse and expand to lines here.
 * For now: passthrough — AGENTS.md already specifies the five reasoning fields.
 */
function normalizeReasoningBlock(text) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  // Optional JSON envelope { "Question interpreted as": "...", ... }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const o = JSON.parse(trimmed);
      const lines = Object.entries(o).map(([k, v]) => `${k}: ${v}`);
      return lines.join('\n');
    } catch {
      return text;
    }
  }
  return text;
}

module.exports = { normalizeReasoningBlock };
