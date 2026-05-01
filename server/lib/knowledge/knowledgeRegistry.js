'use strict';

const { source: spiBenchmark2025 } = require('./sources/spiBenchmark2025');
const { source: projectworksMethodOperationsV8 } = require('./sources/projectworksMethodOperationsV8');
const { source: projectworksMethodGrowthV8 } = require('./sources/projectworksMethodGrowthV8');
const { source: fiftyMillionConsultingFirmFA3 } = require('./sources/fiftyMillionConsultingFirmFA3');
const { validateKnowledgeRegistry } = require('./knowledgeSourceSchema');

const KNOWLEDGE_REGISTRY_VERSION = 'knowledge-registry.v1';

const SOURCES = Object.freeze([
  spiBenchmark2025,
  projectworksMethodOperationsV8,
  projectworksMethodGrowthV8,
  fiftyMillionConsultingFirmFA3,
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getKnowledgeSources() {
  return clone(SOURCES);
}

function getAllKnowledgeCards() {
  return clone(SOURCES.flatMap(source => source.cards));
}

function getKnowledgeRegistry() {
  return {
    version: KNOWLEDGE_REGISTRY_VERSION,
    sources: getKnowledgeSources(),
    cards: getAllKnowledgeCards(),
  };
}

function assertKnowledgeRegistry() {
  const registry = getKnowledgeRegistry();
  const validation = validateKnowledgeRegistry(registry);
  if (!validation.valid) {
    const err = new Error(`Invalid knowledge registry: ${validation.errors.join('; ')}`);
    err.code = 'INVALID_KNOWLEDGE_REGISTRY';
    err.errors = validation.errors;
    throw err;
  }
  return registry;
}

module.exports = {
  KNOWLEDGE_REGISTRY_VERSION,
  getKnowledgeSources,
  getAllKnowledgeCards,
  getKnowledgeRegistry,
  assertKnowledgeRegistry,
};
