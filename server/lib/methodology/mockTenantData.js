'use strict';

function getMockTenantData(userId, userRole) {
  return {
    tenantId: 'demo',
    orgName: 'Meridian Consulting',
    headcount: 42,
    billableHeadcount: 37,
    impliedChargeOutRate: 153,
    // Coaching voice preference — the server overrides this with the user's
    // saved `coachingStyle` preference before the insight generator runs.
    coachingStyle: 'supportive',

    // L1 signals — solid, firm is established here
    timesheetCompletionRate: 0.84,
    invoicesGeneratedFromTimesheets: true,
    weeklyTimesheetReview: true,

    // L2 signals — partially present, showing the gap
    forwardBookingWeeks: 3,
    utilisationRate: 0.64,
    weeklyResourceMeeting: true,
    dealReviewMeeting: false,

    // L3 signals — not present
    weeklyWIPReview: false,
    projectMarginTracked: false,
    burnRateMonitored: false,

    // L4 signals — not present
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

    // For T&E users — personal data
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
      { week: 'Apr 21–25',    status: 'submitted',   hours: 40 },
      { week: 'Apr 28–May 2', status: 'not_started', hours: 0  },
    ],
  };
}

module.exports = { getMockTenantData };
