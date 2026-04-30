'use strict';

const { getActionDefinition } = require('./actionRegistry');

const REQUIRED_ACTION_FIELDS = [
  'id',
  'label',
  'description',
  'category',
  'requiredInputs',
  'optionalInputs',
  'capabilityRequired',
  'riskLevel',
  'requiresConfirmation',
  'financial',
  'destructive',
  'enabledByDefault',
];

const RISK_LEVELS = new Set(['low', 'medium', 'high']);

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateActionDefinition(action) {
  const errors = [];

  if (!isObject(action)) {
    return { valid: false, errors: ['action must be an object'] };
  }

  for (const field of REQUIRED_ACTION_FIELDS) {
    if (action[field] === undefined || action[field] === null) {
      errors.push(`${field} is required`);
    }
  }

  if (typeof action.id !== 'string' || !action.id.trim()) errors.push('id must be a non-empty string');
  if (typeof action.label !== 'string' || !action.label.trim()) errors.push('label must be a non-empty string');
  if (!Array.isArray(action.requiredInputs)) errors.push('requiredInputs must be an array');
  if (!Array.isArray(action.optionalInputs)) errors.push('optionalInputs must be an array');
  if (!RISK_LEVELS.has(action.riskLevel)) errors.push('riskLevel must be low, medium, or high');
  for (const field of ['requiresConfirmation', 'financial', 'destructive', 'enabledByDefault']) {
    if (typeof action[field] !== 'boolean') errors.push(`${field} must be boolean`);
  }

  const cap = action.capabilityRequired;
  if (!isObject(cap)) {
    errors.push('capabilityRequired must be an object');
  } else {
    for (const field of ['system', 'area', 'key']) {
      if (typeof cap[field] !== 'string' || !cap[field]) {
        errors.push(`capabilityRequired.${field} must be a non-empty string`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function assertActionDefinition(action) {
  const result = validateActionDefinition(action);
  if (!result.valid) {
    const err = new Error(`Invalid action definition: ${result.errors.join('; ')}`);
    err.code = 'INVALID_ACTION_DEFINITION';
    err.errors = result.errors;
    throw err;
  }
  return action;
}

function validateActionIntent(actionIntent) {
  const errors = [];

  if (!isObject(actionIntent)) {
    return { valid: false, errors: ['actionIntent must be an object'] };
  }

  const actionId = actionIntent.id || actionIntent.actionId;
  if (typeof actionId !== 'string' || !actionId.trim()) {
    errors.push('action id is required');
  } else if (!getActionDefinition(actionId)) {
    errors.push(`unknown action '${actionId}'`);
  }

  if ('inputs' in actionIntent && !isObject(actionIntent.inputs)) {
    errors.push('inputs must be an object');
  }

  if ('tenantId' in actionIntent && actionIntent.tenantId != null && typeof actionIntent.tenantId !== 'string') {
    errors.push('tenantId must be a string');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function normalizeActionIntent(actionIntent) {
  const result = validateActionIntent(actionIntent);
  if (!result.valid) {
    const err = new Error(`Invalid action intent: ${result.errors.join('; ')}`);
    err.code = 'INVALID_ACTION_INTENT';
    err.errors = result.errors;
    throw err;
  }

  return {
    id: actionIntent.id || actionIntent.actionId,
    tenantId: actionIntent.tenantId || null,
    inputs: isObject(actionIntent.inputs) ? { ...actionIntent.inputs } : {},
    metadata: isObject(actionIntent.metadata) ? { ...actionIntent.metadata } : {},
  };
}

function validateRegisteredActions(actions) {
  const errors = [];
  const seen = new Set();

  for (const action of actions || []) {
    const result = validateActionDefinition(action);
    if (!result.valid) {
      errors.push(`${action && action.id ? action.id : '<unknown>'}: ${result.errors.join('; ')}`);
    }
    if (action && action.id) {
      if (seen.has(action.id)) errors.push(`${action.id}: duplicate action id`);
      seen.add(action.id);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  REQUIRED_ACTION_FIELDS,
  RISK_LEVELS,
  validateActionDefinition,
  assertActionDefinition,
  validateActionIntent,
  normalizeActionIntent,
  validateRegisteredActions,
};
