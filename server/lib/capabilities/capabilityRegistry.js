'use strict';

const CAPABILITY_REGISTRY_VERSION = 'capability-registry.v1';

const PROJECTWORKS_REPORTING_CAPABILITIES = Object.freeze({
  readSchema: false,
  runSql: false,
  readReportingData: false,
});

const PROJECTWORKS_ACTION_CAPABILITIES = Object.freeze({
  createProject: false,
  updateProject: false,
  createBudgetLine: false,
  updateBudget: false,
  createTimecode: false,
  createResourceBooking: false,
  createDraftInvoice: false,
  flagReadyToInvoice: false,
  createTask: false,
  updateTask: false,
});

const METABASE_CAPABILITIES = Object.freeze({
  publishQuestion: false,
  publishDashboard: false,
});

const INTEGRATION_DEFINITIONS = Object.freeze([
  {
    id: 'projectworks_reporting',
    label: 'Projectworks Reporting Data',
    description: 'Used for schema-aware reporting and live data lookup.',
    status: 'not_configured',
    capabilities: PROJECTWORKS_REPORTING_CAPABILITIES,
    actionLabel: 'Configure',
  },
  {
    id: 'projectworks_actions',
    label: 'Projectworks Actions',
    description: 'Will allow approved create/update actions in Projectworks.',
    status: 'coming_soon',
    capabilities: PROJECTWORKS_ACTION_CAPABILITIES,
    actionLabel: 'Coming soon',
  },
  {
    id: 'metabase',
    label: 'Metabase',
    description: 'Will support publishing reports directly to Metabase.',
    status: 'coming_soon',
    capabilities: METABASE_CAPABILITIES,
    actionLabel: 'Coming soon',
  },
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getCapabilityRegistry() {
  return {
    version: CAPABILITY_REGISTRY_VERSION,
    integrations: clone(INTEGRATION_DEFINITIONS),
  };
}

module.exports = {
  CAPABILITY_REGISTRY_VERSION,
  PROJECTWORKS_REPORTING_CAPABILITIES,
  PROJECTWORKS_ACTION_CAPABILITIES,
  METABASE_CAPABILITIES,
  INTEGRATION_DEFINITIONS,
  getCapabilityRegistry,
};
