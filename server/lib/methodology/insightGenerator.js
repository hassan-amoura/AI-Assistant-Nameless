'use strict';

const { assessMaturity } = require('./maturityAssessor');
const { getMockTenantData } = require('./mockTenantData');
const { operationsTrack } = require('./knowledgeBase');

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function weekSlug() {
  const now = new Date();
  return `${now.getFullYear()}-w${isoWeek(now)}`;
}

function fmtMoney(n) {
  return '$' + n.toLocaleString('en-US');
}

function makeId(...parts) {
  return parts.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
}

function audienceMatches(audience, userRole) {
  return audience.includes('all') || audience.includes(userRole);
}

function firstName(fullName) {
  return String(fullName || '').split(' ')[0];
}

function humanJoinNames(names) {
  if (!names || !names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function shortClientName(client) {
  return String(client || '').split(/[\s,]/)[0];
}

/**
 * Derive firmGoalState from a gap (in pp) scaled to the user's firmGoal.
 *   stable:      at_goal ≤ 5pp,  struggling > 15pp
 *   steady:      at_goal ≤ 3pp,  struggling > 10pp  (default)
 *   significant: at_goal ≤ 1pp,  struggling > 5pp
 *   top:         at_goal ≤ 0pp,  struggling > 3pp
 */
function deriveFirmGoalState(gapMagnitude, firmGoal) {
  if (typeof gapMagnitude !== 'number') return 'at_goal';
  const thresholds = {
    stable:      { atGoal: 5,  struggling: 15 },
    steady:      { atGoal: 3,  struggling: 10 },
    significant: { atGoal: 1,  struggling: 5  },
    top:         { atGoal: 0,  struggling: 3  },
  };
  const t = thresholds[firmGoal] || thresholds.steady;
  if (gapMagnitude < 0)             return 'above_goal';
  if (gapMagnitude <= t.atGoal)     return 'at_goal';
  if (gapMagnitude > t.struggling)  return 'below_struggling';
  return 'below_closing';
}

/**
 * Returns a tone wrapper for benchmark-gap copy.
 * @param {number} gapMagnitude  gap in percentage points (positive = below benchmark)
 * @param {string} coachingStyle 'supportive' | 'direct' | 'data'
 * @param {string} [firmGoalState] explicit state override (skips derivation)
 * @param {string} [firmGoal] 'stable'|'steady'|'significant'|'top' — used for derivation
 */
function getCoachingVoice(gapMagnitude, coachingStyle, firmGoalState, firmGoal) {
  const state = firmGoalState || deriveFirmGoalState(gapMagnitude, firmGoal);

  let tone, prefix, suffix;
  if (state === 'below_struggling') {
    tone = 'critical';
    prefix = "We've got work to do — ";
    suffix = "But the good news: the data is clear on where to start. Let's look at the three biggest levers.";
  } else if (state === 'below_closing') {
    tone = 'coaching';
    prefix = '';
    suffix = "You're closing the gap — this is what keeps the trend going.";
  } else if (state === 'at_goal') {
    tone = 'maintenance';
    prefix = '';
    suffix = "Things are running well. Here's what to watch.";
  } else { // above_goal
    tone = 'positive';
    prefix = '';
    suffix = "You've hit your target. Here's what the next level looks like.";
  }

  // Style preference applied AFTER state selection.
  // below_struggling preserves urgency across all styles — only the soft
  // suffix can be stripped. Other states drop both prefix and suffix when
  // the user wants a terser voice.
  const isStruggling = state === 'below_struggling';
  if (coachingStyle === 'direct') {
    if (!isStruggling) prefix = '';
    suffix = '';
  } else if (coachingStyle === 'data') {
    if (!isStruggling) prefix = '';
    suffix = '';
  }

  return { tone, prefix, suffix, firmGoalState: state };
}

// ── Per-insight decision bridge builders ───────────────────────────────────
// Each takes the entity context plus coachingStyle (and firmGoalState where
// relevant) and returns the single-sentence card-face line.

function _invoiceBridge(inv, coachingStyle) {
  const days = inv.daysOverdue;
  if (coachingStyle === 'data') {
    return `DSO impact: ${days} days × ${fmtMoney(inv.amount)} — accumulating revenue risk.`;
  }
  // > 60 days is treated as urgent regardless of supportive/direct flavour.
  if (days > 60) {
    if (coachingStyle === 'direct') return `${days} days. Send the reminder now.`;
    return `${days} days. The longer this sits, the harder it gets — send the reminder now.`;
  }
  if (days >= 30) {
    if (coachingStyle === 'direct') return `${days} days overdue. Send the reminder.`;
    return `A reminder hasn't been sent yet — the longer this sits, the harder it gets.`;
  }
  if (coachingStyle === 'direct') return `${days} days overdue. Worth nudging.`;
  return `Still in the friendly window — a quick reminder usually clears it.`;
}

function _budgetBridge(p, overPct, coachingStyle) {
  const burnedStr = fmtMoney(p.workedAmount);
  const budgetStr = fmtMoney(p.budgetFee);
  let action;
  if (overPct >= 15)      action = 'Critical — escalate now.';
  else if (overPct >= 5)  action = 'This needs a PM conversation.';
  else                    action = 'Catch it now before it grows.';

  if (coachingStyle === 'data') {
    return `${burnedStr} / ${budgetStr} budget = ${overPct}% over.`;
  }
  return `${burnedStr} burned against a ${budgetStr} budget. ${action}`;
}

function _bookingBridge(weeks, orgName, coachingStyle, firmGoalState) {
  const gap = 8 - weeks;
  if (coachingStyle === 'data') {
    return `Forward booking: ${weeks} weeks. L2 benchmark: 8 weeks. Gap: ${gap} weeks.`;
  }
  if (firmGoalState === 'below_struggling') {
    return `L2 firms book 8+ weeks out. ${orgName} is ${gap} weeks short — biggest delivery risk right now.`;
  }
  if (coachingStyle === 'direct') {
    return `L2 firms book 8+ weeks out. ${gap} weeks short.`;
  }
  return `L2 firms book 8+ weeks out. This is ${orgName}'s biggest delivery risk right now.`;
}

function _timesheetsBridge(missing, coachingStyle) {
  const n = missing.length;
  if (coachingStyle === 'data') {
    return `${n} ${n === 1 ? 'person' : 'people'} unsubmitted. Allocations available — entries can be drafted.`;
  }
  if (n === 1) {
    return 'Allocated — I can draft the entry from project assignments.';
  }
  if (n === 2) {
    return 'Both are allocated — I can draft their entries from their project assignments.';
  }
  return 'All allocated — I can draft entries from their project assignments.';
}

function _utilisationBridge(currentPct, nextPct, onePpValue, lowUtilNames, coachingStyle) {
  const namesStr = humanJoinNames(lowUtilNames);
  const namesClause = lowUtilNames.length
    ? `${namesStr} ${lowUtilNames.length === 1 ? 'is' : 'are'} where that point is.`
    : '';
  if (coachingStyle === 'data') {
    return `+1pp util (${currentPct}→${nextPct}%) = +${fmtMoney(onePpValue)}/yr. ${namesClause}`.trim();
  }
  const main = `Moving one point to ${nextPct}% adds ${fmtMoney(onePpValue)}/year.`;
  return namesClause ? `${main} ${namesClause}` : main;
}

function _wipBridge(wip, coachingStyle) {
  if (coachingStyle === 'data') {
    return `${fmtMoney(wip)} uninvoiced. Oldest items: ~6 weeks (mid-March).`;
  }
  if (coachingStyle === 'direct') {
    return `Some has sat since mid-March. Invoice it — cash sooner.`;
  }
  return `Some of this has been sitting since mid-March — invoicing now means cash sooner.`;
}

// Demo-only observations keyed by mock staff name. Real implementation would
// derive these from forward booking, project allocations, and pipeline data.
const _LOW_UTIL_OBSERVATIONS = {
  'James Wu':   'between projects last week — worth checking what is next in his pipeline',
  'Tom Lawson': 'biggest single gap on the team this month — needs a pipeline conversation',
  'Sarah Chen': 'trending downward — flag for the next resource review',
  'Priya Nair': 'below threshold this month — check booked-out hours for next week',
  'Emma Blake': 'below threshold this month — check booked-out hours for next week',
};

function generateInsights(userId, userRole, tenantData, maturityResult) {
  const now = new Date().toISOString();
  const wk = weekSlug();
  const orgName       = tenantData.orgName       || 'your firm';
  const coachingStyle = tenantData.coachingStyle || 'supportive';
  const firmGoal      = tenantData.firmGoal      || 'steady';
  const all = [];

  // ── Utilisation gap ─────────────────────────────────────────────────────────
  {
    const rate = tenantData.utilisationRate;
    const bh = tenantData.billableHeadcount;
    const cr = tenantData.impliedChargeOutRate;
    const audience = ['project_manager', 'director'];
    if (typeof rate === 'number' && rate < 0.689) {
      const onePpValue    = Math.round(1 * 0.01 * bh * cr * 1800 / 1000) * 1000;
      const fullGap       = 0.698 - rate;
      const totalGapValue = Math.round(fullGap * bh * cr * 1800 / 1000) * 1000;
      const gapMagnitudePp = fullGap * 100;
      const voice = getCoachingVoice(gapMagnitudePp, coachingStyle, undefined, firmGoal);

      const currentPct = Math.round(rate * 100);
      const nextPct    = currentPct + 1;
      const benchmarkPct = 69.8;

      // Low-util staff for body section + decision bridge name list
      const lowUtil = (tenantData.billableStaff || [])
        .filter(s => typeof s.utilisationThisMonth === 'number' && s.utilisationThisMonth < 0.65)
        .slice(0, 2);
      const lowUtilNames = lowUtil.map(s => firstName(s.name));

      // ── Long-form body (kept for chat / drawer context) ──
      const oneppLine = `${voice.prefix}Moving just one percentage point — from ${currentPct}% to ${nextPct}% — adds ${fmtMoney(onePpValue)} to your bottom line annually.`;
      let hidingBlock = '';
      if (lowUtil.length > 0) {
        const lines = lowUtil.map(s => {
          const obs = _LOW_UTIL_OBSERVATIONS[s.name] || 'below threshold this month';
          return `• ${s.name} is at ${Math.round(s.utilisationThisMonth * 100)}% this month — ${obs}.`;
        });
        hidingBlock = `Based on your team data, here's where that point is hiding:\n${lines.join('\n')}`;
      }
      const simulationLine = `When you're ready — want me to simulate what running at 69.8% looks like for ${orgName}? That's where the top 50% of firms operate. Based on your current team, it's achievable. I can show you the path.`;
      const sections = [oneppLine];
      if (hidingBlock) sections.push(hidingBlock);
      if (coachingStyle !== 'data') sections.push(simulationLine);
      if (voice.suffix) sections.push(voice.suffix);
      const body = sections.join('\n\n');

      all.push({
        id: makeId('util-gap', wk),
        userId,
        type: 'benchmark_gap',
        cadence: 'weekly',
        audience,
        title: 'Utilisation below top-performer benchmark',
        body,
        metric: 'utilisationRate',
        value: rate,
        benchmark: 0.698,
        dollarImpact: `~${fmtMoney(onePpValue)}/year per percentage point`,
        totalGapValue,
        coachingTone: voice.tone,
        firmGoalState: voice.firmGoalState,
        action: 'Show me utilisation breakdown by person',
        severity: 'medium',
        // ── Decision-unit fields ──
        situationTitle: `${orgName} is running at ${currentPct}% — top firms run at ${benchmarkPct}%`,
        decisionBridge: _utilisationBridge(currentPct, nextPct, onePpValue, lowUtilNames, coachingStyle),
        primaryAction: 'Show me the breakdown',
        secondaryOptions: [`Simulate ${benchmarkPct}% performance`, 'Review in Chat', 'Dismiss'],
        read: false,
        dismissed: false,
        createdAt: now,
      });
    }
  }

  // ── Missing timesheets ──────────────────────────────────────────────────────
  {
    const audience = ['project_manager'];
    const missing = (tenantData.billableStaff || []).filter(s => !s.timesheetComplete);
    if (missing.length > 0) {
      const namesStr = humanJoinNames(missing.map(s => s.name));
      const firstNames = missing.map(s => firstName(s.name));
      const primaryAction = missing.length === 1
        ? `Review & submit for ${firstNames[0]}`
        : missing.length === 2
          ? `Review & submit for ${firstNames[0]} + ${firstNames[1]}`
          : `Review & submit for ${missing.length} people`;

      all.push({
        id: makeId('missing-ts', wk),
        userId,
        type: 'missing_behavior',
        cadence: 'weekly',
        audience,
        title: `${missing.length} ${missing.length === 1 ? 'person hasn\'t' : 'people haven\'t'} submitted timesheets`,
        body: `${namesStr} ${missing.length === 1 ? 'hasn\'t' : 'haven\'t'} submitted timesheets for last week.`,
        metric: 'timesheetCompletionRate',
        action: 'Who is missing timesheets this week?',
        severity: 'medium',
        // ── Decision-unit fields ──
        situationTitle: `${namesStr} ${missing.length === 1 ? "hasn't" : "haven't"} submitted last week`,
        decisionBridge: _timesheetsBridge(missing, coachingStyle),
        primaryAction,
        secondaryOptions: ['Edit entries first', 'Review in Chat', 'Dismiss'],
        read: false,
        dismissed: false,
        createdAt: now,
      });
    }
  }

  // ── Forward booking gap ─────────────────────────────────────────────────────
  {
    const audience = ['project_manager', 'director'];
    const weeks = tenantData.forwardBookingWeeks;
    if (typeof weeks === 'number' && weeks < 8) {
      const gapPp = (8 - weeks);             // weeks short, treated as the gap signal
      const voice = getCoachingVoice(gapPp, coachingStyle, undefined, firmGoal);
      all.push({
        id: makeId('fwd-booking', wk),
        userId,
        type: 'benchmark_gap',
        cadence: 'weekly',
        audience,
        title: 'Forward booking below L2 threshold',
        body: `Resources are currently booked ${weeks} weeks ahead. L2 firms typically book 8+ weeks ahead. This is the single biggest indicator of delivery risk.`,
        metric: 'forwardBookingWeeks',
        value: weeks,
        benchmark: 8,
        action: 'Show me forward booking by person',
        severity: 'high',
        coachingTone: voice.tone,
        firmGoalState: voice.firmGoalState,
        // ── Decision-unit fields ──
        situationTitle: `${orgName} is only booked ${weeks} weeks ahead`,
        decisionBridge: _bookingBridge(weeks, orgName, coachingStyle, voice.firmGoalState),
        primaryAction: 'Show booking gaps by person',
        secondaryOptions: ['Simulate 8-week target', 'Review in Chat', 'Dismiss'],
        read: false,
        dismissed: false,
        createdAt: now,
      });
    }
  }

  // ── At-risk projects (over budget) ──────────────────────────────────────────
  {
    const audience = ['project_manager', 'finance', 'director'];
    const atRisk = (tenantData.activeProjects || []).filter(p => p.status === 'at_risk');
    for (const p of atRisk) {
      const overPct = Math.round((p.workedAmount / p.budgetFee - 1) * 100);
      const overAbs = Math.abs(overPct);
      all.push({
        id: makeId('at-risk', p.name, wk),
        userId,
        type: 'at_risk',
        cadence: 'weekly',
        audience,
        title: `${p.name} is over budget`,
        body: `${p.name} has burned ${fmtMoney(p.workedAmount)} against a ${fmtMoney(p.budgetFee)} budget — it's ${overAbs}% over fee budget.`,
        metric: 'projectMargin',
        value: p.margin,
        action: 'Show me the full project health breakdown',
        severity: 'high',
        // ── Decision-unit fields ──
        situationTitle: `${p.name} is ${overAbs}% over fee budget`,
        decisionBridge: _budgetBridge(p, overAbs, coachingStyle),
        primaryAction: 'Review budget overrun',
        secondaryOptions: ['Notify PM', 'Review in Chat', 'Dismiss'],
        read: false,
        dismissed: false,
        createdAt: now,
      });
    }
  }

  // ── Overdue invoices ────────────────────────────────────────────────────────
  {
    const audience = ['finance', 'director', 'project_manager'];
    const overdue = tenantData.overdueInvoices || [];
    for (const inv of overdue) {
      all.push({
        id: makeId('overdue', inv.invoiceNumber, wk),
        userId,
        type: 'at_risk',
        cadence: 'weekly',
        audience,
        title: `Overdue invoice — ${inv.client}`,
        body: `${inv.invoiceNumber} for ${inv.client} (${fmtMoney(inv.amount)}) is ${inv.daysOverdue} days overdue.`,
        metric: 'overdueInvoices',
        value: inv.amount,
        action: 'Show me all overdue invoices',
        severity: inv.daysOverdue >= 60 ? 'high' : 'medium',
        // ── Decision-unit fields ──
        situationTitle: `${inv.client} owes ${fmtMoney(inv.amount)} — ${inv.daysOverdue} days overdue`,
        decisionBridge: _invoiceBridge(inv, coachingStyle),
        primaryAction: `Send reminder to ${shortClientName(inv.client)}`,
        secondaryOptions: ['Review invoice first', 'Review in Chat', 'Dismiss'],
        read: false,
        dismissed: false,
        createdAt: now,
      });
    }
  }

  // ── Outstanding WIP ─────────────────────────────────────────────────────────
  {
    const audience = ['finance', 'director'];
    const wip = tenantData.outstandingWIP;
    if (typeof wip === 'number' && wip > 0) {
      all.push({
        id: makeId('wip-flag', wk),
        userId,
        type: 'benchmark_gap',
        cadence: 'monthly',
        audience,
        title: `${fmtMoney(wip)} in uninvoiced WIP`,
        body: `There is ${fmtMoney(Math.round(wip / 1000))}k in worked-but-not-invoiced WIP sitting in the system. The oldest items are from mid-March.`,
        metric: 'outstandingWIP',
        value: wip,
        action: 'Show me WIP by project',
        severity: 'medium',
        // ── Decision-unit fields ──
        situationTitle: `${fmtMoney(wip)} in uninvoiced WIP — some from mid-March`,
        decisionBridge: _wipBridge(wip, coachingStyle),
        primaryAction: 'Show WIP by project',
        secondaryOptions: ['Draft invoices', 'Review in Chat', 'Dismiss'],
        read: false,
        dismissed: false,
        createdAt: now,
      });
    }
  }

  // ── T&E: Timesheet status ───────────────────────────────────────────────────
  // (Personal reminder — not a decision unit; kept as-is.)
  {
    const audience = ['time_expense'];
    const pending = (tenantData.myTimesheets || []).find(t => t.status === 'not_started');
    if (pending) {
      const alloc = (tenantData.myAllocations || [])[0];
      const allocLine = alloc
        ? ` You're allocated ${alloc.weeklyHours} hours on ${alloc.project} (${alloc.timecodeName}).`
        : '';
      all.push({
        id: makeId('ts-status', pending.week),
        userId,
        type: 'reminder',
        cadence: 'weekly',
        audience,
        title: `Your timesheet for ${pending.week}`,
        body: `You haven't started your timesheet for this week.${allocLine}`,
        metric: 'myTimesheets',
        action: 'Show me my allocation for this week',
        severity: 'medium',
        read: false,
        dismissed: false,
        createdAt: now,
      });
    }
  }

  // ── T&E: Allocation summary ─────────────────────────────────────────────────
  // (Personal reminder — not a decision unit; kept as-is.)
  {
    const audience = ['time_expense'];
    const alloc = (tenantData.myAllocations || [])[0];
    if (alloc) {
      all.push({
        id: makeId('alloc', alloc.project, wk),
        userId,
        type: 'reminder',
        cadence: 'weekly',
        audience,
        title: `You have ${alloc.remainingHours} hours remaining on ${alloc.project}`,
        body: `You've logged ${alloc.loggedHours} of ${alloc.allocatedHours} allocated hours on ${alloc.timecodeName} / ${alloc.project}.`,
        metric: 'myAllocations',
        action: 'Show me my full allocation breakdown',
        severity: 'low',
        read: false,
        dismissed: false,
        createdAt: now,
      });
    }
  }

  return all.filter(i => audienceMatches(i.audience, userRole));
}

module.exports = { generateInsights, getCoachingVoice, deriveFirmGoalState };
