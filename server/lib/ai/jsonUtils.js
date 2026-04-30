'use strict';

function stripJsonFence(raw) {
  let text = typeof raw === 'string' ? raw.trim() : '';
  if (!text.startsWith('```')) return text;
  text = text.replace(/^```(?:json)?\s*/i, '');
  text = text.replace(/\s*```$/i, '');
  return text.trim();
}

function parseJsonFromText(raw) {
  const text = stripJsonFence(raw);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

module.exports = {
  stripJsonFence,
  parseJsonFromText,
};
