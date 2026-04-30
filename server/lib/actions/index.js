'use strict';

const {
  ACTION_REGISTRY_VERSION,
  ACTION_DEFINITIONS,
  getRegisteredActions,
  getActionDefinition,
} = require('./actionRegistry');
const {
  REQUIRED_ACTION_FIELDS,
  RISK_LEVELS,
  validateActionDefinition,
  assertActionDefinition,
  validateActionIntent,
  normalizeActionIntent,
  validateRegisteredActions,
} = require('./actionSchema');
const {
  VALID_AUTONOMY_LEVELS,
  evaluateActionPolicy,
  getCapabilityValue,
} = require('./actionPolicy');
const {
  previewAction,
  executeAction,
} = require('./actionExecutor');
const disabledProjectworksActionProvider = require('./providers/disabledProjectworksActionProvider');

module.exports = {
  ACTION_REGISTRY_VERSION,
  ACTION_DEFINITIONS,
  getRegisteredActions,
  getActionDefinition,
  REQUIRED_ACTION_FIELDS,
  RISK_LEVELS,
  validateActionDefinition,
  assertActionDefinition,
  validateActionIntent,
  normalizeActionIntent,
  validateRegisteredActions,
  VALID_AUTONOMY_LEVELS,
  evaluateActionPolicy,
  getCapabilityValue,
  previewAction,
  executeAction,
  providers: {
    disabledProjectworksActionProvider,
  },
};
