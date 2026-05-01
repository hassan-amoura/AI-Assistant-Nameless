'use strict';

const SOURCE_TYPES = Object.freeze([
  'benchmark',
  'methodology',
  'operator_playbook',
  'internal_note',
  'product_policy',
]);

const AUTHORITIES = Object.freeze([
  'external',
  'projectworks',
  'founder',
  'coo',
  'internal',
]);

const CONFIDENCE_LEVELS = Object.freeze([
  'high',
  'medium',
  'low',
]);

const REQUIRED_CARD_FIELDS = Object.freeze([
  'id',
  'sourceId',
  'sourceTitle',
  'sourceType',
  'authority',
  'version',
  'domains',
  'topics',
  'appliesWhen',
  'principle',
  'evidenceSummary',
  'metrics',
  'antiPatterns',
  'recommendedActions',
  'coachingUse',
  'promptUse',
  'confidence',
  'sourceNotes',
]);

const REQUIRED_SOURCE_FIELDS = Object.freeze([
  'id',
  'title',
  'type',
  'authority',
  'version',
  'requiresModel',
  'requiresApi',
  'cards',
]);

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStringArray(value, field, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return;
  }

  for (let i = 0; i < value.length; i++) {
    if (!isNonEmptyString(value[i])) {
      errors.push(`${field}[${i}] must be a non-empty string`);
    }
  }
}

function validateMetric(metric, index, errors) {
  if (!isObject(metric)) {
    errors.push(`metrics[${index}] must be an object`);
    return;
  }
  if (!isNonEmptyString(metric.name)) {
    errors.push(`metrics[${index}].name must be a non-empty string`);
  }
  for (const field of ['value', 'target', 'unit', 'notes']) {
    if (metric[field] !== undefined && metric[field] !== null && typeof metric[field] !== 'string' && typeof metric[field] !== 'number') {
      errors.push(`metrics[${index}].${field} must be a string or number when present`);
    }
  }
}

function validateKnowledgeCard(card) {
  const errors = [];

  if (!isObject(card)) {
    return { valid: false, errors: ['knowledge card must be an object'] };
  }

  for (const field of REQUIRED_CARD_FIELDS) {
    if (card[field] === undefined || card[field] === null) {
      errors.push(`${field} is required`);
    }
  }

  for (const field of [
    'id',
    'sourceId',
    'sourceTitle',
    'sourceType',
    'authority',
    'version',
    'principle',
    'evidenceSummary',
    'coachingUse',
    'promptUse',
    'confidence',
  ]) {
    if (!isNonEmptyString(card[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (isNonEmptyString(card.sourceType) && !SOURCE_TYPES.includes(card.sourceType)) {
    errors.push(`sourceType must be one of: ${SOURCE_TYPES.join(', ')}`);
  }

  if (isNonEmptyString(card.authority) && !AUTHORITIES.includes(card.authority)) {
    errors.push(`authority must be one of: ${AUTHORITIES.join(', ')}`);
  }

  if (isNonEmptyString(card.confidence) && !CONFIDENCE_LEVELS.includes(card.confidence)) {
    errors.push(`confidence must be one of: ${CONFIDENCE_LEVELS.join(', ')}`);
  }

  for (const field of [
    'domains',
    'topics',
    'appliesWhen',
    'antiPatterns',
    'recommendedActions',
    'sourceNotes',
  ]) {
    validateStringArray(card[field], field, errors);
  }

  if (!Array.isArray(card.metrics)) {
    errors.push('metrics must be an array');
  } else {
    for (let i = 0; i < card.metrics.length; i++) {
      validateMetric(card.metrics[i], i, errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function assertKnowledgeCard(card) {
  const result = validateKnowledgeCard(card);
  if (!result.valid) {
    const err = new Error(`Invalid knowledge card: ${result.errors.join('; ')}`);
    err.code = 'INVALID_KNOWLEDGE_CARD';
    err.errors = result.errors;
    throw err;
  }
  return card;
}

function validateKnowledgeSource(source) {
  const errors = [];

  if (!isObject(source)) {
    return { valid: false, errors: ['knowledge source must be an object'] };
  }

  for (const field of REQUIRED_SOURCE_FIELDS) {
    if (source[field] === undefined || source[field] === null) {
      errors.push(`${field} is required`);
    }
  }

  for (const field of ['id', 'title', 'type', 'authority', 'version']) {
    if (!isNonEmptyString(source[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (isNonEmptyString(source.type) && !SOURCE_TYPES.includes(source.type)) {
    errors.push(`type must be one of: ${SOURCE_TYPES.join(', ')}`);
  }

  if (isNonEmptyString(source.authority) && !AUTHORITIES.includes(source.authority)) {
    errors.push(`authority must be one of: ${AUTHORITIES.join(', ')}`);
  }

  for (const field of ['requiresModel', 'requiresApi']) {
    if (typeof source[field] !== 'boolean') {
      errors.push(`${field} must be boolean`);
    }
  }

  if (!Array.isArray(source.cards)) {
    errors.push('cards must be an array');
  } else {
    for (const card of source.cards) {
      const result = validateKnowledgeCard(card);
      if (!result.valid) {
        errors.push(`${card && card.id ? card.id : '<unknown card>'}: ${result.errors.join('; ')}`);
      }
      if (card && card.sourceId !== source.id) errors.push(`${card.id}: sourceId must match source.id`);
      if (card && card.sourceTitle !== source.title) errors.push(`${card.id}: sourceTitle must match source.title`);
      if (card && card.sourceType !== source.type) errors.push(`${card.id}: sourceType must match source.type`);
      if (card && card.authority !== source.authority) errors.push(`${card.id}: authority must match source.authority`);
      if (card && card.version !== source.version) errors.push(`${card.id}: version must match source.version`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function assertKnowledgeSource(source) {
  const result = validateKnowledgeSource(source);
  if (!result.valid) {
    const err = new Error(`Invalid knowledge source: ${result.errors.join('; ')}`);
    err.code = 'INVALID_KNOWLEDGE_SOURCE';
    err.errors = result.errors;
    throw err;
  }
  return source;
}

function validateKnowledgeRegistry(registry) {
  const errors = [];
  const cardIds = new Set();
  const sourceIds = new Set();

  if (!isObject(registry)) {
    return { valid: false, errors: ['knowledge registry must be an object'] };
  }

  if (!isNonEmptyString(registry.version)) errors.push('version must be a non-empty string');
  if (!Array.isArray(registry.sources)) errors.push('sources must be an array');
  if (!Array.isArray(registry.cards)) errors.push('cards must be an array');

  if (Array.isArray(registry.sources)) {
    for (const source of registry.sources) {
      const result = validateKnowledgeSource(source);
      if (!result.valid) {
        errors.push(`${source && source.id ? source.id : '<unknown source>'}: ${result.errors.join('; ')}`);
      }
      if (source && source.id) {
        if (sourceIds.has(source.id)) errors.push(`${source.id}: duplicate source id`);
        sourceIds.add(source.id);
      }
    }
  }

  if (Array.isArray(registry.cards)) {
    for (const card of registry.cards) {
      const result = validateKnowledgeCard(card);
      if (!result.valid) {
        errors.push(`${card && card.id ? card.id : '<unknown card>'}: ${result.errors.join('; ')}`);
      }
      if (card && card.id) {
        if (cardIds.has(card.id)) errors.push(`${card.id}: duplicate card id`);
        cardIds.add(card.id);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

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
};
