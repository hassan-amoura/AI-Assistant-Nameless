'use strict';

// Methodology layer integration test — no framework, just node.
// Run: npm run test:methodology

const path = require('path');
const fs   = require('fs');

let passed = 0;
let failed = 0;
const failures = [];

function record(category, ok, passMsg, failMsg) {
  if (ok) {
    console.log(`  ✓ ${category}: ${passMsg}`);
    passed++;
  } else {
    console.log(`  ✗ ${category}: ${failMsg}`);
    failed++;
    failures.push(`${category}: ${failMsg}`);
  }
}

// ── 1. Knowledge base ─────────────────────────────────────────────────────
console.log('\n[1] KNOWLEDGE BASE LOADS');
try {
  const { operationsTrack, growthTrack } = require('../server/lib/methodology/knowledgeBase');

  record('KNOWLEDGE BASE',
    Array.isArray(operationsTrack) && operationsTrack.length === 5,
    `operationsTrack has 5 levels`,
    `expected operationsTrack.length=5, got ${operationsTrack && operationsTrack.length}`);
  record('KNOWLEDGE BASE',
    Array.isArray(growthTrack) && growthTrack.length === 5,
    `growthTrack has 5 levels`,
    `expected growthTrack.length=5, got ${growthTrack && growthTrack.length}`);

  const required = ['id', 'name', 'goal', 'indicators', 'habits'];
  function checkLevels(track, label) {
    if (!Array.isArray(track)) {
      record('KNOWLEDGE BASE', false, '', `${label} track is not an array`);
      return;
    }
    let bad = null;
    for (const lvl of track) {
      for (const prop of required) {
        if (!(prop in lvl)) { bad = `${lvl.id || '?'} missing '${prop}'`; break; }
      }
      if (bad) break;
    }
    record('KNOWLEDGE BASE',
      bad === null,
      `${label}: every level has id/name/goal/indicators/habits`,
      `${label}: ${bad}`);
  }
  checkLevels(operationsTrack, 'ops');
  checkLevels(growthTrack, 'growth');
} catch (e) {
  record('KNOWLEDGE BASE', false, '', `module load failed: ${e.message}`);
}

// ── 2. Mock data per role ─────────────────────────────────────────────────
console.log('\n[2] MOCK DATA LOADS FOR ALL ROLES');
try {
  const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');
  for (const role of ['project_manager', 'time_expense', 'finance', 'director']) {
    let data = null;
    let err = null;
    try { data = getMockTenantData('test-user', role); } catch (e) { err = e; }
    const ok = !err && data && typeof data === 'object'
      && 'tenantId' in data
      && 'billableHeadcount' in data
      && 'utilisationRate' in data;
    record('MOCK DATA', ok,
      `${role} returns tenant data with tenantId/billableHeadcount/utilisationRate`,
      err
        ? `${role} threw: ${err.message}`
        : `${role} missing required keys (got ${data ? Object.keys(data).slice(0, 5).join(',') + '…' : 'null'})`);
  }
} catch (e) {
  record('MOCK DATA', false, '', `module load failed: ${e.message}`);
}

// ── 2b. Tenant intelligence snapshot contract ─────────────────────────────
console.log('\n[2b] TENANT INTELLIGENCE SNAPSHOT CONTRACT');
try {
  const {
    getTenantIntelligenceSnapshot,
    validateTenantSnapshot,
    SCHEMA_VERSION,
    TOP_LEVEL_KEYS,
  } = require('../server/lib/tenantData');
  const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');

  const legacy = getMockTenantData('test-user', 'project_manager');
  const snapshot = getTenantIntelligenceSnapshot({
    tenantId: 'demo',
    userId: 'test-user',
    role: 'project_manager',
    userContext: {
      email: 'test@example.com',
      displayName: 'Test User',
      coachingStyle: 'direct',
      firmGoal: 'top',
      assistantAutonomy: 'propose',
    },
  });
  const validation = validateTenantSnapshot(snapshot);

  record('SNAPSHOT',
    validation.valid,
    'snapshot validates',
    `snapshot validation failed: ${validation.errors.join('; ')}`);

  let missingTopLevel = null;
  for (const key of TOP_LEVEL_KEYS) {
    if (!snapshot[key] || typeof snapshot[key] !== 'object' || Array.isArray(snapshot[key])) {
      missingTopLevel = key;
      break;
    }
  }
  record('SNAPSHOT',
    missingTopLevel === null,
    'required top-level keys exist',
    `missing or invalid top-level key '${missingTopLevel}'`);

  record('SNAPSHOT',
    snapshot.metadata.schemaVersion === SCHEMA_VERSION,
    `metadata.schemaVersion === '${SCHEMA_VERSION}'`,
    `expected metadata.schemaVersion='${SCHEMA_VERSION}', got '${snapshot.metadata && snapshot.metadata.schemaVersion}'`);

  record('SNAPSHOT',
    snapshot.methodContext && snapshot.methodContext.operationsTrackName === 'Visibility',
    'methodContext carries current operations track',
    `expected operationsTrackName='Visibility', got '${snapshot.methodContext && snapshot.methodContext.operationsTrackName}'`);

  record('SNAPSHOT',
    snapshot.firmStage && snapshot.firmStage.revenueBand === '$5M-$50M',
    'firmStage exists and classifies mock revenue band',
    `expected revenueBand='$5M-$50M', got '${snapshot.firmStage && snapshot.firmStage.revenueBand}'`);

  record('SNAPSHOT',
    snapshot.tenant.orgName === legacy.orgName &&
      snapshot.financials.uninvoicedWip === legacy.outstandingWIP &&
      snapshot.people.utilisation.currentRate === legacy.utilisationRate &&
      snapshot.tenant.orgName === 'Meridian Consulting' &&
      snapshot.financials.uninvoicedWip === 145000 &&
      snapshot.people.utilisation.currentRate === 0.64,
    'mock provider uses existing mock tenant data',
    'snapshot values do not match legacy mock data');

} catch (e) {
  record('SNAPSHOT', false, '', `failed: ${e.message}`);
}

// ── 2c. Runtime capability registry contract ──────────────────────────────
console.log('\n[2c] RUNTIME CAPABILITY REGISTRY CONTRACT');
try {
  const {
    buildRuntimeCapabilities,
    validateRuntimeCapabilities,
    getCapabilityRegistry,
  } = require('../server/lib/capabilities');

  const registry = getCapabilityRegistry();
  const runtime = buildRuntimeCapabilities({
    checkedAt: '2026-04-30T00:00:00.000Z',
    reportingStatus: 'not_configured',
  });
  const validation = validateRuntimeCapabilities(runtime);

  record('CAPABILITIES',
    Array.isArray(registry.integrations) && registry.integrations.length === 3,
    'registry loads with 3 integrations',
    `expected 3 integrations, got ${registry.integrations && registry.integrations.length}`);

  record('CAPABILITIES',
    validation.valid,
    'runtime capability object validates',
    `runtime validation failed: ${validation.errors.join('; ')}`);

  const reporting = runtime.integrations.find(i => i.id === 'projectworks_reporting');
  const actions = runtime.capabilities.projectworks.actions;
  const metabase = runtime.capabilities.metabase;

  record('CAPABILITIES',
    !!reporting &&
      reporting.label === 'Projectworks Reporting Data' &&
      reporting.capabilities.readSchema === false &&
      reporting.capabilities.runSql === false &&
      reporting.capabilities.readReportingData === false &&
      reporting.capabilities.writeActions === false,
    'projectworks_reporting remains compatible with existing settings UI',
    'projectworks_reporting integration shape or defaults changed');

  record('CAPABILITIES',
    actions &&
      Object.keys(actions).length === 10 &&
      Object.values(actions).every(v => v === false),
    'projectworks_actions write capabilities are false by default',
    `expected all projectworks action capabilities false, got ${JSON.stringify(actions)}`);

  record('CAPABILITIES',
    metabase &&
      metabase.publishQuestion === false &&
      metabase.publishDashboard === false,
    'metabase publish capabilities are false by default',
    `expected metabase publish capabilities false, got ${JSON.stringify(metabase)}`);

} catch (e) {
  record('CAPABILITIES', false, '', `failed: ${e.message}`);
}

// ── 2d. Action registry and disabled executor contract ────────────────────
console.log('\n[2d] ACTION REGISTRY AND DISABLED EXECUTOR CONTRACT');
try {
  const {
    getRegisteredActions,
    validateRegisteredActions,
    previewAction,
    executeAction,
  } = require('../server/lib/actions');

  const actions = getRegisteredActions();
  const validation = validateRegisteredActions(actions);
  const tenantSnapshot = { tenant: { id: 'demo' } };
  const user = { id: 'test-user', email: 'test@example.com' };
  const enabledTaskCapabilities = {
    projectworks: {
      actions: {
        createTask: true,
        createDraftInvoice: true,
      },
    },
    metabase: {},
  };
  const unavailableCapabilities = {
    projectworks: { actions: {} },
    metabase: {},
  };

  record('ACTIONS',
    validation.valid && actions.length >= 11,
    `all registered actions validate (${actions.length} action(s))`,
    `action registry invalid: ${validation.errors.join('; ')}`);

  const notifyPreview = previewAction(
    { id: 'create_task', tenantId: 'demo', inputs: { projectId: 'P-1', name: 'Follow up' } },
    { user, tenantSnapshot, capabilities: enabledTaskCapabilities, assistantAutonomy: 'notify' },
  );
  record('ACTIONS',
    !notifyPreview.policy.canExecute &&
      notifyPreview.policy.reasons.some(r => r.code === 'AUTONOMY_NOTIFY_ONLY'),
    'notify mode denies execution',
    `expected AUTONOMY_NOTIFY_ONLY, got ${JSON.stringify(notifyPreview.policy.reasons)}`);

  const proposePreview = previewAction(
    { id: 'create_task', tenantId: 'demo', inputs: { projectId: 'P-1', name: 'Follow up' } },
    { user, tenantSnapshot, capabilities: enabledTaskCapabilities, assistantAutonomy: 'propose' },
  );
  record('ACTIONS',
    !proposePreview.policy.canExecute &&
      proposePreview.policy.reasons.some(r => r.code === 'CONFIRMATION_REQUIRED'),
    'propose mode requires confirmation',
    `expected CONFIRMATION_REQUIRED, got ${JSON.stringify(proposePreview.policy.reasons)}`);

  const autoFinancialPreview = previewAction(
    { id: 'create_draft_invoice', tenantId: 'demo', inputs: { projectId: 'P-1' } },
    { user, tenantSnapshot, capabilities: enabledTaskCapabilities, assistantAutonomy: 'auto' },
  );
  record('ACTIONS',
    !autoFinancialPreview.policy.canExecute &&
      autoFinancialPreview.policy.reasons.some(r => r.code === 'AUTO_RESTRICTED'),
    'auto mode denies financial actions',
    `expected AUTO_RESTRICTED, got ${JSON.stringify(autoFinancialPreview.policy.reasons)}`);

  const unavailablePreview = previewAction(
    { id: 'create_task', tenantId: 'demo', inputs: { projectId: 'P-1', name: 'Follow up' } },
    { user, tenantSnapshot, capabilities: unavailableCapabilities, assistantAutonomy: 'auto' },
  );
  record('ACTIONS',
    !unavailablePreview.policy.canExecute &&
      unavailablePreview.policy.reasons.some(r => r.code === 'CAPABILITY_UNAVAILABLE'),
    'unavailable capability denies execution',
    `expected CAPABILITY_UNAVAILABLE, got ${JSON.stringify(unavailablePreview.policy.reasons)}`);

  const disabledResult = executeAction(
    { id: 'create_task', tenantId: 'demo', inputs: { projectId: 'P-1', name: 'Follow up' } },
    { user, tenantSnapshot, capabilities: enabledTaskCapabilities, assistantAutonomy: 'auto' },
  );
  record('ACTIONS',
    disabledResult.ok === false &&
      disabledResult.code === 'CAPABILITY_UNAVAILABLE' &&
      /Projectworks connection isn't available/.test(disabledResult.userMessage || ''),
    'disabled provider never claims success',
    `expected disabled provider failure, got ${JSON.stringify(disabledResult)}`);

} catch (e) {
  record('ACTIONS', false, '', `failed: ${e.message}`);
}

// ── 2e. Runtime chat context contract ────────────────────────────────────
console.log('\n[2e] RUNTIME CHAT CONTEXT CONTRACT');
try {
  const { buildRuntimeCapabilities } = require('../server/lib/capabilities');
  const { buildRuntimeContextBlock } = require('../server/lib/contextBuilder');
  const { buildChatSystemForRequest } = require('../server/lib/buildChatSystem');

  const runtime = buildRuntimeCapabilities({
    checkedAt: '2026-04-30T00:00:00.000Z',
    reportingStatus: 'not_configured',
  });
  const runtimeBlock = buildRuntimeContextBlock({
    preferences: {
      assistantAutonomy: 'propose',
      coachingStyle: 'supportive',
      firmGoal: 'steady',
    },
    runtimeCapabilities: runtime,
    user: { id: 'test-user', email: 'test@example.com' },
    tenantContext: { id: 'demo', source: 'static_demo' },
  });

  record('RUNTIME CONTEXT',
    runtimeBlock.includes('<runtime_context>') &&
      runtimeBlock.includes('assistantAutonomy: propose') &&
      runtimeBlock.includes('coachingStyle: supportive') &&
      runtimeBlock.includes('firmGoal: steady'),
    'runtime block includes autonomy, coaching style, and firm goal',
    `runtime block missing expected preference values: ${runtimeBlock}`);

  record('RUNTIME CONTEXT',
    runtimeBlock.includes('Projectworks write actions: unavailable') &&
      runtimeBlock.includes('Do not claim write completion') &&
      runtimeBlock.includes('prepare/validate/propose only'),
    'runtime block makes write actions unavailable and advisory',
    `runtime block overclaims or omits action policy: ${runtimeBlock}`);

  const built = buildChatSystemForRequest({
    route: 'sql_engine',
    family: 'general',
    liveSchema: null,
    messages: [{ role: 'user', content: 'show revenue by client' }],
    tenantContextBlock: '',
    knowledgeItems: [],
    runtimeContextBlock: runtimeBlock,
  });
  const cachedText = built.cachedBlocks.join('\n');
  const dynamicText = built.dynamicBlocks.join('\n');

  record('RUNTIME CONTEXT',
    !cachedText.includes('<runtime_context>') && dynamicText.includes('<runtime_context>'),
    'runtime context is dynamic only and not cached',
    'runtime context appeared in cached prompt blocks or was missing from dynamic blocks');

  record('RUNTIME CONTEXT',
    dynamicText.includes('Use the exact <reasoning>') &&
      dynamicText.includes('fenced sql format'),
    'SQL output format expectation remains present',
    'SQL engine dynamic prompt no longer includes the expected reasoning/sql format reminder');

} catch (e) {
  record('RUNTIME CONTEXT', false, '', `failed: ${e.message}`);
}

// ── 2f. AI model provider abstraction contract ───────────────────────────
console.log('\n[2f] AI MODEL PROVIDER CONTRACT');
try {
  const {
    getModelProvider,
    normalizeProviderName,
    parseJsonFromText,
  } = require('../server/lib/ai');
  const {
    anthropicMessagesOnce,
    anthropicMessagesWithRetry,
    buildSystemWithCache,
  } = require('../server/lib/anthropicClient');

  const provider = getModelProvider({ env: {} });

  record('AI PROVIDER',
    provider.id === 'anthropic' &&
      typeof provider.generateText === 'function' &&
      typeof provider.generateJson === 'function' &&
      typeof provider.streamText === 'function',
    'default provider is Anthropic and implements the provider interface',
    `expected default anthropic provider, got ${provider && provider.id}`);

  let unsupportedErr = null;
  try {
    getModelProvider({ env: { AI_PROVIDER: 'gemini' } });
  } catch (e) {
    unsupportedErr = e;
  }
  record('AI PROVIDER',
    unsupportedErr && unsupportedErr.code === 'UNSUPPORTED_AI_PROVIDER',
    'unsupported provider errors clearly',
    `expected UNSUPPORTED_AI_PROVIDER, got ${unsupportedErr && unsupportedErr.code}`);

  const openaiProvider = getModelProvider({ env: { AI_PROVIDER: 'openai' } });
  record('AI PROVIDER',
    openaiProvider.id === 'openai' && openaiProvider.isConfigured() === false,
    'OpenAI provider is optional and unconfigured without OPENAI_API_KEY',
    `expected unconfigured openai provider, got id=${openaiProvider && openaiProvider.id}`);

  record('AI PROVIDER',
    normalizeProviderName(' Anthropic ') === 'anthropic' &&
      normalizeProviderName('OPENAI') === 'openai',
    'provider names normalize predictably',
    'provider name normalization failed');

  record('AI PROVIDER',
    parseJsonFromText('```json\n{"route":"sql_engine","confidence":1}\n```').route === 'sql_engine',
    'JSON fence stripping works',
    'fenced JSON did not parse');

  const cachedSystem = buildSystemWithCache(['static'], ['dynamic']);
  record('AI PROVIDER',
    typeof anthropicMessagesOnce === 'function' &&
      typeof anthropicMessagesWithRetry === 'function' &&
      cachedSystem[0].cache_control &&
      cachedSystem[0].cache_control.type === 'ephemeral' &&
      !cachedSystem[1].cache_control,
    'existing anthropicClient facade and prompt caching still work',
    'anthropicClient compatibility facade changed unexpectedly');

} catch (e) {
  record('AI PROVIDER', false, '', `failed: ${e.message}`);
}

// ── 2g. Structured knowledge source registry contract ────────────────────
console.log('\n[2g] STRUCTURED KNOWLEDGE SOURCE REGISTRY CONTRACT');
try {
  const {
    getKnowledgeRegistry,
    validateKnowledgeRegistry,
    validateKnowledgeCard,
    selectRelevantKnowledge,
  } = require('../server/lib/knowledge');
  const { getTenantIntelligenceSnapshot } = require('../server/lib/tenantData');

  const registry = getKnowledgeRegistry();
  const validation = validateKnowledgeRegistry(registry);
  const snapshot = getTenantIntelligenceSnapshot({
    tenantId: 'demo',
    userId: 'test-user',
    role: 'project_manager',
  });

  record('KNOWLEDGE REGISTRY',
    validation.valid && registry.sources.length === 4 && registry.cards.length >= 30,
    `registry validates with ${registry.sources.length} sources and ${registry.cards.length} cards`,
    `registry invalid or incomplete: ${validation.errors.join('; ')}`);

  let invalidCard = null;
  for (const card of registry.cards) {
    const result = validateKnowledgeCard(card);
    if (!result.valid) {
      invalidCard = `${card.id}: ${result.errors.join('; ')}`;
      break;
    }
  }
  record('KNOWLEDGE REGISTRY',
    invalidCard === null,
    'all knowledge cards validate against the card schema',
    `invalid card: ${invalidCard}`);

  const cardIds = new Set();
  let duplicateCardId = null;
  for (const card of registry.cards) {
    if (cardIds.has(card.id)) {
      duplicateCardId = card.id;
      break;
    }
    cardIds.add(card.id);
  }
  record('KNOWLEDGE REGISTRY',
    duplicateCardId === null,
    'all knowledge card IDs are unique',
    `duplicate card id: ${duplicateCardId}`);

  record('KNOWLEDGE REGISTRY',
    registry.sources.every(source => source.requiresModel === false && source.requiresApi === false),
    'no knowledge source requires model or API access',
    'expected every knowledge source to declare requiresModel=false and requiresApi=false');

  const limited = selectRelevantKnowledge({
    tenantSnapshot: snapshot,
    userRole: 'director',
    userMessage: 'What matters today across utilisation, pipeline, and AR?',
    limit: 3,
  });
  record('KNOWLEDGE SELECTOR',
    limited.length <= 3,
    `selector respects max limit (${limited.length}/3)`,
    `selector returned ${limited.length} cards for limit 3`);

  const utilCards = selectRelevantKnowledge({
    tenantSnapshot: snapshot,
    insight: {
      type: 'benchmark_gap',
      metric: 'utilisationRate',
      title: 'Utilisation below benchmark',
      body: 'Low utilisation staff and capacity gaps are reducing billable performance.',
    },
    userRole: 'project_manager',
    userMessage: 'Where is our utilisation gap?',
    limit: 5,
  });
  record('KNOWLEDGE SELECTOR',
    utilCards.some(card => card.id === 'spi-utilization-benchmark-threshold' || card.id === 'pwm-ops-l2-visibility'),
    `utilisation gap selects relevant cards (${utilCards.map(card => card.id).join(', ')})`,
    `utilisation gap missed expected cards: ${utilCards.map(card => card.id).join(', ')}`);

  const pipelineCards = selectRelevantKnowledge({
    tenantSnapshot: {
      ...snapshot,
      user: { ...snapshot.user, role: 'director' },
    },
    insight: {
      type: 'benchmark_gap',
      metric: 'forwardBookingWeeks',
      title: 'Forward booking below threshold',
      body: 'Pipeline gap and revenue confidence are affecting forward booking.',
    },
    userRole: 'director',
    userMessage: 'Talk me through the pipeline gap and revenue confidence risk.',
    limit: 5,
  });
  record('KNOWLEDGE SELECTOR',
    pipelineCards.some(card => card.id === 'pwm-growth-pipeline-discipline' || card.id === 'pwm-growth-how-fast-are-you-growing'),
    `pipeline gap selects relevant cards (${pipelineCards.map(card => card.id).join(', ')})`,
    `pipeline gap missed expected cards: ${pipelineCards.map(card => card.id).join(', ')}`);

  const arCards = selectRelevantKnowledge({
    tenantSnapshot: {
      ...snapshot,
      user: { ...snapshot.user, role: 'finance' },
    },
    insight: {
      type: 'at_risk',
      metric: 'overdueInvoices',
      title: 'Overdue invoice',
      body: 'INV-1847 is overdue and sitting in AR.',
    },
    userRole: 'finance',
    userMessage: 'Which overdue AR items need follow-up?',
    limit: 5,
  });
  record('KNOWLEDGE SELECTOR',
    arCards.some(card => card.id === 'pwm-ops-l1-lean-admin' || card.id === 'pwm-ops-how-profitable-are-you'),
    `overdue AR selects relevant cards (${arCards.map(card => card.id).join(', ')})`,
    `overdue AR missed expected cards: ${arCards.map(card => card.id).join(', ')}`);

} catch (e) {
  record('KNOWLEDGE REGISTRY', false, '', `failed: ${e.message}`);
}

// ── 3. Maturity assessment ────────────────────────────────────────────────
console.log('\n[3] MATURITY ASSESSMENT SCORES CORRECTLY');
try {
  const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');
  const { assessMaturity }    = require('../server/lib/methodology/maturityAssessor');
  const data   = getMockTenantData('test-user', 'project_manager');
  const result = assessMaturity(data);

  record('MATURITY', result.ops.level === 2,
    `ops.level === 2`,
    `expected ops.level=2, got ${result.ops.level}`);
  record('MATURITY', result.ops.levelName === 'Visibility',
    `ops.levelName === 'Visibility'`,
    `expected ops.levelName='Visibility', got '${result.ops.levelName}'`);
  record('MATURITY', result.growth.level === 1,
    `growth.level === 1`,
    `expected growth.level=1, got ${result.growth.level}`);
  record('MATURITY', result.growth.levelName === 'Win More Work',
    `growth.levelName === 'Win More Work'`,
    `expected growth.levelName='Win More Work', got '${result.growth.levelName}'`);
  record('MATURITY', !!result.ops.nextLevel,
    `ops.nextLevel exists (→ L${result.ops.nextLevel && result.ops.nextLevel.level} ${result.ops.nextLevel && result.ops.nextLevel.name})`,
    `ops.nextLevel is missing`);

  const gapCount = result.ops.nextLevel && Array.isArray(result.ops.nextLevel.gapIndicators)
    ? result.ops.nextLevel.gapIndicators.length
    : -1;
  record('MATURITY', gapCount > 0,
    `ops.nextLevel.gapIndicators has ${gapCount} item(s)`,
    `expected gapIndicators.length>0, got ${gapCount === -1 ? 'no array' : gapCount}`);
} catch (e) {
  record('MATURITY', false, '', `failed: ${e.message}`);
}

// ── 4. Dollar impact math ─────────────────────────────────────────────────
// 1pp value ~$102k (formula × 1pp), total gap ~$591k (formula × full 5.8pp gap).
console.log('\n[4] DOLLAR IMPACT: 1pp value ~$102k, total gap ~$591k');
{
  const headcount  = 37;
  const chargeOut  = 153;
  const onePpValue = 0.01 * headcount * chargeOut * 1800;

  record('DOLLAR IMPACT',
    onePpValue >= 100000 && onePpValue <= 115000,
    `1pp value ≈ $${Math.round(onePpValue).toLocaleString()} (in range $100k–$115k)`,
    `expected onePpValue in 100,000–115,000, got $${Math.round(onePpValue).toLocaleString()}`);

  // Pull totalGapValue from an actual generated insight to verify wiring end-to-end.
  let utilInsight = null;
  let loadErr = null;
  try {
    const { generateInsights }  = require('../server/lib/methodology/insightGenerator');
    const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');
    const { assessMaturity }    = require('../server/lib/methodology/maturityAssessor');
    const data     = getMockTenantData('test-user', 'project_manager');
    const maturity = assessMaturity(data);
    const insights = generateInsights('test-user', 'project_manager', data, maturity);
    utilInsight    = insights.find(i => i.metric === 'utilisationRate') || null;
  } catch (e) {
    loadErr = e;
  }

  const totalGap = utilInsight && typeof utilInsight.totalGapValue === 'number'
    ? utilInsight.totalGapValue
    : null;

  record('DOLLAR IMPACT',
    totalGap !== null,
    `totalGapValue exists on utilisation insight = $${totalGap ? totalGap.toLocaleString() : '?'}`,
    loadErr
      ? `failed to load insight: ${loadErr.message}`
      : `totalGapValue missing on utilisation insight`);

  if (totalGap !== null) {
    record('DOLLAR IMPACT',
      totalGap > onePpValue,
      `totalGapValue ($${totalGap.toLocaleString()}) > onePpValue ($${Math.round(onePpValue).toLocaleString()})`,
      `expected totalGapValue > onePpValue, got total=${totalGap}, 1pp=${Math.round(onePpValue)}`);

    const expectedTotal = 591000;
    const tolerance     = expectedTotal * 0.10;
    const within        = Math.abs(totalGap - expectedTotal) <= tolerance;
    record('DOLLAR IMPACT', within,
      `totalGapValue ≈ $${expectedTotal.toLocaleString()} (within ±10%); actual = $${totalGap.toLocaleString()}`,
      `expected totalGapValue ~$${expectedTotal.toLocaleString()} (within ±10%), got $${totalGap.toLocaleString()}`);
  }
}

// ── 5. Insight generation per role ────────────────────────────────────────
console.log('\n[5] INSIGHT GENERATION PER ROLE');
try {
  const { generateInsights }  = require('../server/lib/methodology/insightGenerator');
  const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');
  const { assessMaturity }    = require('../server/lib/methodology/maturityAssessor');

  const minimums = { project_manager: 4, time_expense: 1, finance: 2, director: 3 };
  const required = ['id', 'type', 'title', 'body', 'severity', 'audience', 'action', 'stableIdentity', 'facts', 'schemaVersion'];
  const allByRole = {};

  for (const role of Object.keys(minimums)) {
    const data     = getMockTenantData('test-user', role);
    const maturity = assessMaturity(data);
    const insights = generateInsights('test-user', role, data, maturity);
    allByRole[role] = insights;

    record('INSIGHTS',
      insights.length >= minimums[role],
      `${role}: ${insights.length} insight(s) (≥${minimums[role]} required) → [${insights.map(i => i.title).join(' | ') || '—'}]`,
      `${role}: expected ≥${minimums[role]}, got ${insights.length}`);

    let badField = null;
    let badId    = null;
    for (const insight of insights) {
      for (const f of required) {
        if (insight[f] === undefined || insight[f] === null) {
          badField = f;
          badId    = insight.id || '<no-id>';
          break;
        }
      }
      if (badField) break;
    }
    if (insights.length > 0) {
      record('INSIGHTS',
        badField === null,
        `${role}: every insight has legacy fields plus stableIdentity/facts/schemaVersion`,
        `${role}: insight ${badId} missing field '${badField}'`);
    }
  }

  // PM should not contain insights whose audience excludes PM (no leakage from
  // time_expense-only or other-restricted insights).
  const pm = allByRole.project_manager || [];
  let leak = null;
  for (const i of pm) {
    const aud = Array.isArray(i.audience) ? i.audience : [];
    if (!aud.includes('all') && !aud.includes('project_manager')) {
      leak = `${i.title} (audience=${JSON.stringify(aud)})`;
      break;
    }
  }
  record('INSIGHTS',
    leak === null,
    `project_manager results contain no audience-restricted leakage`,
    `audience leak in PM results: ${leak}`);

  const generatedInsights = Object.values(allByRole).flat();

  let badFactsObject = null;
  for (const i of generatedInsights) {
    if (!i.facts || typeof i.facts !== 'object' || Array.isArray(i.facts)) {
      badFactsObject = i.id;
      break;
    }
  }
  record('INSIGHTS',
    badFactsObject === null,
    'every generated insight has a facts object',
    `insight '${badFactsObject}' missing a facts object`);

  let badGeneratedCopy = null;
  for (const i of generatedInsights) {
    if (i.generatedCopy !== null) {
      badGeneratedCopy = i.id;
      break;
    }
  }
  record('INSIGHTS',
    badGeneratedCopy === null,
    'generatedCopy is null before model-generated copy is wired',
    `insight '${badGeneratedCopy}' has non-null generatedCopy`);

  let badCacheExpiry = null;
  for (const i of generatedInsights) {
    if (i.cacheExpiresAt !== null) {
      badCacheExpiry = i.id;
      break;
    }
  }
  record('INSIGHTS',
    badCacheExpiry === null,
    'cacheExpiresAt is null until fact/cache lifecycle is wired',
    `insight '${badCacheExpiry}' has non-null cacheExpiresAt`);

  const legacyCardFields = ['situationTitle', 'decisionBridge', 'primaryAction', 'title', 'body', 'action'];
  let emptyCardField = null;
  for (const i of generatedInsights) {
    for (const field of legacyCardFields) {
      if (typeof i[field] !== 'string' || i[field].trim().length === 0) {
        emptyCardField = `${i.id}.${field}`;
        break;
      }
    }
    if (!Array.isArray(i.secondaryOptions) || i.secondaryOptions.length === 0) {
      emptyCardField = `${i.id}.secondaryOptions`;
    }
    if (emptyCardField) break;
  }
  record('INSIGHTS',
    emptyCardField === null,
    'current app card fields are present and non-empty',
    `empty app card field: ${emptyCardField}`);

  const factContracts = [
    {
      label: 'utilisation_gap',
      when: i => i.metric === 'utilisationRate',
      fields: ['currentRate', 'benchmarkRate', 'gapPp', 'previousRate', 'orgName', 'billableHeadcount', 'impliedChargeOutRate', 'lowUtilStaff', 'teamBreakdown'],
    },
    {
      label: 'missing_timesheets',
      when: i => i.metric === 'timesheetCompletionRate' || i.metric === 'myTimesheets',
      fields: ['people'],
    },
    {
      label: 'forward_booking_gap',
      when: i => i.metric === 'forwardBookingWeeks',
      fields: ['currentWeeks', 'targetWeeks', 'orgName', 'pendingProposals'],
    },
    {
      label: 'at_risk_project',
      when: i => i.metric === 'projectMargin',
      fields: ['project', 'client', 'budgetFee', 'workedAmount', 'overBudgetPct', 'overBudgetAmount'],
    },
    {
      label: 'overdue_invoice',
      when: i => i.metric === 'overdueInvoices',
      fields: ['client', 'amount', 'daysOverdue', 'invoiceNumber', 'paymentTerms', 'lastContactDaysAgo'],
    },
    {
      label: 'wip_flag',
      when: i => i.metric === 'outstandingWIP',
      fields: ['totalWip', 'oldestMonth', 'projectBreakdown'],
    },
    {
      label: 'allocation_summary',
      when: i => i.metric === 'myAllocations',
      fields: ['project', 'timecode', 'allocatedHours', 'loggedHours', 'remainingHours', 'allocatedHoursPerWeek'],
    },
  ];

  let missingFactField = null;
  for (const i of generatedInsights) {
    const contract = factContracts.find(c => c.when(i));
    if (!contract) {
      missingFactField = `${i.id}: no fact contract for metric '${i.metric}'`;
      break;
    }
    for (const field of contract.fields) {
      if (!(field in i.facts)) {
        missingFactField = `${i.id} (${contract.label}).${field}`;
        break;
      }
    }
    if (missingFactField) break;
  }
  record('INSIGHTS',
    missingFactField === null,
    'facts include required fields for every generated insight type',
    `missing required fact field: ${missingFactField}`);
} catch (e) {
  record('INSIGHTS', false, '', `failed: ${e.message}`);
}

// ── 6. Insights store isolation ───────────────────────────────────────────
console.log('\n[6] INSIGHTS STORE ISOLATION');
const TEST_A   = 'methodology-test-A';
const TEST_B   = 'methodology-test-B';
const DATA_DIR = path.join(__dirname, '..', 'server', 'data');

function deleteTestFile(userId) {
  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  try { fs.unlinkSync(path.join(DATA_DIR, `insights-${safeId}.json`)); } catch (_) {}
}

try {
  const store = require('../server/lib/methodology/insightsStore');

  // Clean slate before run.
  store.clearInsights(TEST_A);
  store.clearInsights(TEST_B);

  const stub = id => ({
    id, type: 'reminder', title: id, body: '.',
    severity: 'low', audience: ['all'], action: '.',
    read: false, dismissed: false,
  });

  store.addInsight(TEST_A, stub('iso-a-1'));
  store.addInsight(TEST_A, stub('iso-a-2'));
  store.addInsight(TEST_B, stub('iso-b-1'));

  const aList = store.getInsights(TEST_A);
  const bList = store.getInsights(TEST_B);

  record('STORE',
    aList.length === 2,
    `user-A has 2 insights`,
    `expected user-A length=2, got ${aList.length}`);
  record('STORE',
    bList.length === 1,
    `user-B has 1 insight`,
    `expected user-B length=1, got ${bList.length}`);
  record('STORE',
    !aList.some(i => i.id === 'iso-b-1'),
    `user-A does NOT contain user-B's insight (isolation OK)`,
    `LEAK: user-A contains user-B's insight`);

  store.markRead(TEST_A, 'iso-a-1');
  const unreadA = store.getUnreadInsights(TEST_A);
  record('STORE',
    unreadA.length === 1,
    `after markRead, user-A has 1 unread`,
    `expected unread=1, got ${unreadA.length}`);

  store.addInsight(TEST_A, {
    ...stub('iso-a-1'),
    stableIdentity: 'store-refresh-test',
    facts: { refreshed: true },
    generatedCopy: null,
    cacheExpiresAt: null,
    schemaVersion: 'insight.v2',
  });
  const refreshed = store.getInsights(TEST_A).find(i => i.id === 'iso-a-1');
  record('STORE',
    refreshed && refreshed.read === true && refreshed.facts && refreshed.facts.refreshed === true,
    `duplicate add refreshes shape while preserving read state`,
    `expected refreshed read insight with facts, got ${JSON.stringify(refreshed)}`);
} catch (e) {
  record('STORE', false, '', `failed: ${e.message}`);
} finally {
  // Always tidy up — don't leave test residue in server/data/.
  try { require('../server/lib/methodology/insightsStore').clearInsights(TEST_A); } catch (_) {}
  try { require('../server/lib/methodology/insightsStore').clearInsights(TEST_B); } catch (_) {}
  deleteTestFile(TEST_A);
  deleteTestFile(TEST_B);
}

// ── 7. Card structure ─────────────────────────────────────────────────────
console.log('\n[7] CARD STRUCTURE');
try {
  const { generateInsights }  = require('../server/lib/methodology/insightGenerator');
  const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');
  const { assessMaturity }    = require('../server/lib/methodology/maturityAssessor');

  // Gather all decision-unit insights (non-reminder) across all roles, de-duped by id.
  let allInsights = [];
  for (const role of ['project_manager', 'finance', 'director', 'time_expense']) {
    const data     = getMockTenantData('test-user', role);
    const maturity = assessMaturity(data);
    allInsights = allInsights.concat(generateInsights('test-user', role, data, maturity));
  }
  const seen    = new Set();
  const unique  = allInsights.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
  const dInsights = unique.filter(i => i.type !== 'reminder');

  for (const field of ['situationTitle', 'decisionBridge', 'primaryAction', 'secondaryOptions']) {
    let missing = null;
    for (const i of dInsights) {
      if (i[field] === undefined || i[field] === null) { missing = i.id; break; }
    }
    record('CARD STRUCTURE', missing === null,
      `all decision-unit insights have '${field}'`,
      `insight '${missing}' is missing '${field}'`);
  }

  // secondaryOptions always includes both sentinel actions.
  let badRIC = null, badDismiss = null;
  for (const i of dInsights) {
    if (!Array.isArray(i.secondaryOptions)) continue;
    if (!i.secondaryOptions.includes('Review in Chat')) { badRIC = i.id; break; }
  }
  for (const i of dInsights) {
    if (!Array.isArray(i.secondaryOptions)) continue;
    if (!i.secondaryOptions.includes('Dismiss')) { badDismiss = i.id; break; }
  }
  record('CARD STRUCTURE', badRIC === null,
    'secondaryOptions always includes "Review in Chat"',
    `insight '${badRIC}' secondaryOptions missing "Review in Chat"`);
  record('CARD STRUCTURE', badDismiss === null,
    'secondaryOptions always includes "Dismiss"',
    `insight '${badDismiss}' secondaryOptions missing "Dismiss"`);

  // situationTitle must be entity-first — no system-label prefix like the old title field used.
  // Patterns that indicate a system-label construction rather than an entity name / number.
  const SYSTEM_PREFIXES = ['Overdue invoice', 'Forward booking', 'Utilisation below', 'Missing timesheets'];
  let badEntityFirst = null;
  for (const i of dInsights) {
    if (!i.situationTitle) continue;
    const badPrefix = SYSTEM_PREFIXES.find(p => i.situationTitle.startsWith(p));
    if (badPrefix) {
      badEntityFirst = `'${i.id}': "${i.situationTitle.slice(0, 50)}"`;
      break;
    }
  }
  record('CARD STRUCTURE', badEntityFirst === null,
    'situationTitle is entity-first (no system-label prefix)',
    `not entity-first: ${badEntityFirst}`);

} catch (e) {
  record('CARD STRUCTURE', false, '', `failed: ${e.message}`);
}

// ── 8. Coaching state logic ────────────────────────────────────────────────
console.log('\n[8] COACHING STATE LOGIC');
try {
  const { deriveFirmGoalState, getCoachingVoice } = require('../server/lib/methodology/insightGenerator');

  // Goal-scaled threshold cases at 4pp gap — same gap, four different states.
  // 4pp is below stable's 5pp at_goal threshold but above steady's 3pp,
  // above significant's 1pp (below its 5pp struggling threshold),
  // and above top's 3pp struggling threshold.
  const scaledCases = [
    { goal: 'stable',      gap: 4, expected: 'at_goal',          note: 'within 5pp stable at_goal threshold' },
    { goal: 'steady',      gap: 4, expected: 'below_closing',    note: 'above 3pp steady threshold, below 10pp struggling' },
    { goal: 'significant', gap: 4, expected: 'below_closing',    note: 'above 1pp threshold, below 5pp struggling' },
    { goal: 'top',         gap: 4, expected: 'below_struggling', note: 'above 3pp top struggling threshold' },
  ];
  for (const { goal, gap, expected, note } of scaledCases) {
    const state = deriveFirmGoalState(gap, goal);
    record('COACHING STATE',
      state === expected,
      `${goal} + ${gap}pp → ${expected} (${note})`,
      `${goal} + ${gap}pp: expected '${expected}', got '${state}'`);
  }

  // Any goal + large gap (16pp exceeds every struggling threshold) → below_struggling.
  for (const goal of ['stable', 'steady', 'significant', 'top']) {
    const state = deriveFirmGoalState(16, goal);
    record('COACHING STATE',
      state === 'below_struggling',
      `any goal (${goal}) + 16pp → below_struggling`,
      `${goal} + 16pp: expected 'below_struggling', got '${state}'`);
  }

  // Any goal + negative gap → above_goal (performing better than benchmark).
  for (const goal of ['stable', 'top']) {
    const state = deriveFirmGoalState(-1, goal);
    record('COACHING STATE',
      state === 'above_goal',
      `any goal (${goal}) + -1pp → above_goal`,
      `${goal} + -1pp: expected 'above_goal', got '${state}'`);
  }

  // below_struggling preserves urgent prefix across ALL coaching styles —
  // the one invariant the code documents explicitly.
  let urgencyFail = null;
  for (const style of ['supportive', 'direct', 'data']) {
    const voice = getCoachingVoice(20, style, 'below_struggling');
    if (!voice.prefix || voice.prefix.length === 0) { urgencyFail = style; break; }
  }
  record('COACHING STATE', urgencyFail === null,
    'below_struggling preserves urgent prefix for all coaching styles (supportive/direct/data)',
    `below_struggling + ${urgencyFail}: expected non-empty prefix, got none`);

  // above_goal produces forward-looking suffix (contains "next level" or "target").
  const aboveVoice = getCoachingVoice(-1, 'supportive', 'above_goal');
  record('COACHING STATE',
    aboveVoice.suffix.length > 0 && /next level|target/i.test(aboveVoice.suffix),
    `above_goal: suffix contains forward-looking language ("${aboveVoice.suffix.slice(0, 60)}")`,
    `above_goal: expected forward-looking suffix, got '${aboveVoice.suffix}'`);

} catch (e) {
  record('COACHING STATE', false, '', `failed: ${e.message}`);
}

// ── 9. Model-generated insight copy contract ─────────────────────────────
async function runGeneratedCopyTests() {
  console.log('\n[9] MODEL-GENERATED INSIGHT COPY CONTRACT');
  try {
    const { generateInsights, generateCopyForInsights } = require('../server/lib/methodology/insightGenerator');
    const { getMockTenantData } = require('../server/lib/methodology/mockTenantData');
    const { assessMaturity } = require('../server/lib/methodology/maturityAssessor');
    const { getTenantIntelligenceSnapshot } = require('../server/lib/tenantData');

    const data = getMockTenantData('test-user', 'project_manager');
    const maturity = assessMaturity(data);
    const baseInsights = generateInsights('test-user', 'project_manager', data, maturity).slice(0, 3);
    const tenantSnapshot = getTenantIntelligenceSnapshot({
      tenantId: 'demo',
      userId: 'test-user',
      role: 'project_manager',
    });
    const now = new Date('2026-05-01T12:00:00.000Z');

    let calls = 0;
    let requestText = '';
    const fakeProvider = {
      isConfigured: () => true,
      async generateText(args) {
        calls += 1;
        requestText = args.messages[0].content;
        const payload = JSON.parse(requestText);
        return JSON.stringify({
          insights: payload.insights.map(item => ({
            id: item.id,
            situationTitle: `Model: ${item.currentCopy.situationTitle}`,
            decisionBridge: `Model bridge for ${item.metric}`,
            primaryAction: item.currentCopy.primaryAction || 'Review in Chat',
            secondaryOptions: item.currentCopy.secondaryOptions,
            priorityReason: `Prioritized from ${item.metric}`,
            knowledgeBasis: item.knowledgeCards.map(card => card.id).slice(0, 2),
          })),
        });
      },
    };

    const copied = await generateCopyForInsights(baseInsights, {
      modelProvider: fakeProvider,
      tenantSnapshot,
      userRole: 'project_manager',
      now,
    });

    record('GENERATED COPY',
      calls === 1,
      'one batch model call generates copy for multiple insights',
      `expected one batch call, got ${calls}`);

    record('GENERATED COPY',
      copied.every(i => i.generatedCopy && i.situationTitle.startsWith('Model:')),
      'generatedCopy is attached and mapped back to legacy card fields',
      'expected every copied insight to have generatedCopy and model situationTitle');

    record('GENERATED COPY',
      copied.every(i => Date.parse(i.cacheExpiresAt) > now.getTime()),
      'cacheExpiresAt is set in the future',
      `expected future cache expiry, got ${copied.map(i => i.cacheExpiresAt).join(', ')}`);

    const basisIdsOnly = copied.every(i =>
      Array.isArray(i.generatedCopy.knowledgeBasis) &&
      i.generatedCopy.knowledgeBasis.every(id => typeof id === 'string' && id.length > 0 && id.length < 100 && !/\s/.test(id))
    );
    record('GENERATED COPY',
      basisIdsOnly,
      'generatedCopy.knowledgeBasis contains compact knowledge card IDs',
      'knowledgeBasis should contain IDs only');

    record('GENERATED COPY',
      requestText.includes('"knowledgeCards"') &&
        requestText.includes('"id"') &&
        !requestText.includes('"sourceNotes"') &&
        !requestText.includes('"promptUse"') &&
        !requestText.includes('"antiPatterns"'),
      'model request includes compact knowledge card context without raw source fields',
      'model request should include compact knowledge card IDs, not raw source document fields');

    calls = 0;
    await generateCopyForInsights(copied, {
      modelProvider: fakeProvider,
      tenantSnapshot,
      userRole: 'project_manager',
      now,
    });
    record('GENERATED COPY',
      calls === 0,
      'cached insights skip model calls',
      `expected cached insights to skip calls, got ${calls}`);

    let invalidCalls = 0;
    const invalidProvider = {
      isConfigured: () => true,
      async generateText() {
        invalidCalls += 1;
        return '{not valid json';
      },
    };
    const invalid = await generateCopyForInsights([baseInsights[0]], {
      modelProvider: invalidProvider,
      tenantSnapshot,
      userRole: 'project_manager',
      now,
    });
    record('GENERATED COPY',
      invalidCalls === 1 &&
        invalid[0].generatedCopy === null &&
        typeof invalid[0].situationTitle === 'string' &&
        invalid[0].situationTitle.trim().length > 0 &&
        typeof invalid[0].decisionBridge === 'string' &&
        invalid[0].decisionBridge.trim().length > 0,
      'invalid JSON falls back to existing non-empty card copy',
      'invalid JSON should not clear generatedCopy fallback card fields');

    let unavailableCalls = 0;
    const unavailableProvider = {
      isConfigured: () => false,
      async generateText() {
        unavailableCalls += 1;
        return '{}';
      },
    };
    const unavailable = await generateCopyForInsights([baseInsights[1]], {
      modelProvider: unavailableProvider,
      tenantSnapshot,
      userRole: 'project_manager',
      now,
    });
    record('GENERATED COPY',
      unavailableCalls === 0 &&
        unavailable[0].generatedCopy === null &&
        unavailable[0].situationTitle.trim().length > 0,
      'unconfigured model provider fails safe without blanking cards',
      'unconfigured provider should skip model call and preserve legacy copy');
  } catch (e) {
    record('GENERATED COPY', false, '', `failed: ${e.message}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────
function finish() {
  console.log('\n' + '─'.repeat(40));
  console.log(`✓ ${passed} test(s) passed`);
  if (failed > 0) {
    console.log(`✗ ${failed} test(s) failed`);
    console.log('\nFailures:');
    for (const f of failures) console.log(`  • ${f}`);
    process.exit(1);
  } else {
    console.log('All tests passed.');
    process.exit(0);
  }
}

runGeneratedCopyTests().then(finish).catch(err => {
  record('GENERATED COPY', false, '', `failed: ${err.message}`);
  finish();
});
