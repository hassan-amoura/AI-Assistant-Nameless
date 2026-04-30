'use strict';

const REQUIRED_RUNTIME_KEYS = [
  'checkedAt',
  'dataSource',
  'integrations',
  'capabilities',
];

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateRuntimeCapabilities(runtime) {
  const errors = [];

  if (!isObject(runtime)) {
    return { valid: false, errors: ['runtime capabilities must be an object'] };
  }

  for (const key of REQUIRED_RUNTIME_KEYS) {
    if (runtime[key] === undefined || runtime[key] === null) {
      errors.push(`${key} is required`);
    }
  }

  if (!Array.isArray(runtime.integrations)) {
    errors.push('integrations must be an array');
  }

  if (!isObject(runtime.capabilities)) {
    errors.push('capabilities must be an object');
  } else {
    if (!isObject(runtime.capabilities.projectworks)) {
      errors.push('capabilities.projectworks must be an object');
    } else {
      if (!isObject(runtime.capabilities.projectworks.reporting)) {
        errors.push('capabilities.projectworks.reporting must be an object');
      }
      if (!isObject(runtime.capabilities.projectworks.actions)) {
        errors.push('capabilities.projectworks.actions must be an object');
      }
    }
    if (!isObject(runtime.capabilities.metabase)) {
      errors.push('capabilities.metabase must be an object');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function assertRuntimeCapabilities(runtime) {
  const result = validateRuntimeCapabilities(runtime);
  if (!result.valid) {
    const err = new Error(`Invalid runtime capabilities: ${result.errors.join('; ')}`);
    err.code = 'INVALID_RUNTIME_CAPABILITIES';
    err.errors = result.errors;
    throw err;
  }
  return runtime;
}

module.exports = {
  REQUIRED_RUNTIME_KEYS,
  validateRuntimeCapabilities,
  assertRuntimeCapabilities,
};
