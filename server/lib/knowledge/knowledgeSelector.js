'use strict';

const { getAllKnowledgeCards } = require('./knowledgeRegistry');

const DEFAULT_LIMIT = 5;

const ROLE_HINTS = Object.freeze({
  project_manager: ['operations', 'delivery', 'service_execution', 'resourcing', 'utilisation', 'utilization', 'capacity'],
  finance: ['finance', 'profitability', 'margin', 'invoice', 'accounts_receivable', 'ar', 'cash', 'wip'],
  director: ['leadership', 'operations', 'growth', 'finance', 'margin', 'revenue_confidence'],
  time_expense: ['timesheets', 'admin', 'lean_admin'],
});

const SIGNAL_HINTS = Object.freeze([
  {
    tags: ['utilisation', 'utilization', 'capacity', 'talent', 'service_execution', 'benchmark_gap'],
    patterns: [/utili[sz]ation/i, /\bbench\b/i, /capacity/i, /billable/i, /low util/i],
  },
  {
    tags: ['pipeline', 'pipeline_gap', 'growth', 'revenue_confidence', 'book_to_bill', 'forward_booking'],
    patterns: [/pipeline/i, /forward booking/i, /book[- ]?to[- ]?bill/i, /revenue confidence/i, /forecast/i],
  },
  {
    tags: ['accounts_receivable', 'ar', 'invoice', 'cash', 'finance', 'wip', 'profitability'],
    patterns: [/overdue/i, /\bar\b/i, /accounts receivable/i, /invoice/i, /cash/i, /wip/i, /uninvoiced/i],
  },
  {
    tags: ['project_overrun', 'budget_overrun', 'burn_rate', 'project_margin', 'delivery_margins', 'project_health'],
    patterns: [/over budget/i, /budget/i, /burn/i, /project margin/i, /project health/i, /overrun/i],
  },
  {
    tags: ['founder_bottleneck', 'leadership_team', 'delegation', 'team_selling'],
    patterns: [/founder/i, /bottleneck/i, /delegat/i, /leadership team/i, /team selling/i],
  },
]);

function normalizeText(value) {
  return String(value == null ? '' : value).toLowerCase();
}

function tokenize(value) {
  const text = normalizeText(value).replace(/\$/g, '').replace(/\+/g, 'plus');
  const tokens = text.match(/[a-z0-9]+/g) || [];
  const out = new Set(tokens);
  if (/5\s*m\s*50\s*m|5m\s*50m|5m-50m|5-50m/.test(text)) out.add('5-50m');
  if (/0\s*m\s*5\s*m|0m\s*5m|0m-5m|0-5m/.test(text)) out.add('0-5m');
  if (/50\s*m|50m/.test(text)) out.add('50m+');
  return out;
}

function addTokens(target, value) {
  for (const token of tokenize(value)) target.add(token);
}

function flattenText(value, depth) {
  if (value === null || value === undefined || depth > 4) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(item => flattenText(item, depth + 1)).join(' ');
  }
  if (typeof value === 'object') {
    return Object.keys(value)
      .map(key => `${key} ${flattenText(value[key], depth + 1)}`)
      .join(' ');
  }
  return '';
}

function addSignalHints(tokens, contextText) {
  for (const hint of SIGNAL_HINTS) {
    if (hint.patterns.some(pattern => pattern.test(contextText))) {
      for (const tag of hint.tags) addTokens(tokens, tag);
    }
  }
}

function addRoleHints(tokens, userRole) {
  const hints = ROLE_HINTS[userRole] || [];
  for (const hint of hints) addTokens(tokens, hint);
}

function addSnapshotHints(tokens, tenantSnapshot) {
  const snapshot = tenantSnapshot && typeof tenantSnapshot === 'object' ? tenantSnapshot : {};
  const maturity = snapshot.maturity || {};
  const methodContext = snapshot.methodContext || {};
  const firmStage = snapshot.firmStage || {};

  for (const value of [
    maturity.operationsLevelName,
    maturity.growthLevelName,
    methodContext.operationsTrackName,
    methodContext.growthTrackName,
    firmStage.revenueBand,
    firmStage.headcountBand,
    firmStage.stageLabel,
    firmStage.likelyScalingWall,
  ]) {
    addTokens(tokens, value);
  }

  if (maturity.operationsLevel !== undefined && maturity.operationsLevel !== null) {
    addTokens(tokens, `l${maturity.operationsLevel}`);
  }
  if (maturity.growthLevel !== undefined && maturity.growthLevel !== null) {
    addTokens(tokens, `l${maturity.growthLevel}`);
  }
}

function buildContext({ tenantSnapshot, insight, userMessage, userRole }) {
  const textParts = [
    userMessage || '',
    userRole || '',
    flattenText(insight, 0),
    flattenText(tenantSnapshot, 0),
  ];
  const contextText = normalizeText(textParts.join(' '));
  const tokens = new Set();

  addTokens(tokens, contextText);
  addRoleHints(tokens, userRole);
  addSnapshotHints(tokens, tenantSnapshot);
  addSignalHints(tokens, contextText);

  return { contextText, tokens };
}

function cardTagTokens(card) {
  const tags = new Set();
  for (const value of [
    card.sourceType,
    card.authority,
    card.sourceTitle,
    ...(card.domains || []),
    ...(card.topics || []),
    ...(card.appliesWhen || []),
    ...((card.metrics || []).map(metric => metric.name)),
  ]) {
    addTokens(tags, value);
  }
  return tags;
}

function phraseMatchScore(values, contextText, points) {
  let score = 0;
  const seen = new Set();
  for (const value of values || []) {
    const normalized = normalizeText(value).replace(/[_-]+/g, ' ').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (contextText.includes(normalized)) score += points;
  }
  return score;
}

function scoreKnowledgeCard(card, context) {
  const cardTokens = cardTagTokens(card);
  let score = 0;

  for (const token of context.tokens) {
    if (cardTokens.has(token)) score += 2;
  }

  score += phraseMatchScore(card.topics, context.contextText, 8);
  score += phraseMatchScore(card.domains, context.contextText, 5);
  score += phraseMatchScore(card.appliesWhen, context.contextText, 6);

  if (card.confidence === 'high') score += 1;
  if (card.authority === 'projectworks') score += 1;
  if (card.sourceType === 'benchmark' && context.tokens.has('benchmark')) score += 3;
  if (card.sourceType === 'operator_playbook' && (context.tokens.has('founder') || context.tokens.has('scaling'))) score += 3;

  return score;
}

function normalizeLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.max(1, Math.floor(n));
}

function selectRelevantKnowledge({
  tenantSnapshot,
  insight,
  userMessage,
  userRole,
  limit,
} = {}) {
  const max = normalizeLimit(limit || DEFAULT_LIMIT);
  const context = buildContext({ tenantSnapshot, insight, userMessage, userRole });
  const cards = getAllKnowledgeCards();

  return cards
    .map((card, index) => ({
      card,
      index,
      score: scoreKnowledgeCard(card, context),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .slice(0, max)
    .map(item => item.card);
}

module.exports = {
  DEFAULT_LIMIT,
  selectRelevantKnowledge,
  scoreKnowledgeCard,
};
