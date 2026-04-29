'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

function filePath(userId) {
  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `insights-${safeId}.json`);
}

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

function readStore(userId) {
  ensureDir();
  try {
    return JSON.parse(fs.readFileSync(filePath(userId), 'utf8'));
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
  if (store.some(i => i.id === insight.id)) return;
  store.unshift(insight);
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
