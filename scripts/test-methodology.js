'use strict';

// Methodology layer integration test — no framework, just node.
// Run: npm run test:methodology

const path = require('path');
const fs   = require('fs');

let passed = 0;
let failed = 0;
const failures = [];

function record(category, ok, passMsg, failMsg) {
  if (ok) {
    console.log(`  ✓ ${category}: ${passMsg}`);
    passed++;
  } else {
    console.log(`  ✗ ${category}: ${failMsg}`);
    failed++;
    failures.push(`${category}: ${failMsg}`);
  }
}

// ── 1. Knowledge base ─────────────────────────────────────────────────────
console.log('\n[1] KNOWLEDGE BASE LOADS');
try {
  const { operationsTrack, growthTrack } = require('../server/lib/methodology/knowledgeBase');

  record('KNOWLEDGE BASE',
    Array.isArray(operationsTrack) && operationsTrack.length === 5,
    `operationsTrack has 5 levels`,
    `expected operationsTrack.length=5, got ${operationsTrack && operationsTrack.length}`);
  record('KNOWLEDGE BASE',
    Array.isArray(growthTrack) && growthTrack.length === 5,
    `growthTrack has 5 levels`,
    `expected growthTrack.length=5, got ${growthTrack && growthTrack.length}`);

  const required = ['id', 'name', 'goal', 'indicators', 'habits'];
  function checkLevels(track, label) {
    if (!Array.isArray(track)) {
      record('KNOWLEDGE BASE', false, '', `${label} track is not an array`);
      return;
    }
    let bad = null;
    for (const lvl of track) {
      for (const prop of required) {
        if (!(prop in lvl)) { bad = `${lvl.id || '?'} missing '${prop}'`; break; }
      }
      if (bad) break;
    }
    record('KNOWLEDGE BASE',
      bad === null,
      `${label}: every level has id/name/goal/indicators/habits`,
      `${label}: ${bad}`);
  }
  checkLevels(operationsTrack, 'ops');
  checkLevels(growthTrack, 'growth');
} catch (e) {
  record('KNOWLEDGE BASE', false, '', `module load failed: ${e.message}`);
}

// ── 2. Mock data per role ─────────────────────────────────────────────────
console.log('\n[2] MOCK DATA LOADS FOR ALL ROLES');
try {
  const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');
  for (const role of ['project_manager', 'time_expense', 'finance', 'director']) {
    let data = null;
    let err = null;
    try { data = getMockTenantData('test-user', role); } catch (e) { err = e; }
    const ok = !err && data && typeof data === 'object'
      && 'tenantId' in data
      && 'billableHeadcount' in data
      && 'utilisationRate' in data;
    record('MOCK DATA', ok,
      `${role} returns tenant data with tenantId/billableHeadcount/utilisationRate`,
      err
        ? `${role} threw: ${err.message}`
        : `${role} missing required keys (got ${data ? Object.keys(data).slice(0, 5).join(',') + '…' : 'null'})`);
  }
} catch (e) {
  record('MOCK DATA', false, '', `module load failed: ${e.message}`);
}

// ── 3. Maturity assessment ────────────────────────────────────────────────
console.log('\n[3] MATURITY ASSESSMENT SCORES CORRECTLY');
try {
  const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');
  const { assessMaturity }    = require('../server/lib/methodology/maturityAssessor');
  const data   = getMockTenantData('test-user', 'project_manager');
  const result = assessMaturity(data);

  record('MATURITY', result.ops.level === 2,
    `ops.level === 2`,
    `expected ops.level=2, got ${result.ops.level}`);
  record('MATURITY', result.ops.levelName === 'Visibility',
    `ops.levelName === 'Visibility'`,
    `expected ops.levelName='Visibility', got '${result.ops.levelName}'`);
  record('MATURITY', result.growth.level === 1,
    `growth.level === 1`,
    `expected growth.level=1, got ${result.growth.level}`);
  record('MATURITY', result.growth.levelName === 'Win More Work',
    `growth.levelName === 'Win More Work'`,
    `expected growth.levelName='Win More Work', got '${result.growth.levelName}'`);
  record('MATURITY', !!result.ops.nextLevel,
    `ops.nextLevel exists (→ L${result.ops.nextLevel && result.ops.nextLevel.level} ${result.ops.nextLevel && result.ops.nextLevel.name})`,
    `ops.nextLevel is missing`);

  const gapCount = result.ops.nextLevel && Array.isArray(result.ops.nextLevel.gapIndicators)
    ? result.ops.nextLevel.gapIndicators.length
    : -1;
  record('MATURITY', gapCount > 0,
    `ops.nextLevel.gapIndicators has ${gapCount} item(s)`,
    `expected gapIndicators.length>0, got ${gapCount === -1 ? 'no array' : gapCount}`);
} catch (e) {
  record('MATURITY', false, '', `failed: ${e.message}`);
}

// ── 4. Dollar impact math ─────────────────────────────────────────────────
// 1pp value ~$102k (formula × 1pp), total gap ~$591k (formula × full 5.8pp gap).
console.log('\n[4] DOLLAR IMPACT: 1pp value ~$102k, total gap ~$591k');
{
  const headcount  = 37;
  const chargeOut  = 153;
  const onePpValue = 0.01 * headcount * chargeOut * 1800;

  record('DOLLAR IMPACT',
    onePpValue >= 100000 && onePpValue <= 115000,
    `1pp value ≈ $${Math.round(onePpValue).toLocaleString()} (in range $100k–$115k)`,
    `expected onePpValue in 100,000–115,000, got $${Math.round(onePpValue).toLocaleString()}`);

  // Pull totalGapValue from an actual generated insight to verify wiring end-to-end.
  let utilInsight = null;
  let loadErr = null;
  try {
    const { generateInsights }  = require('../server/lib/methodology/insightGenerator');
    const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');
    const { assessMaturity }    = require('../server/lib/methodology/maturityAssessor');
    const data     = getMockTenantData('test-user', 'project_manager');
    const maturity = assessMaturity(data);
    const insights = generateInsights('test-user', 'project_manager', data, maturity);
    utilInsight    = insights.find(i => i.metric === 'utilisationRate') || null;
  } catch (e) {
    loadErr = e;
  }

  const totalGap = utilInsight && typeof utilInsight.totalGapValue === 'number'
    ? utilInsight.totalGapValue
    : null;

  record('DOLLAR IMPACT',
    totalGap !== null,
    `totalGapValue exists on utilisation insight = $${totalGap ? totalGap.toLocaleString() : '?'}`,
    loadErr
      ? `failed to load insight: ${loadErr.message}`
      : `totalGapValue missing on utilisation insight`);

  if (totalGap !== null) {
    record('DOLLAR IMPACT',
      totalGap > onePpValue,
      `totalGapValue ($${totalGap.toLocaleString()}) > onePpValue ($${Math.round(onePpValue).toLocaleString()})`,
      `expected totalGapValue > onePpValue, got total=${totalGap}, 1pp=${Math.round(onePpValue)}`);

    const expectedTotal = 591000;
    const tolerance     = expectedTotal * 0.10;
    const within        = Math.abs(totalGap - expectedTotal) <= tolerance;
    record('DOLLAR IMPACT', within,
      `totalGapValue ≈ $${expectedTotal.toLocaleString()} (within ±10%); actual = $${totalGap.toLocaleString()}`,
      `expected totalGapValue ~$${expectedTotal.toLocaleString()} (within ±10%), got $${totalGap.toLocaleString()}`);
  }
}

// ── 5. Insight generation per role ────────────────────────────────────────
console.log('\n[5] INSIGHT GENERATION PER ROLE');
try {
  const { generateInsights }  = require('../server/lib/methodology/insightGenerator');
  const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');
  const { assessMaturity }    = require('../server/lib/methodology/maturityAssessor');

  const minimums = { project_manager: 4, time_expense: 1, finance: 2, director: 3 };
  const required = ['id', 'type', 'title', 'body', 'severity', 'audience', 'action'];
  const allByRole = {};

  for (const role of Object.keys(minimums)) {
    const data     = getMockTenantData('test-user', role);
    const maturity = assessMaturity(data);
    const insights = generateInsights('test-user', role, data, maturity);
    allByRole[role] = insights;

    record('INSIGHTS',
      insights.length >= minimums[role],
      `${role}: ${insights.length} insight(s) (≥${minimums[role]} required) → [${insights.map(i => i.title).join(' | ') || '—'}]`,
      `${role}: expected ≥${minimums[role]}, got ${insights.length}`);

    let badField = null;
    let badId    = null;
    for (const insight of insights) {
      for (const f of required) {
        if (insight[f] === undefined || insight[f] === null) {
          badField = f;
          badId    = insight.id || '<no-id>';
          break;
        }
      }
      if (badField) break;
    }
    if (insights.length > 0) {
      record('INSIGHTS',
        badField === null,
        `${role}: every insight has id/type/title/body/severity/audience/action`,
        `${role}: insight ${badId} missing field '${badField}'`);
    }
  }

  // PM should not contain insights whose audience excludes PM (no leakage from
  // time_expense-only or other-restricted insights).
  const pm = allByRole.project_manager || [];
  let leak = null;
  for (const i of pm) {
    const aud = Array.isArray(i.audience) ? i.audience : [];
    if (!aud.includes('all') && !aud.includes('project_manager')) {
      leak = `${i.title} (audience=${JSON.stringify(aud)})`;
      break;
    }
  }
  record('INSIGHTS',
    leak === null,
    `project_manager results contain no audience-restricted leakage`,
    `audience leak in PM results: ${leak}`);
} catch (e) {
  record('INSIGHTS', false, '', `failed: ${e.message}`);
}

// ── 6. Insights store isolation ───────────────────────────────────────────
console.log('\n[6] INSIGHTS STORE ISOLATION');
const TEST_A   = 'methodology-test-A';
const TEST_B   = 'methodology-test-B';
const DATA_DIR = path.join(__dirname, '..', 'server', 'data');

function deleteTestFile(userId) {
  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  try { fs.unlinkSync(path.join(DATA_DIR, `insights-${safeId}.json`)); } catch (_) {}
}

try {
  const store = require('../server/lib/methodology/insightsStore');

  // Clean slate before run.
  store.clearInsights(TEST_A);
  store.clearInsights(TEST_B);

  const stub = id => ({
    id, type: 'reminder', title: id, body: '.',
    severity: 'low', audience: ['all'], action: '.',
    read: false, dismissed: false,
  });

  store.addInsight(TEST_A, stub('iso-a-1'));
  store.addInsight(TEST_A, stub('iso-a-2'));
  store.addInsight(TEST_B, stub('iso-b-1'));

  const aList = store.getInsights(TEST_A);
  const bList = store.getInsights(TEST_B);

  record('STORE',
    aList.length === 2,
    `user-A has 2 insights`,
    `expected user-A length=2, got ${aList.length}`);
  record('STORE',
    bList.length === 1,
    `user-B has 1 insight`,
    `expected user-B length=1, got ${bList.length}`);
  record('STORE',
    !aList.some(i => i.id === 'iso-b-1'),
    `user-A does NOT contain user-B's insight (isolation OK)`,
    `LEAK: user-A contains user-B's insight`);

  store.markRead(TEST_A, 'iso-a-1');
  const unreadA = store.getUnreadInsights(TEST_A);
  record('STORE',
    unreadA.length === 1,
    `after markRead, user-A has 1 unread`,
    `expected unread=1, got ${unreadA.length}`);
} catch (e) {
  record('STORE', false, '', `failed: ${e.message}`);
} finally {
  // Always tidy up — don't leave test residue in server/data/.
  try { require('../server/lib/methodology/insightsStore').clearInsights(TEST_A); } catch (_) {}
  try { require('../server/lib/methodology/insightsStore').clearInsights(TEST_B); } catch (_) {}
  deleteTestFile(TEST_A);
  deleteTestFile(TEST_B);
}

// ── 7. Card structure ─────────────────────────────────────────────────────
console.log('\n[7] CARD STRUCTURE');
try {
  const { generateInsights }  = require('../server/lib/methodology/insightGenerator');
  const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');
  const { assessMaturity }    = require('../server/lib/methodology/maturityAssessor');

  // Gather all decision-unit insights (non-reminder) across all roles, de-duped by id.
  let allInsights = [];
  for (const role of ['project_manager', 'finance', 'director', 'time_expense']) {
    const data     = getMockTenantData('test-user', role);
    const maturity = assessMaturity(data);
    allInsights = allInsights.concat(generateInsights('test-user', role, data, maturity));
  }
  const seen    = new Set();
  const unique  = allInsights.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
  const dInsights = unique.filter(i => i.type !== 'reminder');

  for (const field of ['situationTitle', 'decisionBridge', 'primaryAction', 'secondaryOptions']) {
    let missing = null;
    for (const i of dInsights) {
      if (i[field] === undefined || i[field] === null) { missing = i.id; break; }
    }
    record('CARD STRUCTURE', missing === null,
      `all decision-unit insights have '${field}'`,
      `insight '${missing}' is missing '${field}'`);
  }

  // secondaryOptions always includes both sentinel actions.
  let badRIC = null, badDismiss = null;
  for (const i of dInsights) {
    if (!Array.isArray(i.secondaryOptions)) continue;
    if (!i.secondaryOptions.includes('Review in Chat')) { badRIC = i.id; break; }
  }
  for (const i of dInsights) {
    if (!Array.isArray(i.secondaryOptions)) continue;
    if (!i.secondaryOptions.includes('Dismiss')) { badDismiss = i.id; break; }
  }
  record('CARD STRUCTURE', badRIC === null,
    'secondaryOptions always includes "Review in Chat"',
    `insight '${badRIC}' secondaryOptions missing "Review in Chat"`);
  record('CARD STRUCTURE', badDismiss === null,
    'secondaryOptions always includes "Dismiss"',
    `insight '${badDismiss}' secondaryOptions missing "Dismiss"`);

  // situationTitle must be entity-first — no system-label prefix like the old title field used.
  // Patterns that indicate a system-label construction rather than an entity name / number.
  const SYSTEM_PREFIXES = ['Overdue invoice', 'Forward booking', 'Utilisation below', 'Missing timesheets'];
  let badEntityFirst = null;
  for (const i of dInsights) {
    if (!i.situationTitle) continue;
    const badPrefix = SYSTEM_PREFIXES.find(p => i.situationTitle.startsWith(p));
    if (badPrefix) {
      badEntityFirst = `'${i.id}': "${i.situationTitle.slice(0, 50)}"`;
      break;
    }
  }
  record('CARD STRUCTURE', badEntityFirst === null,
    'situationTitle is entity-first (no system-label prefix)',
    `not entity-first: ${badEntityFirst}`);

} catch (e) {
  record('CARD STRUCTURE', false, '', `failed: ${e.message}`);
}

// ── 8. Coaching state logic ────────────────────────────────────────────────
console.log('\n[8] COACHING STATE LOGIC');
try {
  const { deriveFirmGoalState, getCoachingVoice } = require('../server/lib/methodology/insightGenerator');

  // Goal-scaled threshold cases at 4pp gap — same gap, four different states.
  // 4pp is below stable's 5pp at_goal threshold but above steady's 3pp,
  // above significant's 1pp (below its 5pp struggling threshold),
  // and above top's 3pp struggling threshold.
  const scaledCases = [
    { goal: 'stable',      gap: 4, expected: 'at_goal',          note: 'within 5pp stable at_goal threshold' },
    { goal: 'steady',      gap: 4, expected: 'below_closing',    note: 'above 3pp steady threshold, below 10pp struggling' },
    { goal: 'significant', gap: 4, expected: 'below_closing',    note: 'above 1pp threshold, below 5pp struggling' },
    { goal: 'top',         gap: 4, expected: 'below_struggling', note: 'above 3pp top struggling threshold' },
  ];
  for (const { goal, gap, expected, note } of scaledCases) {
    const state = deriveFirmGoalState(gap, goal);
    record('COACHING STATE',
      state === expected,
      `${goal} + ${gap}pp → ${expected} (${note})`,
      `${goal} + ${gap}pp: expected '${expected}', got '${state}'`);
  }

  // Any goal + large gap (16pp exceeds every struggling threshold) → below_struggling.
  for (const goal of ['stable', 'steady', 'significant', 'top']) {
    const state = deriveFirmGoalState(16, goal);
    record('COACHING STATE',
      state === 'below_struggling',
      `any goal (${goal}) + 16pp → below_struggling`,
      `${goal} + 16pp: expected 'below_struggling', got '${state}'`);
  }

  // Any goal + negative gap → above_goal (performing better than benchmark).
  for (const goal of ['stable', 'top']) {
    const state = deriveFirmGoalState(-1, goal);
    record('COACHING STATE',
      state === 'above_goal',
      `any goal (${goal}) + -1pp → above_goal`,
      `${goal} + -1pp: expected 'above_goal', got '${state}'`);
  }

  // below_struggling preserves urgent prefix across ALL coaching styles —
  // the one invariant the code documents explicitly.
  let urgencyFail = null;
  for (const style of ['supportive', 'direct', 'data']) {
    const voice = getCoachingVoice(20, style, 'below_struggling');
    if (!voice.prefix || voice.prefix.length === 0) { urgencyFail = style; break; }
  }
  record('COACHING STATE', urgencyFail === null,
    'below_struggling preserves urgent prefix for all coaching styles (supportive/direct/data)',
    `below_struggling + ${urgencyFail}: expected non-empty prefix, got none`);

  // above_goal produces forward-looking suffix (contains "next level" or "target").
  const aboveVoice = getCoachingVoice(-1, 'supportive', 'above_goal');
  record('COACHING STATE',
    aboveVoice.suffix.length > 0 && /next level|target/i.test(aboveVoice.suffix),
    `above_goal: suffix contains forward-looking language ("${aboveVoice.suffix.slice(0, 60)}")`,
    `above_goal: expected forward-looking suffix, got '${aboveVoice.suffix}'`);

} catch (e) {
  record('COACHING STATE', false, '', `failed: ${e.message}`);
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(40));
console.log(`✓ ${passed} test(s) passed`);
if (failed > 0) {
  console.log(`✗ ${failed} test(s) failed`);
  console.log('\nFailures:');
  for (const f of failures) console.log(`  • ${f}`);
  process.exit(1);
} else {
  console.log('All tests passed.');
  process.exit(0);
}
