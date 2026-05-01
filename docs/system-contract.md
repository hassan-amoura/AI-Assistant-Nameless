# ai-assistant-nameless System Contract

This document defines the current product contract for safe refactoring. It is a guardrail for preserving the existing product while evolving it toward tenant-aware, action-capable Projectworks intelligence.

## 1. Product Identity

ai-assistant-nameless is an AI operating intelligence layer for Projectworks and professional services firms.

It is not a generic chatbot, and it is not only a T-SQL or report builder. SQL/reporting is one capability inside a larger assistant that should understand tenant operating data, apply professional-services methodology, surface what matters, coach users, prepare follow-up actions, and eventually execute approved actions through safe provider integrations.

Refactors must preserve the product thesis: make good consultants great and great consultants unstoppable. Do not reduce the assistant to passive recommendations or generic report generation.

## 2. Current Action Truth

The system does not execute real Projectworks write actions today.

Current state:

- No Projectworks API client exists.
- No MCP client or server exists.
- Safe action preview and execute routes exist, but they do not perform real writes.
- No real write actions are implemented.
- A server-side Action Registry exists for action metadata and policy evaluation.
- A disabled Action Executor shell exists and safely returns capability unavailable without provider execution.
- The Action Drawer is a UI shell for proposed actions and confirmation UX.
- The Action Drawer apply flow is currently simulated intent only.
- Autonomy modes exist in the UI and are represented in server-side runtime context and action policy, but no real writes are available.
- Capabilities are backed by a server-side registry and displayed in Settings.
- Capabilities, autonomy, coaching style, and firm goal are injected into chat runtime context as dynamic prompt content.
- The assistant is advisory for write actions until an explicit action provider is available.

Do not claim that a write action completed unless the application has an explicit successful API, MCP, or tool result for that action. Simulated or proposed actions must remain visibly distinct from production execution.

## 3. Future Action Target

The target architecture for write capability is:

- Capability Registry: describes which read, write, provider, tenant, and user capabilities are available at runtime.
- Action Registry: defines allowed action types, required fields, sensitivity, confirmation requirements, and provider support.
- Action Executor: performs validated actions through an adapter only when a real provider is configured.
- Policy and autonomy enforcement: applies notify, propose-and-confirm, and future auto-apply behavior server-side.
- Confirmation flow: shows proposed actions before execution and requires explicit confirmation for sensitive work.
- Audit log: records requested, proposed, confirmed, rejected, executed, failed, and unavailable actions.
- API/MCP provider layer: connects to Projectworks API or MCP later without changing product semantics.

Until those pieces exist, execution endpoints must safely return capability unavailable when action capability is not configured.

The current executor uses a disabled Projectworks action provider. It may preview and evaluate action policy, but execution must fail safely until a real provider returns an explicit success result.

## 4. Critical Contracts

### Streaming Contract

`/api/chat` streams Anthropic-shaped SSE bytes to the browser. The frontend parser expects `data:` lines containing Anthropic `content_block_delta` events with `text_delta` payloads.

Do not change the streaming event shape, buffering behavior, endpoint name, or frontend stream parser casually. Any provider abstraction must either preserve this browser contract or update the frontend and tests in the same change.

### SQL Extraction Contract

Assistant SQL responses are parsed from:

- A `<reasoning>...</reasoning>` block.
- A fenced `sql` code block.

The SQL contract requires T-SQL for Microsoft SQL Server and Metabase. Do not change AGENTS.md SQL output rules, reasoning tags, or SQL fence assumptions without updating the parser and validation tests.

### Insight Object Contract

Insight objects must preserve backward-compatible fields used by the UI:

- `id`
- `stableIdentity`
- `userId`
- `type`
- `metric`
- `cadence`
- `audience`
- `title`
- `body`
- `severity`
- `action`
- `read`
- `dismissed`
- `situationTitle`
- `decisionBridge`
- `primaryAction`
- `secondaryOptions`
- `facts`
- `generatedCopy`
- `cacheExpiresAt`
- `schemaVersion`

New insight schemas must include safe fallbacks for existing cards, badges, split buttons, Action Drawer logic, and review-in-chat flows.

Insight internals are facts-first. Generated insights should carry a stable raw `facts` object and set `generatedCopy: null` until model-generated copy is deliberately wired. Legacy render fields must remain populated so the current Your Assistant cards can render without frontend changes. Do not rename existing `type` values such as `benchmark_gap`, `missing_behavior`, `at_risk`, or `reminder`; future fact categories belong in `stableIdentity` and `facts`, not as breaking UI type changes.

### Saved Conversation and LocalStorage Contract

Conversations and saved reports are currently browser-local. The current saved conversation shape includes conversation id, title, messages, SQL, reasoning, saved report metadata, report-library state, and pinned state.

Do not change localStorage keys or stored conversation shape without a migration. Server-side conversation persistence must preserve existing user data and not break new chat, saved reports, report library, pinned conversations, archive, delete, or UI snapshot behavior.

### Settings Preferences Contract

The following preferences are active product surfaces and must not become dead UI:

- `assistantAutonomy`
- `coachingStyle`
- `firmGoal`

They must remain visible, save correctly, and influence the appropriate runtime behavior as the system evolves. File-backed and Postgres-backed persistence currently support these values.

### Capability Status Contract

Capabilities shown in Settings are product commitments and must stay truthful. A displayed capability must not imply execution is live unless runtime capability checks confirm it.

Capability status is backed by the server-side Capability Registry. `/api/integrations/status` must remain compatible with the existing Settings UI, and `/api/capabilities/runtime` exposes the fuller runtime capability object for future prompt and action wiring.

Capability status should eventually be injectable into the model runtime so the assistant can distinguish:

- available read capabilities
- unavailable write capabilities
- configured providers
- tenant-level permission
- user-level permission
- required confirmation
- safe unavailable responses

### Runtime Context Contract

Chat prompts include a concise dynamic `<runtime_context>` block containing user autonomy, coaching style, firm goal, user role when available, tenant identity/source when available, capability summary, and action policy reminders.

This block is per-request and must not be added to cached prompt blocks. It must not dump raw capability objects, tenant records, environment details, hostnames, secrets, raw errors, or provider internals.

The runtime block must state that Projectworks write actions are unavailable unless runtime capabilities explicitly say otherwise. The assistant may prepare, validate, and propose unavailable actions, but must not claim write completion without a successful action result.

### Knowledge Source Registry Contract

Structured coaching knowledge lives in `server/lib/knowledge`. The registry contains compact knowledge cards for benchmarks, Projectworks Method, founder/operator playbooks, internal notes, and product policies.

The registry is static and local. Sources must not require model calls, API calls, MCP access, database reads, network access, or raw document retrieval. New source modules should summarize product-safe principles into cards and declare `requiresModel: false` and `requiresApi: false`.

Knowledge cards are selected through `selectRelevantKnowledge({ tenantSnapshot, insight, userMessage, userRole, limit })`. Selection may consider tenant maturity, firm stage, role, insight type, domain, topics, and user-message keywords. Selected cards are advisory context only; they do not imply that Projectworks write actions are available.

Do not dump raw PDFs, source documents, or long passages into prompts. Add future COO, founder, or internal context as new source modules with validated card shapes.

### Model Provider Contract

Model calls should flow through a small provider abstraction for text, JSON, and streaming use cases. Anthropic remains the default provider, and the existing Anthropic compatibility facade must keep working for current chat, intake, title generation, and memory extraction paths.

`/api/chat` streaming must continue to emit Anthropic-shaped SSE events unless the frontend parser is deliberately migrated in the same change. Prompt caching behavior belongs to the Anthropic compatibility path and must not be removed during provider refactors.

OpenAI is scaffolded as an optional provider boundary, but it must not be treated as live runtime capability until it has an implemented, verified adapter. Gemini should be added later through the same provider interface rather than mixed into action or tenant-data code.

### Action Drawer Contract

The Action Drawer is the future confirmation and execution shell. Do not remove it, flatten it into plain chat advice, or replace it with manual instructions.

The drawer must continue to support proposed action items, selected item review, split buttons, secondary options, confirmation-oriented copy, and future execution routing. When execution is unavailable, the UX must communicate that safely without pretending the action completed.

## 5. Regression Red Lines

Do not:

- Change `/api/chat` streaming behavior casually.
- Change frontend stream parsing without coordinating the server contract.
- Change AGENTS.md SQL format casually.
- Rename insight fields without backward-compatible fallbacks.
- Change localStorage conversation or saved report shapes without migration.
- Remove the Action Drawer.
- Remove autonomy modes.
- Remove the capability screen.
- Represent simulated actions as real execution.
- Claim live Projectworks API or MCP access while mock data is still in use.
- Rename public routes unless explicitly requested.
- Reformat unrelated files during scoped refactors.
- Introduce banned naming for the future assistant surface.

## 6. Safe Refactor Sequence

Recommended sequence:

1. Audit current behavior and contracts.
2. Introduce Tenant Intelligence Snapshot boundaries around mock and future tenant data.
3. Add a Capability Registry with truthful runtime capability state.
4. Add an Action Registry with action schemas, sensitivity, and confirmation requirements.
5. Inject runtime context into model prompts, including capabilities, preferences, tenant identity, and action availability.
6. Add a Model Provider abstraction while preserving the existing browser streaming contract.
7. Add a Knowledge Source Registry for Projectworks Method, benchmarks, founder/operator principles, and workspace knowledge cards.
8. Move methodology and insights toward normalized facts first, then assistant copy.
9. Build the assistant thread and operating feed on stable insight/action/event records.
10. Refine UI last, preserving existing report library, settings, login/logout, saved reports, localStorage conversations, streaming, Action Drawer, and sidebar behavior.

Every step should be small, reversible, and validated against this contract before moving to the next.
