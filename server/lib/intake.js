'use strict';

const { getAnthropicModelLight } = require('./models');
const { anthropicMessagesWithRetry } = require('./anthropicClient');
const { lastUserText, buildIntakeTranscript } = require('./contextBuilder');

/**
 * Lightweight routing step — cheap model, non-streaming, small JSON.
 * Separates "data advisor / Metabase guide" from "SQL report engine" so we
 * do not burn Sonnet tokens on chit-chat or ambiguous asks.
 *
 * On JSON parse failure we return route=sql_engine (preserve legacy behavior).
 */
const REPORTISH = /\b(report|sql|query|revenue|margin|profit|invoice|utili[sz]ation|capacity|budget|timesheet|wip|forecast|dashboard|metabase|breakdown|by client|by project|by person|show|list)\b/i;

function heuristicBypass(messages) {
  const last = lastUserText(messages).trim();
  if (!last) return null;
  if (last.length < 12 && !REPORTISH.test(last)) {
    return { route: 'data_advisor', family: 'general', confidence: 0.9, metabase_topic: false, reason: 'short_non_report' };
  }
  if (/^(hi|hello|hey|thanks|thank you)\b/i.test(last) && last.length < 40) {
    return { route: 'data_advisor', family: 'general', confidence: 0.95, metabase_topic: false, reason: 'greeting' };
  }
  return null;
}

function safeJsonParse(raw) {
  let t = raw.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

async function classifyIntent(messages, apiKey) {
  const bypass = heuristicBypass(messages);
  if (bypass) return bypass;

  const transcript = buildIntakeTranscript(messages, 5, 6000);
  const userBlock = `Conversation (most recent last):\n${transcript}\n\nReturn ONLY valid JSON with keys:\n` +
    `{"route":"sql_engine"|"data_advisor","family":"general"|"utilization"|"revenue"|"margin"|"projects"|"people"|` +
    `"time"|"expenses"|"forecast"|"invoicing","confidence":0.0-1.0,"metabase_topic":boolean,"needs_clarification":boolean}\n` +
    `Rules:\n` +
    `- route=data_advisor for Metabase product help, vague asks, pure clarification, or chit-chat.\n` +
    `- route=sql_engine when the user wants a concrete Projectworks T-SQL report AND the ask is specific enough (metric, grain, entity, or time window hinted).\n` +
    `- needs_clarification=true only when the user MUST choose between materially different report paths before SQL is safe (e.g. ambiguous revenue *calculation* intent: recognition vs invoiced vs effort vs cost vs T&M when two or more are plausible). Do NOT set needs_clarification for general "revenue by X" where **invoiced revenue** is the clear Projectworks default — the report engine will assume invoiced and state it in prose.\n` +
    `- If needs_clarification=true, still use data_advisor unless the user explicitly demanded SQL anyway.\n` +
    `- metabase_topic=true when the question is primarily about Metabase features/navigation.\n` +
    `- family= best match for schema slicing.\n`;

  const body = {
    model: getAnthropicModelLight(),
    max_tokens: 220,
    temperature: 0,
    messages: [{ role: 'user', content: userBlock }],
  };

  const res = await anthropicMessagesWithRetry(body, apiKey, { maxRetries: 2 });
  if (!res.ok) {
    return { route: 'sql_engine', family: 'general', confidence: 0, metabase_topic: false, needs_clarification: false, reason: 'intake_http_error' };
  }
  const data = await res.json().catch(() => ({}));
  const rawText = data.content?.[0]?.text || '';
  const parsed = safeJsonParse(rawText);
  if (!parsed || typeof parsed.route !== 'string') {
    return { route: 'sql_engine', family: 'general', confidence: 0, metabase_topic: false, needs_clarification: false, reason: 'intake_parse_fallback' };
  }

  const route = parsed.route === 'data_advisor' ? 'data_advisor' : 'sql_engine';
  const family = typeof parsed.family === 'string' && parsed.family ? parsed.family : 'general';
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
  const metabase_topic = !!parsed.metabase_topic;
  const needs_clarification = !!parsed.needs_clarification;

  if (needs_clarification && route === 'sql_engine') {
    return { route: 'data_advisor', family, confidence, metabase_topic, needs_clarification: true, reason: 'clarify_first' };
  }
  if (metabase_topic) {
    return { route: 'data_advisor', family: 'general', confidence, metabase_topic: true, needs_clarification: false, reason: 'metabase' };
  }

  // Low-confidence SQL routes stay conversational to avoid expensive wrong SQL.
  if (route === 'sql_engine' && confidence < 0.38) {
    return { route: 'data_advisor', family, confidence, metabase_topic: false, needs_clarification: false, reason: 'low_confidence' };
  }

  return { route, family, confidence, metabase_topic, needs_clarification, reason: 'intake_ok' };
}

module.exports = { classifyIntent, heuristicBypass };
