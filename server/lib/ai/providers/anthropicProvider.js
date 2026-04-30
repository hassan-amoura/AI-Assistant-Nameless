'use strict';

const { getAnthropicModelMain } = require('../../models');
const { parseJsonFromText } = require('../jsonUtils');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function providerError(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function resolveApiKey(env, apiKey) {
  return apiKey || env.ANTHROPIC_API_KEY || '';
}

async function anthropicMessagesOnce(body, apiKey, { env = process.env } = {}) {
  const key = resolveApiKey(env, apiKey);
  if (!key || key === 'your-key-here') {
    throw providerError(
      'MODEL_PROVIDER_NOT_CONFIGURED',
      'ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic.',
    );
  }

  return fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function logUsageFromResponse(res) {
  try {
    const clone = res.clone();
    const ct = clone.headers.get('content-type') || '';

    if (ct.includes('text/event-stream')) {
      const reader = clone.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const usage = {};
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const ev of events) {
          for (const line of ev.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'message_start' && data.message && data.message.usage) {
                Object.assign(usage, data.message.usage);
              } else if (data.type === 'message_delta' && data.usage) {
                Object.assign(usage, data.usage);
              }
            } catch { /* skip non-JSON lines */ }
          }
        }
      }
      console.log('[anthropic usage]', usage);
      return;
    }

    const json = await clone.json();
    if (json && json.usage) console.log('[anthropic usage]', json.usage);
  } catch { /* logging must never affect the caller */ }
}

async function anthropicMessagesWithRetry(body, apiKey, { maxRetries = 3, env = process.env } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= maxRetries) {
    const res = await anthropicMessagesOnce(body, apiKey, { env });
    if (res.ok) {
      logUsageFromResponse(res).catch(() => {});
      return res;
    }
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

function responseTextFromAnthropicJson(data) {
  const content = Array.isArray(data && data.content) ? data.content : [];
  return content
    .map(part => (part && typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

async function generateText({ system, messages, temperature, maxTokens, model } = {}, options = {}) {
  const body = {
    model: model || getAnthropicModelMain(),
    max_tokens: maxTokens || 1024,
    temperature,
    system,
    messages: Array.isArray(messages) ? messages : [],
  };
  if (temperature === undefined || temperature === null) delete body.temperature;
  if (!body.system) delete body.system;

  const res = await anthropicMessagesWithRetry(body, options.apiKey, {
    maxRetries: options.maxRetries === undefined ? 3 : options.maxRetries,
    env: options.env || process.env,
  });
  if (!res.ok) {
    throw providerError('MODEL_PROVIDER_HTTP_ERROR', `Anthropic request failed with status ${res.status}.`, {
      status: res.status,
    });
  }
  const data = await res.json().catch(() => ({}));
  return responseTextFromAnthropicJson(data);
}

async function generateJson(args = {}, options = {}) {
  const text = await generateText(args, options);
  const parsed = parseJsonFromText(text);
  if (!parsed) {
    throw providerError('MODEL_PROVIDER_JSON_PARSE', 'Anthropic response was not valid JSON.');
  }
  return parsed;
}

async function streamText({ system, messages, temperature, maxTokens, model, onToken } = {}, options = {}) {
  const body = {
    model: model || getAnthropicModelMain(),
    max_tokens: maxTokens || 1024,
    temperature,
    stream: true,
    system,
    messages: Array.isArray(messages) ? messages : [],
  };
  if (temperature === undefined || temperature === null) delete body.temperature;
  if (!body.system) delete body.system;

  const res = await anthropicMessagesWithRetry(body, options.apiKey, {
    maxRetries: options.maxRetries === undefined ? 3 : options.maxRetries,
    env: options.env || process.env,
  });
  if (!res.ok) {
    throw providerError('MODEL_PROVIDER_HTTP_ERROR', `Anthropic stream failed with status ${res.status}.`, {
      status: res.status,
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const ev of events) {
      for (const line of ev.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'content_block_delta' && data.delta && data.delta.type === 'text_delta') {
            const token = data.delta.text || '';
            text += token;
            if (typeof onToken === 'function') onToken(token, data);
          }
        } catch { /* ignore malformed SSE fragments */ }
      }
    }
  }

  return { ok: true, text };
}

function createAnthropicProvider({ env = process.env } = {}) {
  return {
    id: 'anthropic',
    name: 'Anthropic',
    isConfigured() {
      const key = resolveApiKey(env);
      return !!key && key !== 'your-key-here';
    },
    generateText(args, options = {}) {
      return generateText(args, { ...options, env: options.env || env });
    },
    generateJson(args, options = {}) {
      return generateJson(args, { ...options, env: options.env || env });
    },
    streamText(args, options = {}) {
      return streamText(args, { ...options, env: options.env || env });
    },
    anthropicMessagesOnce(body, apiKey) {
      return anthropicMessagesOnce(body, apiKey, { env });
    },
    anthropicMessagesWithRetry(body, apiKey, options = {}) {
      return anthropicMessagesWithRetry(body, apiKey, { ...options, env });
    },
  };
}

module.exports = {
  ANTHROPIC_URL,
  createAnthropicProvider,
  anthropicMessagesOnce,
  anthropicMessagesWithRetry,
};
