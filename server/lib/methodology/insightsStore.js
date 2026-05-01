'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const LEGACY_SCHEMA_VERSION = 'insight.legacy';

function filePath(userId) {
  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `insights-${safeId}.json`);
}

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeInsight(insight) {
  const src = insight && typeof insight === 'object' ? insight : {};
  const title = nonEmptyText(src.title)
    ? src.title
    : (nonEmptyText(src.situationTitle) ? src.situationTitle : 'Insight');
  const body = nonEmptyText(src.body)
    ? src.body
    : (nonEmptyText(src.decisionBridge) ? src.decisionBridge : title);
  const action = nonEmptyText(src.action)
    ? src.action
    : (nonEmptyText(src.primaryAction) ? src.primaryAction : 'Review in Chat');

  return {
    ...src,
    stableIdentity: nonEmptyText(src.stableIdentity) ? src.stableIdentity : (src.id || title),
    facts: src.facts && typeof src.facts === 'object' && !Array.isArray(src.facts) ? src.facts : {},
    generatedCopy: src.generatedCopy === undefined ? null : src.generatedCopy,
    cacheExpiresAt: src.cacheExpiresAt === undefined ? null : src.cacheExpiresAt,
    situationTitle: nonEmptyText(src.situationTitle) ? src.situationTitle : title,
    decisionBridge: nonEmptyText(src.decisionBridge) ? src.decisionBridge : body,
    primaryAction: nonEmptyText(src.primaryAction) ? src.primaryAction : action,
    secondaryOptions: Array.isArray(src.secondaryOptions) && src.secondaryOptions.length
      ? src.secondaryOptions
      : ['Review in Chat', 'Dismiss'],
    title,
    body,
    action,
    read: src.read === true,
    dismissed: src.dismissed === true,
    schemaVersion: src.schemaVersion || LEGACY_SCHEMA_VERSION,
  };
}

function mergeStoredInsight(existing, incoming) {
  const previous = normalizeInsight(existing);
  const next = normalizeInsight(incoming);
  return {
    ...next,
    read: previous.read,
    dismissed: previous.dismissed,
    createdAt: previous.createdAt || next.createdAt,
    generatedCopy: next.generatedCopy !== null ? next.generatedCopy : previous.generatedCopy,
    cacheExpiresAt: next.cacheExpiresAt !== null ? next.cacheExpiresAt : previous.cacheExpiresAt,
  };
}

function readStore(userId) {
  ensureDir();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(userId), 'utf8'));
    return Array.isArray(parsed) ? parsed.map(normalizeInsight) : [];
  } catch (e) {
    if (e && e.code === 'ENOENT') return [];
    throw e;
  }
}

function writeStore(userId, insights) {
  ensureDir();
  const fp = filePath(userId);
  const tmp = `${fp}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(insights, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
}

function getInsights(userId) {
  return readStore(userId).filter(i => !i.dismissed);
}

function getUnreadInsights(userId) {
  return readStore(userId).filter(i => !i.dismissed && !i.read);
}

function addInsight(userId, insight) {
  const store = readStore(userId);
  const idx = store.findIndex(i => i.id === insight.id);
  if (idx !== -1) {
    store[idx] = mergeStoredInsight(store[idx], insight);
    writeStore(userId, store.slice(0, 200));
    return;
  }
  store.unshift(normalizeInsight(insight));
  writeStore(userId, store.slice(0, 200));
}

function markRead(userId, insightId) {
  const store = readStore(userId);
  const idx = store.findIndex(i => i.id === insightId);
  if (idx !== -1) {
    store[idx] = { ...store[idx], read: true };
    writeStore(userId, store);
  }
}

function markAllRead(userId) {
  const store = readStore(userId);
  writeStore(userId, store.map(i => ({ ...i, read: true })));
}

function dismissInsight(userId, insightId) {
  const store = readStore(userId);
  writeStore(userId, store.map(i => i.id === insightId ? { ...i, dismissed: true } : i));
}

function clearInsights(userId) {
  writeStore(userId, []);
}

module.exports = {
  getInsights,
  getUnreadInsights,
  addInsight,
  markRead,
  markAllRead,
  dismissInsight,
  clearInsights,
};
