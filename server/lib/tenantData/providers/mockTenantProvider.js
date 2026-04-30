'use strict';

const { assessMaturity } = require('../../methodology/maturityAssessor');
const { operationsTrack, growthTrack } = require('../../methodology/knowledgeBase');

const MOCK_PROVIDER_ID = 'mock';

function getMockTenantData(userId, userRole) {
  return {
    tenantId: 'demo',
    orgName: 'Meridian Consulting',
    headcount: 42,
    billableHeadcount: 37,
    impliedChargeOutRate: 153,
    // Coaching voice preference: the server overrides this with the user's
    // saved `coachingStyle` preference before the insight generator runs.
    coachingStyle: 'supportive',

    // L1 signals: solid, firm is established here
    timesheetCompletionRate: 0.84,
    invoicesGeneratedFromTimesheets: true,
    weeklyTimesheetReview: true,

    // L2 signals: partially present, showing the gap
    forwardBookingWeeks: 3,
    utilisationRate: 0.64,
    weeklyResourceMeeting: true,
    dealReviewMeeting: false,

    // L3 signals: not present
    weeklyWIPReview: false,
    projectMarginTracked: false,
    burnRateMonitored: false,

    // L4 signals: not present
    forecastingEnabled: false,
    firmMarginReporting: false,

    // Growth signals
    proposalVolumeTracked: false,
    winRateTracked: false,
    icpDefined: true,
    pipelineVisibleToTeam: false,
    positioningStatementDefined: false,

    // Financial snapshot
    avgMonthlyRevenue: 850000,
    avgProjectMargin: 0.28,
    avgServicesMargin: 0.103,
    outstandingWIP: 145000,
    overdueInvoices: [
      {
        invoiceNumber: 'INV-1847',
        client: 'Nexus Property Group',
        amount: 34500,
        daysOverdue: 61,
      },
      {
        invoiceNumber: 'INV-1901',
        client: 'Apex Financial Group',
        amount: 18200,
        daysOverdue: 23,
      },
    ],

    // People snapshot
    billableStaff: [
      { name: 'Sarah Chen',  utilisationThisMonth: 0.71, timesheetComplete: true  },
      { name: 'James Wu',    utilisationThisMonth: 0.43, timesheetComplete: false },
      { name: 'Priya Nair',  utilisationThisMonth: 0.88, timesheetComplete: true  },
      { name: 'Tom Lawson',  utilisationThisMonth: 0.31, timesheetComplete: false },
      { name: 'Emma Blake',  utilisationThisMonth: 0.67, timesheetComplete: true  },
    ],

    // Projects snapshot
    activeProjects: [
      {
        name: 'Nebula Cloud Migration',
        client: 'Meridian Health',
        budgetFee: 94200,
        workedAmount: 98100,
        margin: -0.04,
        status: 'at_risk',
      },
      {
        name: 'Apollo Data Platform',
        client: 'BlueStar Financial',
        budgetFee: 243800,
        workedAmount: 176500,
        margin: 0.31,
        status: 'healthy',
      },
      {
        name: 'Genesis CRM Implementation',
        client: 'Pacific Infrastructure',
        budgetFee: 211400,
        workedAmount: 118500,
        margin: 0.34,
        status: 'healthy',
      },
    ],

    // For T&E users: personal data
    myAllocations: [
      {
        project: 'Apollo Data Platform',
        timecodeId: 'TC-204',
        timecodeName: 'Development',
        allocatedHours: 100,
        loggedHours: 64,
        remainingHours: 36,
        weeklyHours: 8,
      },
    ],
    myTimesheets: [
      { week: 'Apr 21\u201325',    status: 'submitted',   hours: 40 },
      { week: 'Apr 28\u2013May 2', status: 'not_started', hours: 0  },
    ],
  };
}

function firstHabit(track, level) {
  const def = track.find(item => item.level === level);
  if (!def || !def.habits) return null;
  return (
    (def.habits.daily && def.habits.daily[0]) ||
    (def.habits.weekly && def.habits.weekly[0]) ||
    (def.habits.monthly && def.habits.monthly[0]) ||
    null
  );
}

function deriveFirmStage(data) {
  const annualRevenue = (Number(data.avgMonthlyRevenue) || 0) * 12;
  const headcount = Number(data.headcount) || 0;

  let revenueBand = '$0-$5M';
  let stageLabel = '$0-$5M Foundation';
  let likelyScalingWall = 'Founder-led delivery and repeatable revenue visibility';
  if (annualRevenue >= 50000000) {
    revenueBand = '$50M+';
    stageLabel = '$50M+ Enterprise Scale';
    likelyScalingWall = 'Leadership operating system, market focus, and margin consistency';
  } else if (annualRevenue >= 5000000) {
    revenueBand = '$5M-$50M';
    stageLabel = '$5M-$50M Scale-Up';
    likelyScalingWall = 'Leadership delegation, delivery methodology, and operating cadence';
  }

  let headcountBand = '1-10';
  if (headcount > 100) headcountBand = '100+';
  else if (headcount > 50) headcountBand = '51-100';
  else if (headcount > 25) headcountBand = '26-50';
  else if (headcount > 10) headcountBand = '11-25';

  return { revenueBand, headcountBand, stageLabel, likelyScalingWall };
}

function buildArAging(overdueInvoices) {
  const buckets = {
    current: 0,
    days1To30: 0,
    days31To60: 0,
    days61Plus: 0,
  };

  for (const invoice of overdueInvoices) {
    const amount = Number(invoice.amount) || 0;
    const days = Number(invoice.daysOverdue) || 0;
    if (days >= 61) buckets.days61Plus += amount;
    else if (days >= 31) buckets.days31To60 += amount;
    else if (days >= 1) buckets.days1To30 += amount;
    else buckets.current += amount;
  }

  return buckets;
}

function buildBenchmarkTargets(maturity) {
  const nextOps = maturity.ops && maturity.ops.nextLevel;
  const nextGrowth = maturity.growth && maturity.growth.nextLevel;
  const targets = {};

  for (const indicator of [
    ...((nextOps && nextOps.gapIndicators) || []),
    ...((nextGrowth && nextGrowth.gapIndicators) || []),
  ]) {
    if (indicator && indicator.id) {
      targets[indicator.id] = {
        name: indicator.name,
        threshold: indicator.threshold,
        unit: indicator.unit,
      };
    }
  }

  return {
    utilisationRate: { threshold: 0.698, unit: 'percent', source: 'top-performer benchmark' },
    forwardBookingWeeks: { threshold: 8, unit: 'weeks', source: 'Projectworks Method L2' },
    timesheetCompletionRate: { threshold: 0.8, unit: 'percent', source: 'Projectworks Method L1' },
    ...targets,
  };
}

function buildSnapshot({ tenantId, userId, role, userContext } = {}) {
  const userRole = role || 'project_manager';
  const ctx = userContext && typeof userContext === 'object' ? userContext : {};
  const data = getMockTenantData(userId || 'demo-user', userRole);

  if (ctx.coachingStyle) data.coachingStyle = ctx.coachingStyle;
  if (ctx.firmGoal) data.firmGoal = ctx.firmGoal;

  const maturity = assessMaturity(data);
  const overdueInvoices = Array.isArray(data.overdueInvoices) ? data.overdueInvoices : [];
  const activeProjects = Array.isArray(data.activeProjects) ? data.activeProjects : [];
  const billableStaff = Array.isArray(data.billableStaff) ? data.billableStaff : [];
  const forwardBookingWeeks = typeof data.forwardBookingWeeks === 'number' ? data.forwardBookingWeeks : null;
  const forwardBookingTarget = 8;

  return {
    tenant: {
      id: tenantId || data.tenantId || 'demo',
      orgName: data.orgName || 'Demo Firm',
      industry: 'Professional Services',
      currency: 'USD',
      timezone: 'UTC',
      source: MOCK_PROVIDER_ID,
    },
    user: {
      id: userId || 'demo-user',
      email: ctx.email || null,
      displayName: ctx.displayName || ctx.name || null,
      role: userRole,
      permissions: Array.isArray(ctx.permissions)
        ? ctx.permissions
        : ['insights:read', 'actions:prepare'],
      coachingStyle: ctx.coachingStyle || data.coachingStyle || 'supportive',
      firmGoal: ctx.firmGoal || data.firmGoal || 'steady',
      assistantAutonomy: ctx.assistantAutonomy || 'propose',
    },
    maturity: {
      operationsLevel: maturity.ops.level,
      operationsLevelName: maturity.ops.levelName,
      growthLevel: maturity.growth.level,
      growthLevelName: maturity.growth.levelName,
    },
    firmStage: deriveFirmStage(data),
    financials: {
      overdueInvoices,
      uninvoicedWip: data.outstandingWIP || 0,
      revenue: {
        avgMonthlyRevenue: data.avgMonthlyRevenue || 0,
        annualizedRevenue: (data.avgMonthlyRevenue || 0) * 12,
      },
      margin: {
        avgProjectMargin: data.avgProjectMargin || null,
        avgServicesMargin: data.avgServicesMargin || null,
      },
      arAging: buildArAging(overdueInvoices),
    },
    projects: {
      atRisk: activeProjects.filter(p => p.status === 'at_risk'),
      overBudget: activeProjects.filter(p =>
        typeof p.workedAmount === 'number' &&
        typeof p.budgetFee === 'number' &&
        p.workedAmount > p.budgetFee
      ),
      underServiced: [],
      lowMargin: activeProjects.filter(p => typeof p.margin === 'number' && p.margin < 0.2),
    },
    people: {
      missingTimesheets: billableStaff.filter(p => !p.timesheetComplete),
      utilisation: {
        currentRate: data.utilisationRate || null,
        billableHeadcount: data.billableHeadcount || 0,
        impliedChargeOutRate: data.impliedChargeOutRate || null,
      },
      lowUtilisationStaff: billableStaff.filter(p =>
        typeof p.utilisationThisMonth === 'number' && p.utilisationThisMonth < 0.65
      ),
      capacityGaps: [],
    },
    pipelineOrBookings: {
      currentWeeks: forwardBookingWeeks,
      targetWeeks: forwardBookingTarget,
      gaps: forwardBookingWeeks !== null && forwardBookingWeeks < forwardBookingTarget
        ? [{ metric: 'forwardBookingWeeks', current: forwardBookingWeeks, target: forwardBookingTarget }]
        : [],
      bookToBill: null,
      revenueConfidence: forwardBookingWeeks !== null && forwardBookingWeeks < forwardBookingTarget
        ? 'at_risk'
        : 'steady',
    },
    methodContext: {
      operationsTrackLevel: maturity.ops.level,
      operationsTrackName: maturity.ops.levelName,
      growthTrackLevel: maturity.growth.level,
      growthTrackName: maturity.growth.levelName,
      nextOperatingHabit: maturity.ops.nextLevel
        ? firstHabit(operationsTrack, maturity.ops.nextLevel.level)
        : null,
      nextGrowthHabit: maturity.growth.nextLevel
        ? firstHabit(growthTrack, maturity.growth.nextLevel.level)
        : null,
      benchmarkTargets: buildBenchmarkTargets(maturity),
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      provider: MOCK_PROVIDER_ID,
      schemaVersion: 'tenant-intelligence-snapshot.v1',
      dataSource: 'mockTenantProvider',
    },
  };
}

function getTenantIntelligenceSnapshot(input) {
  return buildSnapshot(input);
}

module.exports = {
  MOCK_PROVIDER_ID,
  getMockTenantData,
  getTenantIntelligenceSnapshot,
};
