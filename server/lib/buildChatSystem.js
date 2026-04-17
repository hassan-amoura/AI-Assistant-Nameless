'use strict';

const { splitClaudeMd } = require('./claudeMd');
const { sliceSchemaSection, schemaTableOverview } = require('../schema/sliceSchema');
const { findTemplateHint } = require('../schema/reportTemplates');
const { lastUserText } = require('./contextBuilder');
const { REVENUE_MARGIN_GUIDANCE } = require('./revenueMarginGuidance');

/**
 * Assembles system prompts with static vs dynamic boundaries for future
 * Anthropic prompt caching (large stable prefix first).
 *
 * Static: instructions block from CLAUDE.md (until schema marker).
 * Dynamic: schema slice OR table overview + optional template hint + mode suffix.
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

function pickSchemaBody(liveSchema, staticSchemaSection) {
  if (liveSchema && liveSchema.trim()) return liveSchema;
  return staticSchemaSection || '';
}

/**
 * @returns {{ system: string, route: string, family: string, templateId: string|null }}
 */
function buildChatSystemForRequest({ route, family, liveSchema, messages }) {
  const { instructions, schemaSection } = splitClaudeMd();
  const fullSchema = pickSchemaBody(liveSchema, schemaSection);
  const overview = schemaTableOverview(fullSchema);
  const lastUser = lastUserText(messages);

  if (route === 'data_advisor') {
    const system =
      instructions +
      '\n' +
      overview +
      ADVISOR_MODE_SUFFIX;
    return { system, route, family: family || 'general', templateId: null };
  }

  const sliced = sliceSchemaSection(fullSchema, family || 'general');
  const hintObj = findTemplateHint(lastUser);
  const templateHint = hintObj
    ? `\n## Template hint (${hintObj.id})\n${hintObj.hint}\n`
    : '';

  const system =
    instructions +
    '\n' +
    sliced +
    templateHint +
    ENGINE_MODE_SUFFIX +
    REVENUE_MARGIN_GUIDANCE;

  return {
    system,
    route: 'sql_engine',
    family: family || 'general',
    templateId: hintObj ? hintObj.id : null,
  };
}

module.exports = { buildChatSystemForRequest, pickSchemaBody };
