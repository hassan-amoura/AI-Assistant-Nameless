'use strict';

const { createAnthropicProvider } = require('./providers/anthropicProvider');
const { createOpenAIProvider } = require('./providers/openaiProvider');

const DEFAULT_AI_PROVIDER = 'anthropic';
const SUPPORTED_AI_PROVIDERS = Object.freeze(['anthropic', 'openai']);

function normalizeProviderName(value) {
  return String(value || DEFAULT_AI_PROVIDER).trim().toLowerCase() || DEFAULT_AI_PROVIDER;
}

function unsupportedProviderError(providerName) {
  const err = new Error(`Unsupported AI_PROVIDER '${providerName}'. Supported providers: ${SUPPORTED_AI_PROVIDERS.join(', ')}.`);
  err.code = 'UNSUPPORTED_AI_PROVIDER';
  err.provider = providerName;
  return err;
}

function getModelProvider({ providerName, env = process.env } = {}) {
  const selected = normalizeProviderName(providerName || env.AI_PROVIDER || DEFAULT_AI_PROVIDER);

  if (selected === 'anthropic') return createAnthropicProvider({ env });
  if (selected === 'openai') return createOpenAIProvider({ env });

  throw unsupportedProviderError(selected);
}

module.exports = {
  DEFAULT_AI_PROVIDER,
  SUPPORTED_AI_PROVIDERS,
  normalizeProviderName,
  getModelProvider,
};
