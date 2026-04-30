'use strict';

const VALID_AUTONOMY_LEVELS = new Set(['notify', 'propose', 'auto']);

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isMissingInput(value) {
  return value === undefined || value === null || value === '';
}

function getCapabilityValue(capabilities, capabilityRequired) {
  if (!isObject(capabilities) || !isObject(capabilityRequired)) return false;
  const { system, area, key } = capabilityRequired;
  return !!(
    capabilities[system] &&
    capabilities[system][area] &&
    capabilities[system][area][key] === true
  );
}

function reason(code, message) {
  return { code, message };
}

function getTenantId(tenantSnapshot) {
  if (!isObject(tenantSnapshot) || !isObject(tenantSnapshot.tenant)) return null;
  return tenantSnapshot.tenant.id || null;
}

function evaluateActionPolicy({
  action,
  user,
  tenantSnapshot,
  capabilities,
  assistantAutonomy,
  confirmed,
  inputs,
  tenantId,
} = {}) {
  const autonomy = VALID_AUTONOMY_LEVELS.has(assistantAutonomy)
    ? assistantAutonomy
    : 'propose';
  const providedInputs = isObject(inputs) ? inputs : {};
  const reasons = [];
  const missingInputs = [];

  if (!isObject(action)) {
    reasons.push(reason('INVALID_ACTION', 'The requested action is not registered.'));
  }

  for (const field of (action && action.requiredInputs) || []) {
    if (isMissingInput(providedInputs[field])) missingInputs.push(field);
  }
  if (missingInputs.length) {
    reasons.push(reason('MISSING_REQUIRED_INPUT', `Missing required input: ${missingInputs.join(', ')}`));
  }

  const snapshotTenantId = getTenantId(tenantSnapshot);
  if (tenantId && snapshotTenantId && tenantId !== snapshotTenantId) {
    reasons.push(reason('TENANT_MISMATCH', 'Action tenant does not match the current tenant context.'));
  }

  const capabilityAvailable = getCapabilityValue(capabilities, action && action.capabilityRequired);
  if (!capabilityAvailable) {
    reasons.push(reason('CAPABILITY_UNAVAILABLE', 'The required action capability is not available.'));
  }

  if (autonomy === 'notify') {
    reasons.push(reason('AUTONOMY_NOTIFY_ONLY', 'Notify-only mode does not allow action execution.'));
  }

  const financial = !!(action && action.financial);
  const destructive = !!(action && action.destructive);
  const highOrMediumRisk = !!(action && action.riskLevel !== 'low');
  const actionRequiresConfirmation = !!(action && action.requiresConfirmation);
  const confirmationRequired = autonomy === 'propose' ||
    financial ||
    destructive ||
    actionRequiresConfirmation;

  if (autonomy === 'auto' && (highOrMediumRisk || financial || destructive)) {
    reasons.push(reason('AUTO_RESTRICTED', 'Auto mode can only execute low-risk, non-financial, non-destructive actions.'));
  }

  if (confirmationRequired && !confirmed && autonomy !== 'notify') {
    reasons.push(reason('CONFIRMATION_REQUIRED', 'This action requires confirmation before execution.'));
  }

  return {
    canExecute: reasons.length === 0,
    capabilityAvailable,
    autonomy,
    confirmed: !!confirmed,
    requiresConfirmation: confirmationRequired,
    missingInputs,
    reasons,
    userId: user && user.id ? user.id : null,
    tenantId: tenantId || snapshotTenantId || null,
  };
}

module.exports = {
  VALID_AUTONOMY_LEVELS,
  evaluateActionPolicy,
  getCapabilityValue,
};
