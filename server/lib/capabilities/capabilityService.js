'use strict';

const {
  CAPABILITY_REGISTRY_VERSION,
  PROJECTWORKS_ACTION_CAPABILITIES,
  METABASE_CAPABILITIES,
  getCapabilityRegistry,
} = require('./capabilityRegistry');
const { assertRuntimeCapabilities } = require('./capabilitySchema');

function isReportingConfigured(env) {
  return !!(env.DB_HOST && env.DB_USER && env.DB_PASSWORD && env.DB_NAME);
}

function reportingActionLabel(status) {
  if (status === 'connected') return 'View';
  if (status === 'disconnected') return 'Reconnect';
  return 'Configure';
}

async function checkProjectworksReportingStatus(env = process.env) {
  if (!isReportingConfigured(env)) {
    return { status: 'not_configured' };
  }

  let sql = null;
  try {
    sql = require('mssql');
  } catch {
    return { status: 'disconnected' };
  }

  let pool;
  try {
    pool = await sql.connect({
      server: env.DB_HOST,
      port: parseInt(env.DB_PORT || '1433', 10),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      options: {
        encrypt: true,
        trustServerCertificate: env.DB_TRUST_CERT === 'true',
        connectTimeout: 5000,
        requestTimeout: 5000,
      },
    });
    await pool.request().query('SELECT 1');
    return { status: 'connected' };
  } catch {
    return { status: 'disconnected' };
  } finally {
    if (pool) pool.close().catch(() => {});
  }
}

function integrationById(registry, id) {
  return registry.integrations.find(item => item.id === id) || null;
}

function buildRuntimeCapabilities({ checkedAt, reportingStatus } = {}) {
  const registry = getCapabilityRegistry();
  const now = checkedAt || new Date().toISOString();
  const pwStatus = reportingStatus || 'not_configured';
  const reportingEnabled = pwStatus === 'connected';

  const reportingCapabilities = {
    readSchema: reportingEnabled,
    runSql: false,
    readReportingData: false,
  };
  const actionCapabilities = { ...PROJECTWORKS_ACTION_CAPABILITIES };
  const metabaseCapabilities = { ...METABASE_CAPABILITIES };

  const reportingDef = integrationById(registry, 'projectworks_reporting');
  const actionsDef = integrationById(registry, 'projectworks_actions');
  const metabaseDef = integrationById(registry, 'metabase');

  const integrations = [
    {
      ...reportingDef,
      status: pwStatus,
      capabilities: {
        ...reportingCapabilities,
        writeActions: false,
      },
      lastCheckedAt: now,
      actionLabel: reportingActionLabel(pwStatus),
    },
    {
      ...actionsDef,
      status: 'coming_soon',
      capabilities: {
        ...actionCapabilities,
        writeActions: false,
      },
      lastCheckedAt: null,
      actionLabel: 'Coming soon',
    },
    {
      ...metabaseDef,
      status: 'coming_soon',
      capabilities: {
        ...metabaseCapabilities,
        publishQuestions: false,
        publishDashboards: false,
      },
      lastCheckedAt: null,
      actionLabel: 'Coming soon',
    },
  ];

  return assertRuntimeCapabilities({
    checkedAt: now,
    dataSource: 'capabilityRegistry',
    registryVersion: CAPABILITY_REGISTRY_VERSION,
    integrations,
    capabilities: {
      projectworks: {
        reporting: reportingCapabilities,
        actions: actionCapabilities,
      },
      metabase: metabaseCapabilities,
    },
  });
}

async function getRuntimeCapabilities({ env = process.env } = {}) {
  const checkedAt = new Date().toISOString();
  const reporting = await checkProjectworksReportingStatus(env);
  return buildRuntimeCapabilities({
    checkedAt,
    reportingStatus: reporting.status,
  });
}

module.exports = {
  isReportingConfigured,
  checkProjectworksReportingStatus,
  buildRuntimeCapabilities,
  getRuntimeCapabilities,
};
