'use strict';

const {
  SOURCE_TYPES,
  AUTHORITIES,
  CONFIDENCE_LEVELS,
  REQUIRED_CARD_FIELDS,
  REQUIRED_SOURCE_FIELDS,
  validateKnowledgeCard,
  assertKnowledgeCard,
  validateKnowledgeSource,
  assertKnowledgeSource,
  validateKnowledgeRegistry,
} = require('./knowledgeSourceSchema');
const {
  KNOWLEDGE_REGISTRY_VERSION,
  getKnowledgeSources,
  getAllKnowledgeCards,
  getKnowledgeRegistry,
  assertKnowledgeRegistry,
} = require('./knowledgeRegistry');
const {
  DEFAULT_LIMIT,
  selectRelevantKnowledge,
  scoreKnowledgeCard,
} = require('./knowledgeSelector');

module.exports = {
  SOURCE_TYPES,
  AUTHORITIES,
  CONFIDENCE_LEVELS,
  REQUIRED_CARD_FIELDS,
  REQUIRED_SOURCE_FIELDS,
  validateKnowledgeCard,
  assertKnowledgeCard,
  validateKnowledgeSource,
  assertKnowledgeSource,
  validateKnowledgeRegistry,
  KNOWLEDGE_REGISTRY_VERSION,
  getKnowledgeSources,
  getAllKnowledgeCards,
  getKnowledgeRegistry,
  assertKnowledgeRegistry,
  DEFAULT_LIMIT,
  selectRelevantKnowledge,
  scoreKnowledgeCard,
};
