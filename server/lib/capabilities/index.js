'use strict';

const {
  CAPABILITY_REGISTRY_VERSION,
  PROJECTWORKS_REPORTING_CAPABILITIES,
  PROJECTWORKS_ACTION_CAPABILITIES,
  METABASE_CAPABILITIES,
  INTEGRATION_DEFINITIONS,
  getCapabilityRegistry,
} = require('./capabilityRegistry');
const {
  REQUIRED_RUNTIME_KEYS,
  validateRuntimeCapabilities,
  assertRuntimeCapabilities,
} = require('./capabilitySchema');
const {
  isReportingConfigured,
  checkProjectworksReportingStatus,
  buildRuntimeCapabilities,
  getRuntimeCapabilities,
} = require('./capabilityService');

module.exports = {
  CAPABILITY_REGISTRY_VERSION,
  PROJECTWORKS_REPORTING_CAPABILITIES,
  PROJECTWORKS_ACTION_CAPABILITIES,
  METABASE_CAPABILITIES,
  INTEGRATION_DEFINITIONS,
  getCapabilityRegistry,
  REQUIRED_RUNTIME_KEYS,
  validateRuntimeCapabilities,
  assertRuntimeCapabilities,
  isReportingConfigured,
  checkProjectworksReportingStatus,
  buildRuntimeCapabilities,
  getRuntimeCapabilities,
};
