'use strict';

const SCHEMA_VERSION = 'tenant-intelligence-snapshot.v1';

const TOP_LEVEL_KEYS = [
  'tenant',
  'user',
  'maturity',
  'firmStage',
  'financials',
  'projects',
  'people',
  'pipelineOrBookings',
  'methodContext',
  'metadata',
];

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneObject(value) {
  return isObject(value) ? { ...value } : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTenantSnapshot(snapshot) {
  const input = isObject(snapshot) ? snapshot : {};

  return {
    tenant: {
      id: null,
      orgName: null,
      industry: null,
      currency: null,
      timezone: null,
      source: null,
      ...cloneObject(input.tenant),
    },
    user: {
      id: null,
      email: null,
      displayName: null,
      role: null,
      permissions: [],
      coachingStyle: null,
      firmGoal: null,
      assistantAutonomy: null,
      ...cloneObject(input.user),
      permissions: asArray(input.user && input.user.permissions),
    },
    maturity: {
      operationsLevel: null,
      operationsLevelName: null,
      growthLevel: null,
      growthLevelName: null,
      ...cloneObject(input.maturity),
    },
    firmStage: {
      revenueBand: null,
      headcountBand: null,
      stageLabel: null,
      likelyScalingWall: null,
      ...cloneObject(input.firmStage),
    },
    financials: {
      overdueInvoices: [],
      uninvoicedWip: 0,
      revenue: {},
      margin: {},
      arAging: {},
      ...cloneObject(input.financials),
      overdueInvoices: asArray(input.financials && input.financials.overdueInvoices),
      revenue: cloneObject(input.financials && input.financials.revenue),
      margin: cloneObject(input.financials && input.financials.margin),
      arAging: cloneObject(input.financials && input.financials.arAging),
    },
    projects: {
      atRisk: [],
      overBudget: [],
      underServiced: [],
      lowMargin: [],
      ...cloneObject(input.projects),
      atRisk: asArray(input.projects && input.projects.atRisk),
      overBudget: asArray(input.projects && input.projects.overBudget),
      underServiced: asArray(input.projects && input.projects.underServiced),
      lowMargin: asArray(input.projects && input.projects.lowMargin),
    },
    people: {
      missingTimesheets: [],
      utilisation: {},
      lowUtilisationStaff: [],
      capacityGaps: [],
      ...cloneObject(input.people),
      missingTimesheets: asArray(input.people && input.people.missingTimesheets),
      utilisation: cloneObject(input.people && input.people.utilisation),
      lowUtilisationStaff: asArray(input.people && input.people.lowUtilisationStaff),
      capacityGaps: asArray(input.people && input.people.capacityGaps),
    },
    pipelineOrBookings: {
      currentWeeks: null,
      targetWeeks: null,
      gaps: [],
      bookToBill: null,
      revenueConfidence: null,
      ...cloneObject(input.pipelineOrBookings),
      gaps: asArray(input.pipelineOrBookings && input.pipelineOrBookings.gaps),
    },
    methodContext: {
      operationsTrackLevel: null,
      operationsTrackName: null,
      growthTrackLevel: null,
      growthTrackName: null,
      nextOperatingHabit: null,
      nextGrowthHabit: null,
      benchmarkTargets: {},
      ...cloneObject(input.methodContext),
      benchmarkTargets: cloneObject(input.methodContext && input.methodContext.benchmarkTargets),
    },
    metadata: {
      generatedAt: null,
      provider: null,
      schemaVersion: SCHEMA_VERSION,
      dataSource: null,
      ...cloneObject(input.metadata),
    },
  };
}

function validateTenantSnapshot(snapshot) {
  const errors = [];

  if (!isObject(snapshot)) {
    return { valid: false, errors: ['snapshot must be an object'] };
  }

  for (const key of TOP_LEVEL_KEYS) {
    if (!isObject(snapshot[key])) errors.push(`${key} must be an object`);
  }

  if (!snapshot.tenant || !snapshot.tenant.id) errors.push('tenant.id is required');
  if (!snapshot.tenant || !snapshot.tenant.orgName) errors.push('tenant.orgName is required');
  if (!snapshot.user || !snapshot.user.id) errors.push('user.id is required');
  if (!snapshot.user || !snapshot.user.role) errors.push('user.role is required');
  if (!snapshot.metadata || !snapshot.metadata.schemaVersion) errors.push('metadata.schemaVersion is required');
  if (!snapshot.metadata || !snapshot.metadata.generatedAt) errors.push('metadata.generatedAt is required');
  if (!snapshot.metadata || !snapshot.metadata.provider) errors.push('metadata.provider is required');

  return {
    valid: errors.length === 0,
    errors,
  };
}

function assertTenantSnapshot(snapshot) {
  const result = validateTenantSnapshot(snapshot);
  if (!result.valid) {
    const err = new Error(`Invalid tenant intelligence snapshot: ${result.errors.join('; ')}`);
    err.code = 'INVALID_TENANT_SNAPSHOT';
    err.errors = result.errors;
    throw err;
  }
  return snapshot;
}

module.exports = {
  SCHEMA_VERSION,
  TOP_LEVEL_KEYS,
  normalizeTenantSnapshot,
  validateTenantSnapshot,
  assertTenantSnapshot,
};
