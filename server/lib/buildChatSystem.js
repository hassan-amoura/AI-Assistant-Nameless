'use strict';

const { splitClaudeMd } = require('./claudeMd');
const { sliceSchemaSection, schemaTableOverview } = require('../schema/sliceSchema');
const { findTemplateHint } = require('../schema/reportTemplates');
const { lastUserText } = require('./contextBuilder');
const { REVENUE_MARGIN_GUIDANCE } = require('./revenueMarginGuidance');

/**
 * Assembles system prompts with explicit static vs dynamic boundaries so the
 * caller can apply Anthropic prompt caching markers. Returns the prompt as two
 * ordered string arrays:
 *
 *   cachedBlocks  — large, stable content. Safe to cache_control: ephemeral.
 *                   Order: [instructions, schemaSliceOrOverview, tenantBlock?]
 *
 *   dynamicBlocks — per-request / per-user content. NEVER cached.
 *                   Order: [templateHint?, modeSuffix, runtimeContext?, revenueMarginGuidance?]
 *
 * The caller (see anthropicClient.buildSystemWithCache) composes the Anthropic
 * system array by mapping cachedBlocks → cache_control: ephemeral blocks and
 * dynamicBlocks → plain text blocks, preserving order.
 */

const ADVISOR_MODE_SUFFIX = `

---
## ACTIVE SERVER ROUTE: DATA ADVISOR (conversation layer)

You are the senior solutions engineer conversation layer for Projectworks data.
- Interpret questions, coach vague asks with **one** natural follow-up when needed, and suggest angles or metrics.
- Guide when something belongs in Metabase (recurring dashboard vs one-off native query).
- Do not output a fenced SQL code block (markdown sql fence) unless the user explicitly asks you to write or fix SQL (e.g. they paste a query).
- When the request is fully specified and they want the build, say clearly they can ask you to generate the report and you'll produce T-SQL with reasoning.
- Never output a \`<pw-options>\` block from this route. Structured choice buttons exist only on the report engine path; clarifications here are **plain text only**.

Preserve warmth, plain English, and all safety / danger-word behaviour from the instructions above.
`;

const ENGINE_MODE_SUFFIX = `

---
## ACTIVE SERVER ROUTE: REPORT ENGINE (execution layer)

The intake step judged this turn ready for a concrete T-SQL report. Follow all SQL and reasoning rules above.
Use the exact <reasoning>...</reasoning> plus fenced sql format from SQL OUTPUT RULES (structured lines: Question interpreted as / Tables / Filters / Date logic / Gotchas) when you can do so safely.
If you discover mid-reasoning that something critical is still undefined, stop and ask **one** natural question instead of SQL.
`;

/**
 * Formats workspace knowledge items into a readable section for the prompt.
 * Only called when knowledge items exist.
 * @param {Array<{term: string, definition: string}>} items
 * @returns {string}
 */
function formatKnowledgeBlock(items) {
  if (!items || !items.length) return '';
  const lines = items.map(i => `- ${i.term} = ${i.definition}`).join('\n');
  return `\n## Workspace Knowledge\n${lines}\n`;
}

function pickSchemaBody(liveSchema, staticSchemaSection) {
  if (liveSchema && liveSchema.trim()) return liveSchema;
  return staticSchemaSection || '';
}

/**
 * @returns {{
 *   cachedBlocks: string[],
 *   dynamicBlocks: string[],
 *   route: string,
 *   family: string,
 *   templateId: string|null,
 * }}
 */
function buildChatSystemForRequest({
  route,
  family,
  liveSchema,
  messages,
  tenantContextBlock,
  knowledgeItems,
  runtimeContextBlock,
}) {
  const { instructions, schemaSection } = splitClaudeMd();
  const fullSchema = pickSchemaBody(liveSchema, schemaSection);
  const overview = schemaTableOverview(fullSchema);
  const lastUser = lastUserText(messages);
  const tenantBlock = (tenantContextBlock || '').trim();
  const knowledgeBlock = formatKnowledgeBlock(knowledgeItems);
  const runtimeBlock = (runtimeContextBlock || '').trim();

  if (route === 'data_advisor') {
    const cachedBlocks = [instructions, overview];
    if (tenantBlock) cachedBlocks.push(tenantBlock);
    if (knowledgeBlock) cachedBlocks.push(knowledgeBlock);
    const dynamicBlocks = [ADVISOR_MODE_SUFFIX];
    if (runtimeBlock) dynamicBlocks.push(runtimeBlock);
    return {
      cachedBlocks,
      dynamicBlocks,
      route,
      family: family || 'general',
      templateId: null,
    };
  }

  const sliced = sliceSchemaSection(fullSchema, family || 'general');
  const hintObj = findTemplateHint(lastUser);
  const templateHint = hintObj
    ? `\n## Template hint (${hintObj.id})\n${hintObj.hint}\n`
    : '';

  const cachedBlocks = [instructions, sliced];
  if (tenantBlock) cachedBlocks.push(tenantBlock);
  if (knowledgeBlock) cachedBlocks.push(knowledgeBlock);

  const dynamicBlocks = [];
  if (templateHint) dynamicBlocks.push(templateHint);
  dynamicBlocks.push(ENGINE_MODE_SUFFIX);
  if (runtimeBlock) dynamicBlocks.push(runtimeBlock);
  dynamicBlocks.push(REVENUE_MARGIN_GUIDANCE);

  return {
    cachedBlocks,
    dynamicBlocks,
    route: 'sql_engine',
    family: family || 'general',
    templateId: hintObj ? hintObj.id : null,
  };
}

module.exports = { buildChatSystemForRequest, pickSchemaBody };
