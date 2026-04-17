// api.js — browser-side API client
// All calls go through the local server (/api/*).
// The Anthropic API key and system prompt live in server.js — never in the browser.

/* ── sendToAI ───────────────────────────────────────── */
// Streams a response from the server.
// callbacks: { onChunk(text), onDone({ text, sql, raw }), onError(message) }

async function sendToAI(messages, callbacks) {
  const { onChunk, onDone, onError, advisorMode } = callbacks;
  let response;
  // Read user memory from localStorage and attach to request.
  // Server injects it into the system prompt (placeholder until server-side persistence).
  const userMemory = localStorage.getItem('pw_user_memory') || '';

  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ messages, advisorMode: !!advisorMode, ...(userMemory ? { userMemory } : {}) }),
    });
  } catch {
    onError('Network error — is the server running? Try: npm start');
    return;
  }

  if (!response.ok) {
    let msg = `Server error ${response.status}`;
    try { const err = await response.json(); msg = err.error || msg; } catch {}
    onError(msg);
    return;
  }

  // Parse the SSE stream (same format Anthropic uses natively)
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer  = '';
  let rawText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop(); // hold back any incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        let event;
        try { event = JSON.parse(data); } catch { continue; }

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const chunk = event.delta.text;
          rawText += chunk;
          onChunk?.(chunk);
        }
      }
    }
  } catch {
    onError('Stream interrupted — please try again.');
    return;
  }

  const { text, sql, reasoning } = extractSQL(rawText);
  onDone?.({ text, sql, reasoning, raw: rawText });
}

/* ── generateTitleWithAI ────────────────────────────── */
// Asks the server for a short title. Returns a promise resolving to a string or null.

async function generateTitleWithAI(message) {
  try {
    const res = await fetch('/api/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ message }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch {
    return null;
  }
}

/* ── extractSQL ─────────────────────────────────────── */
// Splits the raw model response into prose text, an optional SQL block,
// and an optional <reasoning> block.
// Returns { text: string, sql: string|null, reasoning: string|null }

function extractSQL(raw) {
  const fence     = /```sql\s*([\s\S]*?)```/i;
  const reasonPat = /<reasoning>([\s\S]*?)<\/reasoning>/i;

  const sqlMatch      = raw.match(fence);
  const reasoningMatch = raw.match(reasonPat);

  const sql       = sqlMatch       ? sqlMatch[1].trim()       : null;
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : null;

  let text = raw;
  if (sqlMatch)       text = text.replace(fence, '');
  if (reasoningMatch) text = text.replace(reasonPat, '');
  text = text.trim();

  return { text, sql, reasoning };
}

/** Strips optional <pw-options>…</pw-options> JSON array (build-mode clarification chips). */
function extractPwOptions(raw) {
  if (typeof raw !== 'string') return { text: raw, options: null };
  const pat = /<pw-options>\s*([\s\S]*?)\s*<\/pw-options>/i;
  const m = raw.match(pat);
  if (!m) return { text: raw, options: null };
  let options = null;
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed) && parsed.length >= 3) options = parsed;
  } catch (_) {
    options = null;
  }
  const text = raw.replace(pat, '').trim();
  return { text, options };
}
