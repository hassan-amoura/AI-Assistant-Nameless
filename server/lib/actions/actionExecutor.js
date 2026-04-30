'use strict';

const { getActionDefinition } = require('./actionRegistry');
const { normalizeActionIntent } = require('./actionSchema');
const { evaluateActionPolicy } = require('./actionPolicy');
const disabledProjectworksActionProvider = require('./providers/disabledProjectworksActionProvider');

function resolveAction(actionIntent) {
  const intent = normalizeActionIntent(actionIntent);
  const action = getActionDefinition(intent.id);
  if (!action) {
    const err = new Error(`Unknown action '${intent.id}'`);
    err.code = 'UNKNOWN_ACTION';
    throw err;
  }
  return { intent, action };
}

function buildPreview(action, intent) {
  return {
    actionId: action.id,
    label: action.label,
    description: action.description,
    category: action.category,
    riskLevel: action.riskLevel,
    requiresConfirmation: action.requiresConfirmation,
    financial: action.financial,
    destructive: action.destructive,
    capabilityRequired: action.capabilityRequired,
    tenantId: intent.tenantId || null,
    inputs: intent.inputs,
  };
}

function previewAction(actionIntent, context = {}) {
  const { intent, action } = resolveAction(actionIntent);
  const policy = evaluateActionPolicy({
    action,
    user: context.user,
    tenantSnapshot: context.tenantSnapshot,
    capabilities: context.capabilities,
    assistantAutonomy: context.assistantAutonomy,
    confirmed: !!context.confirmed,
    inputs: intent.inputs,
    tenantId: intent.tenantId,
  });

  return {
    ok: true,
    action,
    intent,
    preview: buildPreview(action, intent),
    policy,
  };
}

function executeAction(actionIntent, context = {}) {
  const preview = previewAction(actionIntent, context);
  if (!preview.policy.canExecute) {
    const firstReason = preview.policy.reasons[0] || {};
    return {
      ok: false,
      code: firstReason.code || 'ACTION_NOT_ALLOWED',
      userMessage: firstReason.message || 'This action is not available.',
      preview: preview.preview,
      policy: preview.policy,
    };
  }

  const provider = context.provider || disabledProjectworksActionProvider;
  const providerResult = provider.executeAction(preview.intent, {
    ...context,
    action: preview.action,
    preview: preview.preview,
    policy: preview.policy,
  });

  if (!providerResult || providerResult.ok !== true) {
    return {
      ok: false,
      code: (providerResult && providerResult.code) || 'ACTION_PROVIDER_FAILED',
      userMessage: (providerResult && providerResult.userMessage) || 'This action could not be completed.',
      preview: preview.preview,
      policy: preview.policy,
    };
  }

  return {
    ok: true,
    code: providerResult.code || 'ACTION_COMPLETED',
    result: providerResult.result || null,
    preview: preview.preview,
    policy: preview.policy,
  };
}

module.exports = {
  previewAction,
  executeAction,
};
