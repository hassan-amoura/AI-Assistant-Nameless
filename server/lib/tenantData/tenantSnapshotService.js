'use strict';

const mockTenantProvider = require('./providers/mockTenantProvider');
const {
  normalizeTenantSnapshot,
  assertTenantSnapshot,
} = require('./snapshotSchema');

function resolveProvider(provider) {
  if (provider && typeof provider.getTenantIntelligenceSnapshot === 'function') {
    return provider;
  }
  return mockTenantProvider;
}

function getTenantIntelligenceSnapshot({
  tenantId,
  userId,
  role,
  userContext,
  provider,
} = {}) {
  const resolvedProvider = resolveProvider(provider);
  const raw = resolvedProvider.getTenantIntelligenceSnapshot({
    tenantId,
    userId,
    role,
    userContext,
  });
  const snapshot = normalizeTenantSnapshot(raw);
  return assertTenantSnapshot(snapshot);
}

module.exports = {
  getTenantIntelligenceSnapshot,
};
