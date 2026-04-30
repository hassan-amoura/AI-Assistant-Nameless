'use strict';

function providerError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function resolveApiKey(env) {
  return env.OPENAI_API_KEY || '';
}

function unavailable() {
  throw providerError(
    'MODEL_PROVIDER_NOT_IMPLEMENTED',
    'OpenAI provider is scaffolded but not enabled for runtime calls yet.',
  );
}

function assertConfigured(env) {
  if (!resolveApiKey(env)) {
    throw providerError(
      'MODEL_PROVIDER_NOT_CONFIGURED',
      'OPENAI_API_KEY is required when AI_PROVIDER=openai.',
    );
  }
}

function createOpenAIProvider({ env = process.env } = {}) {
  return {
    id: 'openai',
    name: 'OpenAI',
    isConfigured() {
      return !!resolveApiKey(env);
    },
    async generateText() {
      assertConfigured(env);
      return unavailable();
    },
    async generateJson() {
      assertConfigured(env);
      return unavailable();
    },
    async streamText() {
      assertConfigured(env);
      return unavailable();
    },
  };
}

module.exports = {
  createOpenAIProvider,
};
