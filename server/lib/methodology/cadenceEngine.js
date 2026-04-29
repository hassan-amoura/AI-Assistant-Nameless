'use strict';

// ── To wire up in server.js ──────────────────────────────────────────────────
// Find the comment "// ── Start server ──" (or the app.listen() call) near the
// bottom of server.js and add these lines immediately before it:
//
//   const { startCadenceEngine } = require('./server/lib/methodology/cadenceEngine');
//   const getUserList = () => [{ userId: 'demo', userRole: 'project_manager' }];
//   startCadenceEngine(getUserList);
//
// getUserList should eventually query the persistence layer for active users.
// ────────────────────────────────────────────────────────────────────────────

const cron = (() => {
  try { return require('node-cron'); }
  catch { return null; }
})();

const { generateInsights } = require('./insightGenerator');
const { getMockTenantData } = require('./mockTenantData');
const { assessMaturity } = require('./maturityAssessor');
const insightsStore = require('./insightsStore');

const _lastRun = { daily: null, weekly: null, monthly: null };

async function _runForUser(userId, userRole, cadence) {
  const tenantData = getMockTenantData(userId, userRole);
  const maturity = assessMaturity(tenantData);
  const all = generateInsights(userId, userRole, tenantData, maturity);
  const filtered = cadence === 'all' ? all : all.filter(i => i.cadence === cadence);
  for (const insight of filtered) {
    insightsStore.addInsight(userId, insight);
  }
  return filtered.length;
}

async function runNow(userId, userRole, cadence) {
  return _runForUser(userId, userRole, cadence || 'all');
}

function startCadenceEngine(getUsersFn) {
  if (!cron) {
    console.log('[cadenceEngine] node-cron not available — engine in manual mode (call runNow() to trigger)');
    return;
  }

  // Daily: 8am every weekday
  cron.schedule('0 8 * * 1-5', async () => {
    try {
      const users = typeof getUsersFn === 'function' ? await getUsersFn() : [];
      for (const { userId, userRole } of users) {
        await _runForUser(userId, userRole, 'daily').catch(err =>
          console.error(`[cadenceEngine] daily failed for ${userId}:`, err.message)
        );
      }
      _lastRun.daily = new Date().toISOString();
      console.log(`[cadenceEngine] daily run — ${users.length} user(s)`);
    } catch (err) {
      console.error('[cadenceEngine] daily schedule error:', err.message);
    }
  });

  // Weekly: Monday 8am
  cron.schedule('0 8 * * 1', async () => {
    try {
      const users = typeof getUsersFn === 'function' ? await getUsersFn() : [];
      for (const { userId, userRole } of users) {
        await _runForUser(userId, userRole, 'weekly').catch(err =>
          console.error(`[cadenceEngine] weekly failed for ${userId}:`, err.message)
        );
      }
      _lastRun.weekly = new Date().toISOString();
      console.log(`[cadenceEngine] weekly run — ${users.length} user(s)`);
    } catch (err) {
      console.error('[cadenceEngine] weekly schedule error:', err.message);
    }
  });

  // Monthly: 1st of month 8am
  cron.schedule('0 8 1 * *', async () => {
    try {
      const users = typeof getUsersFn === 'function' ? await getUsersFn() : [];
      for (const { userId, userRole } of users) {
        await _runForUser(userId, userRole, 'monthly').catch(err =>
          console.error(`[cadenceEngine] monthly failed for ${userId}:`, err.message)
        );
      }
      _lastRun.monthly = new Date().toISOString();
      console.log(`[cadenceEngine] monthly run — ${users.length} user(s)`);
    } catch (err) {
      console.error('[cadenceEngine] monthly schedule error:', err.message);
    }
  });

  console.log('[cadenceEngine] started — daily/weekly/monthly schedules active');
}

function getEngineStatus() {
  return { ..._lastRun };
}

module.exports = { startCadenceEngine, runNow, getEngineStatus };
