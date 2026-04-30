'use strict';

/**
 * Limits what we send to Anthropic while the UI keeps full history in localStorage.
 *
 * Strategy: keep the most recent messages (user/assistant turns) under a cap.
 * TODO: add rollingSummary support — pass { rollingSummary } from client or
 * generate server-side from older turns and inject as a synthetic user line.
 */
const DEFAULT_MAX_MESSAGES = 24;
const DEFAULT_RUNTIME_PREFERENCES = Object.freeze({
  assistantAutonomy: 'propose',
  coachingStyle: 'supportive',
  firmGoal: 'steady',
});

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

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function shortValue(value, fallback = 'unknown') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 120) || fallback;
}

function boolsContainTrue(value) {
  if (!isObject(value)) return false;
  return Object.values(value).some(v => v === true);
}

function integrationStatus(runtimeCapabilities, id, fallback) {
  const integrations = runtimeCapabilities && Array.isArray(runtimeCapabilities.integrations)
    ? runtimeCapabilities.integrations
    : [];
  const item = integrations.find(integration => integration && integration.id === id);
  return item && item.status ? item.status : fallback;
}

function buildRuntimeContextBlock({
  preferences,
  runtimeCapabilities,
  user,
  tenantContext,
} = {}) {
  const prefs = isObject(preferences) ? preferences : {};
  const runtime = isObject(runtimeCapabilities) ? runtimeCapabilities : {};
  const caps = isObject(runtime.capabilities) ? runtime.capabilities : {};
  const projectworks = isObject(caps.projectworks) ? caps.projectworks : {};
  const reportingCaps = isObject(projectworks.reporting) ? projectworks.reporting : {};
  const actionCaps = isObject(projectworks.actions) ? projectworks.actions : {};
  const metabaseCaps = isObject(caps.metabase) ? caps.metabase : {};

  const reportingStatus = integrationStatus(
    runtime,
    'projectworks_reporting',
    boolsContainTrue(reportingCaps) ? 'connected' : 'not_configured',
  );
  const writeActionsAvailable = boolsContainTrue(actionCaps);
  const metabaseAvailable = boolsContainTrue(metabaseCaps);
  const tenant = isObject(tenantContext) ? tenantContext : {};

  return `\n\n<runtime_context>
User preferences:
- assistantAutonomy: ${shortValue(prefs.assistantAutonomy, DEFAULT_RUNTIME_PREFERENCES.assistantAutonomy)}
- coachingStyle: ${shortValue(prefs.coachingStyle, DEFAULT_RUNTIME_PREFERENCES.coachingStyle)}
- firmGoal: ${shortValue(prefs.firmGoal, DEFAULT_RUNTIME_PREFERENCES.firmGoal)}
- userRole: ${shortValue(user && user.role)}

Tenant:
- orgId: ${shortValue(tenant.id || tenant.orgId, 'default')}
- source: ${shortValue(tenant.source, 'static_demo')}

Capabilities:
- Projectworks reporting data: ${shortValue(reportingStatus, 'not_configured')}
- Projectworks write actions: ${writeActionsAvailable ? 'available' : 'unavailable'}
- Metabase publishing: ${metabaseAvailable ? 'available' : 'unavailable'}

Action policy:
- Do not claim write completion unless a successful action result is provided.
- If Projectworks write actions are unavailable, prepare/validate/propose only.
</runtime_context>\n`;
}

module.exports = {
  truncateMessages,
  lastUserText,
  flattenContent,
  buildIntakeTranscript,
  buildRuntimeContextBlock,
  DEFAULT_MAX_MESSAGES,
};
