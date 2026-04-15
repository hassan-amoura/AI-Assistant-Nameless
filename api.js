// api.js — browser-side API client
// All calls go through the local server (/api/*).
// The Anthropic API key and system prompt live in server.js — never in the browser.

/* ── sendToAI ───────────────────────────────────────── */
// Streams a response from the server.
// callbacks: { onChunk(text), onDone({ text, sql, raw }), onError(message) }

async function sendToAI(messages, callbacks) {
  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
  } catch {
    callbacks.onError('Network error — is the server running? Try: npm start');
    return;
  }

  if (!response.ok) {
    let msg = `Server error ${response.status}`;
    try { const err = await response.json(); msg = err.error || msg; } catch {}
    callbacks.onError(msg);
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
          callbacks.onChunk?.(chunk);
        }
      }
    }
  } catch {
    callbacks.onError('Stream interrupted — please try again.');
    return;
  }

  const { text, sql } = extractSQL(rawText);
  callbacks.onDone?.({ text, sql, raw: rawText });
}

/* ── generateTitleWithAI ────────────────────────────── */
// Asks the server for a short title. Returns a promise resolving to a string or null.

async function generateTitleWithAI(message) {
  try {
    const res = await fetch('/api/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
// Splits the raw model response into prose text and an optional SQL block.
// Returns { text: string, sql: string|null }

function extractSQL(raw) {
  const fence = /```sql\s*([\s\S]*?)```/i;
  const match = raw.match(fence);
  if (!match) return { text: raw.trim(), sql: null };
  const sql  = match[1].trim();
  const text = raw.replace(fence, '').trim();
  return { text, sql };
}
