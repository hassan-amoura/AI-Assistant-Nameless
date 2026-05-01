# Knowledge Source Authoring

The Knowledge Source Registry stores structured coaching knowledge for the Projectworks assistant. It is intentionally not a RAG system, not a vector store, and not a raw document prompt dump.

Use it for compact, product-safe cards that help the assistant select the right professional-services principle for a tenant fact, insight, role, or user question.

## Source Module Contract

Add new sources under `server/lib/knowledge/sources/` and register them in `server/lib/knowledge/knowledgeRegistry.js`.

Each source exports:

```js
module.exports = {
  source: {
    id,
    title,
    type,
    authority,
    version,
    requiresModel: false,
    requiresApi: false,
    cards,
  },
};
```

`requiresModel` and `requiresApi` must stay `false`. The registry is static structured knowledge. It must not call the model, Projectworks API, MCP, database, or network.

## Card Shape

Every card must validate against:

```js
{
  id,
  sourceId,
  sourceTitle,
  sourceType,
  authority,
  version,
  domains,
  topics,
  appliesWhen,
  principle,
  evidenceSummary,
  metrics,
  antiPatterns,
  recommendedActions,
  coachingUse,
  promptUse,
  confidence,
  sourceNotes
}
```

Allowed `sourceType` values:

- `benchmark`
- `methodology`
- `operator_playbook`
- `internal_note`
- `product_policy`

Allowed `authority` values:

- `external`
- `projectworks`
- `founder`
- `coo`
- `internal`

Allowed `confidence` values:

- `high`
- `medium`
- `low`

## Writing Rules

Summarize principles. Do not quote long passages or paste source documents.

Write cards as operating guidance, not marketing copy. A good card should tell the assistant:

- when the knowledge applies
- which tenant facts or insight types should select it
- what principle to apply
- which metrics matter
- which anti-patterns to avoid
- what actions are sensible to prepare or recommend

Keep `topics` and `appliesWhen` concrete. The selector uses these fields heavily, so include terms users and insight objects will actually contain, such as `utilisation`, `pipeline`, `accounts_receivable`, `project_margin`, `forward_booking`, `book_to_bill`, or `founder_bottleneck`.

## Selector Expectations

`selectRelevantKnowledge({ tenantSnapshot, insight, userMessage, userRole, limit })` is deterministic and local.

It considers:

- `domains`
- `topics`
- `appliesWhen`
- insight fields like `type`, `metric`, `title`, and `body`
- tenant maturity and firm stage
- role hints
- user message keywords

Default limit is `5`. Callers should still treat selected cards as advisory context, not as proof that an action capability exists.

## Adding COO Or Founder Context

Future COO notes, founder operating principles, or internal policies should be added as a new source module, not mixed into existing sources.

Use:

- `sourceType: 'internal_note'` for internal operating notes
- `sourceType: 'operator_playbook'` for founder or executive playbooks
- `authority: 'coo'`, `authority: 'founder'`, or `authority: 'internal'` as appropriate

Prefer several small cards over one broad card. Cards should be specific enough for the selector to pick them from tenant facts.

## Validation

Run:

```sh
npm run test:methodology
```

The test suite verifies:

- all cards validate
- card IDs are unique
- no source requires model or API access
- selector limit is respected
- utilisation, pipeline, and overdue AR signals select relevant cards
