'use strict';

/**
 * Limits what we send to Anthropic while the UI keeps full history in localStorage.
 *
 * Strategy: keep the most recent messages (user/assistant turns) under a cap.
 * TODO: add rollingSummary support — pass { rollingSummary } from client or
 * generate server-side from older turns and inject as a synthetic user line.
 */
const DEFAULT_MAX_MESSAGES = 24;

function truncateMessages(messages, maxCount = DEFAULT_MAX_MESSAGES) {
  if (!Array.isArray(messages) || messages.length <= maxCount) return messages;
  return messages.slice(-maxCount);
}

/** Flatten last user text for cheap models / heuristics */
function lastUserText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return flattenContent(messages[i].content);
  }
  return '';
}

function flattenContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(p => (typeof p === 'object' && p.text ? p.text : ''))
      .join('\n')
      .trim();
  }
  return '';
}

/** Compact transcript for intake (last few turns, bounded chars) */
function buildIntakeTranscript(messages, maxTurns = 4, maxChars = 4000) {
  const tail = truncateMessages(messages, maxTurns * 2);
  let out = '';
  for (const m of tail) {
    const role = m.role === 'assistant' ? 'Assistant' : 'User';
    const text = flattenContent(m.content);
    out += `${role}: ${text}\n\n`;
    if (out.length > maxChars) break;
  }
  return out.slice(-maxChars);
}

module.exports = {
  truncateMessages,
  lastUserText,
  flattenContent,
  buildIntakeTranscript,
  DEFAULT_MAX_MESSAGES,
};
