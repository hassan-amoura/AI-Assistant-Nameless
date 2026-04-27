'use strict';

const fs   = require('fs');
const path = require('path');

// server/lib → repo root is two levels up
const AGENTS_MD_PATH = path.join(__dirname, '..', '..', 'AGENTS.md');

/** Must match server.js splice point for live schema from schemaFetcher.js */
const SCHEMA_SECTION_MARKER = '\n## PROJECTWORKS REPORTING SCHEMA';

let _cachedFull = null;

function readClaudeMd() {
  if (_cachedFull) return _cachedFull;
  _cachedFull = fs.readFileSync(AGENTS_MD_PATH, 'utf8');
  return _cachedFull;
}

/**
 * Split AGENTS.md into (1) instructions / patterns / SQL rules and
 * (2) full reporting schema bullet list — so we can slice (2) per request.
 *
 * Caching-ready: block (1) is large but static until file changes; ideal
 * future prompt-cache anchor. Block (2) changes per family slice or live DB.
 */
function splitClaudeMd() {
  const full = readClaudeMd();
  const idx = full.indexOf(SCHEMA_SECTION_MARKER);
  if (idx === -1) {
    return { instructions: full, schemaSection: '', marker: SCHEMA_SECTION_MARKER };
  }
  return {
    instructions: full.slice(0, idx),
    schemaSection: full.slice(idx),
    marker: SCHEMA_SECTION_MARKER,
  };
}

/** Build full system string the legacy way (instructions + live or static schema). */
function buildLegacySystemPrompt(liveSchema) {
  const { instructions, schemaSection } = splitClaudeMd();
  if (liveSchema) {
    return instructions + '\n' + liveSchema;
  }
  return instructions + schemaSection;
}

module.exports = {
  readClaudeMd,
  splitClaudeMd,
  buildLegacySystemPrompt,
  SCHEMA_SECTION_MARKER,
};
