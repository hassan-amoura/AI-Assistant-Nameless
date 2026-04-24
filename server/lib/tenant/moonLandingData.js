'use strict';

/**
 * Projectworks — internal tenant config for PW Report Builder.
 *
 * SWAP GUIDE: Replace this module with a real tenant config to go live.
 * The exported TENANT_CONFIG shape is the canonical schema — real data
 * must match it without changing any downstream consumers.
 * buildTenantContextBlock(config) generates the system-prompt injection
 * from any conforming config object.
 */

const TENANT_CONFIG = {
  org: {
    name: 'Projectworks',
    orgId: 'projectworks',
    industry: 'Management & Technology Consulting',
    currency: 'NZD',
    fiscalYearStart: 'July',
    headcount: 50,
    // All currencies active in this org's Projectworks instance.
    // baseCurrency is used for consolidated reporting.
    // activeCurrencies lists all project-level currencies in use.
    // Projectworks uses fixer.io for live FX rates — conversions in queries
    // should note which rate source and date was used.
    baseCurrency: 'NZD',
    activeCurrencies: ['NZD', 'AUD', 'USD'],
  },

  // TODO: populate with real org data before internal rollout
  teams: [],

  // TODO: populate with real org data before internal rollout
  people: [],

  projects: [
    {
      name: 'Orion Digital Transformation',
      client: 'Apex Financial Group',
      projectNumber: 'P-0042',
      pm: 'Leonardo DiCaprio',
      accountManager: 'Nicole Kidman',
      type: 'T&M',
      status: 'Active',
      startDate: '2025-08-01',
      endDate: '2026-06-30',
      feesBudget: 1240000,
      workedHoursToDate: 3420,
      invoicedToDate: 892000,
      healthSignal: 'on-track',
      notes: 'Flagship engagement, tracking to plan. Minor scope creep risk in Q2.',
    },
    {
      name: 'Nebula Cloud Migration',
      client: 'Meridian Health',
      projectNumber: 'P-0048',
      pm: 'Benedict Cumberbatch',
      accountManager: 'Jennifer Aniston',
      type: 'Fixed Price',
      status: 'Active',
      startDate: '2025-11-01',
      endDate: '2026-04-30',
      feesBudget: 480000,
      workedHoursToDate: 1890,
      invoicedToDate: 380000,
      healthSignal: 'over-budget',
      notes: 'Fixed price tracking ~10% over fee budget. Client-side change requests not yet formalised as variations.',
    },
    {
      name: 'Constellation Operating Model Review',
      client: 'Pacific Infrastructure Partners',
      projectNumber: 'P-0051',
      pm: 'Brad Pitt',
      accountManager: 'Jon Hamm',
      type: 'T&M',
      status: 'Active',
      startDate: '2025-12-01',
      endDate: '2026-05-31',
      feesBudget: 360000,
      workedHoursToDate: 980,
      invoicedToDate: 318000,
      healthSignal: 'margin-risk',
      notes: 'Appears healthy on revenue and hours. Hidden problem: senior staff cost rates are unusually high on this engagement. Effective margin is ~11% against a 25% target. Needs rate review or scope adjustment before it closes.',
    },
    {
      name: 'Apollo Data Platform',
      client: 'BlueStar Financial Services',
      projectNumber: 'P-0044',
      pm: 'Scarlett Johansson',
      accountManager: 'Amy Adams',
      type: 'T&M',
      status: 'Active',
      startDate: '2025-09-01',
      endDate: '2026-07-31',
      feesBudget: 680000,
      workedHoursToDate: 2140,
      invoicedToDate: 408000,
      healthSignal: 'on-track',
      notes: 'Main driver of Data & Analytics team utilisation. On track. Largest active engagement by remaining revenue.',
    },
    {
      name: 'Voyager ERP Consolidation',
      client: 'TechCore Solutions',
      projectNumber: 'P-0046',
      pm: 'Natalie Portman',
      accountManager: 'Russell Crowe',
      type: 'Fixed Price',
      status: 'Active',
      startDate: '2025-07-01',
      endDate: '2026-06-30',
      feesBudget: 520000,
      workedHoursToDate: 1680,
      invoicedToDate: 245000,
      wipUnInvoiced: 145000,
      wipDaysUnInvoiced: 47,
      healthSignal: 'wip-at-risk',
      notes: 'Phase 2 delivered and accepted by client 47 days ago. $145K milestone invoice not yet raised. Cash flow impact growing.',
    },
    {
      name: 'Discovery HR Transformation',
      client: 'Atlas Consulting Group',
      projectNumber: 'P-0053',
      pm: 'Meryl Streep',
      accountManager: 'Nicole Kidman',
      type: 'T&M',
      status: 'Active',
      startDate: '2026-01-15',
      endDate: '2026-09-30',
      feesBudget: 210000,
      workedHoursToDate: 430,
      invoicedToDate: 84000,
      healthSignal: 'on-track',
      notes: 'Strategy & Advisory led. Progressing well, client highly engaged.',
    },
    {
      name: 'Eclipse Risk & Compliance Uplift',
      client: 'Nexus Property Group',
      projectNumber: 'P-0049',
      pm: 'Idris Elba',
      accountManager: 'Jon Hamm',
      type: 'T&M',
      status: 'Active',
      startDate: '2025-10-01',
      endDate: '2026-06-30',
      feesBudget: 310000,
      workedHoursToDate: 1240,
      invoicedToDate: 215000,
      overdueInvoice: { amount: 95000, invoiceDate: '2026-02-19', daysOverdue: 61, invoiceNumber: 'INV-1847' },
      healthSignal: 'ar-risk',
      notes: 'INV-1847 for $95K issued 19 Feb 2026, now 61 days outstanding. Client unresponsive to last two follow-ups. Key relationship — needs senior escalation.',
    },
    {
      name: 'Genesis CRM Implementation',
      client: 'Vega Retail Group',
      projectNumber: 'P-0055',
      pm: 'Emma Stone',
      accountManager: 'Amy Adams',
      type: 'Fixed Price',
      status: 'Active',
      startDate: '2026-03-01',
      endDate: '2026-10-31',
      feesBudget: 380000,
      workedHoursToDate: 520,
      invoicedToDate: 76000,
      healthSignal: 'over-budget',
      notes: 'Only 6 weeks in but hours already running ~8% ahead of plan. Early burn rate suggests potential overrun without corrective action.',
    },
    {
      name: 'Titan Workforce Analytics',
      client: 'Solaris Energy',
      projectNumber: 'P-0052',
      pm: 'Tessa Thompson',
      accountManager: 'Jennifer Aniston',
      type: 'T&M',
      status: 'Active',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      feesBudget: 165000,
      workedHoursToDate: 610,
      invoicedToDate: 122000,
      healthSignal: 'on-track',
      notes: 'Small, well-run engagement. On track for June completion.',
    },
    {
      name: 'Lunar Finance Systems Review',
      client: 'Quantum Capital',
      projectNumber: 'P-0038',
      pm: 'Anthony Hopkins',
      accountManager: 'Russell Crowe',
      type: 'T&M',
      status: 'Completed',
      startDate: '2025-07-01',
      endDate: '2026-01-31',
      feesBudget: 195000,
      workedHoursToDate: 780,
      invoicedToDate: 195000,
      healthSignal: 'completed',
      notes: 'Completed Q1 FY26. Final invoice paid. Strong client satisfaction — follow-on engagement in pipeline.',
    },
  ],

  financialSnapshot: {
    asOf: 'April 2026',
    revenueYTD: 2139000,
    revenueTarget: 2800000,
    grossMarginYTD: 0.24,
    grossMarginTarget: 0.28,
    totalWIPUnInvoiced: 145000,
    totalOverdueAR: 95000,
  },

  utilisationSnapshot: {
    asOf: 'April 2026',
    billableHeadcount: 29,
    overallBillableUtilisation: 0.78,
    target: 0.80,
    onBench: ['Florence Pugh (38%)', 'Ryan Gosling (48%)', 'Leonardo DiCaprio (52%)'],
    overCapacity: ['Anya Taylor-Joy (112%)', 'Scarlett Johansson (108%)', 'Pedro Pascal (104%)'],
  },

  greeting: `Three things flagged this month: delivery team utilisation is down to 64% — Florence, Ryan, and Leonardo have been on bench for two to three weeks. Nebula Cloud Migration and Genesis CRM are both tracking over fee budget. And there's $145K in uninvoiced WIP on Voyager ERP that's been sitting since mid-March.\n\nWhere do you want to start?`,
};

// ── Context block builder ────────────────────────────────────────────────────
// Generates the compact tenant context injected into every system prompt.
// Keep output tight — it appears on every API request.

const pct = n => `${Math.round(n * 100)}%`;
const kAUD = n => `$${Math.round(n / 1000)}K`;

function buildTenantContextBlock(tenant) {
  const { org, teams, projects, financialSnapshot: fin, utilisationSnapshot: util } = tenant;

  const teamUtilLines = teams
    .filter(t => t.billable)
    .map(t => `  ${t.name}: ${pct(t.currentUtilisation)} (target ${pct(t.utilisationTarget)})`)
    .join('\n');

  const projectLines = projects.map(p => {
    const signals = {
      'on-track':    '✓ on track',
      'over-budget': '⚠ over budget',
      'margin-risk': '⚠ margin compressed',
      'wip-at-risk': `⚠ ${p.wipUnInvoiced ? kAUD(p.wipUnInvoiced) + ' uninvoiced WIP' : 'WIP risk'}`,
      'ar-risk':     `⚠ AR overdue${p.overdueInvoice ? ' ' + kAUD(p.overdueInvoice.amount) : ''}`,
      'completed':   '✓ completed',
    };
    return `  ${p.name} | ${p.client} | PM: ${p.pm} | ${p.type} | ${signals[p.healthSignal] || p.healthSignal}`;
  }).join('\n');

  const staffByTeam = {};
  tenant.people.forEach(p => {
    (staffByTeam[p.team] = staffByTeam[p.team] || []).push(p.name);
  });
  const staffLines = Object.entries(staffByTeam)
    .map(([team, names]) => `  ${team}: ${names.join(', ')}`)
    .join('\n');

  const currencyLine = org.activeCurrencies && org.activeCurrencies.length > 1
    ? `Base: ${org.baseCurrency || org.currency} | Active currencies: ${org.activeCurrencies.join(', ')} (rates via fixer.io)`
    : `Currency: ${org.baseCurrency || org.currency}`;

  return `
---
## TENANT CONTEXT — ${org.name}

Org: ${org.name} | ${org.industry} | ~${org.headcount} staff | ${currencyLine}
Snapshot: ${fin.asOf} | Revenue YTD: ${kAUD(fin.revenueYTD)} of ${kAUD(fin.revenueTarget)} target | Margin: ${pct(fin.grossMarginYTD)} vs ${pct(fin.grossMarginTarget)} target
WIP uninvoiced: ${kAUD(fin.totalWIPUnInvoiced)} | Overdue AR: ${kAUD(fin.totalOverdueAR)}

Utilisation (${util.asOf})
${teamUtilLines}
  On bench: ${util.onBench.join(', ')}
  Over capacity: ${util.overCapacity.join(', ')}

Active projects
${projectLines}

Key signals — surface these proactively when relevant
1. MARGIN: Constellation Operating Model Review — invoiced revenue looks normal, effective margin ~11% vs 25% target due to senior staff cost rates. The hidden problem on this engagement.
2. UTILISATION: Delivery at 64% with 3 consultants on bench. Data & Analytics near capacity with 3 people over 100%.
3. WIP: Voyager ERP — ${kAUD(145000)} uninvoiced, Phase 2 accepted by TechCore 47 days ago. No invoice raised.
4. AR: Eclipse Risk & Compliance — INV-1847, ${kAUD(95000)}, 61 days outstanding, Nexus Property Group. Needs escalation.
5. BUDGET: Nebula Cloud Migration (~10% over fee budget) and Genesis CRM (early burn running hot, 6 weeks in).

Staff
${staffLines}

Rule: only reference figures and names from this context. Never invent data not listed here.
---`.trim();
}

module.exports = { TENANT_CONFIG, buildTenantContextBlock };
