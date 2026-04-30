'use strict';

const { getTenantIntelligenceSnapshot } = require('./tenantSnapshotService');
const {
  SCHEMA_VERSION,
  TOP_LEVEL_KEYS,
  normalizeTenantSnapshot,
  validateTenantSnapshot,
  assertTenantSnapshot,
} = require('./snapshotSchema');
const mockTenantProvider = require('./providers/mockTenantProvider');

module.exports = {
  getTenantIntelligenceSnapshot,
  SCHEMA_VERSION,
  TOP_LEVEL_KEYS,
  normalizeTenantSnapshot,
  validateTenantSnapshot,
  assertTenantSnapshot,
  providers: {
    mock: mockTenantProvider,
  },
};
