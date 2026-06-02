# Implementation Plan

## Critical Fixes

1. Replace or clearly isolate the in-memory repository.
2. Keep seeds minimal and avoid fake KPI or fake conversations in the main flow.
3. Keep dashboard, history and KB screens empty-state first unless real data exists.
4. Keep the chat, admin tables and side panels readable on narrow screens.
5. Make sure KPI are only shown when they come from actual data.

## UX / UI Improvements

1. Keep the admin shell premium, dense and readable.
2. Keep the collapsible sidebar icon-first when compressed.
3. Prefer icons and compact labels where text can overflow.
4. Stabilize cards, tables and forms on smaller screens.
5. Preserve the improved login, manager selection, chat, source viewer and embed preview.

## Backend Improvements

1. Clarify repository responsibilities and persistence boundaries.
2. Finish document upload flows with validation, status and reindex actions.
3. Keep the no-source case explicit and avoid hallucinations when KB and search are unavailable.
4. Strengthen server-side RBAC and user-visible error handling.

## Security and RBAC

1. Keep API keys masked everywhere.
2. Maintain iframe origin allowlists and short-lived embed tokens.
3. Prepare rate limit and audit hooks for sensitive actions.
4. Keep server-side enforcement for consultant, manager, superadmin and auditor.

## Database / Domain

1. Validate the alignment between the in-memory state and Prisma contracts.
2. Keep indexes and relations coherent for conversations, users, responses, feedback, documents and audit events.
3. Preserve versioning for prompts and knowledge corrections.

## RAG / AI

1. Keep Mistral as the primary provider and OpenAI as the fallback.
2. Do not call providers directly from the frontend.
3. Keep the model from inventing when no reliable source exists.
4. Keep the prompt editor richer: tone, source policy, web search, code of conduct, escalation, citations and language policy.

## Testing

1. RBAC consultant / manager / superadmin / auditor.
2. Empty states for dashboard, KB and chat.
3. Negative feedback and fallback retry.
4. Upload document and needs-review workflow.
5. Embed origin validation.
6. API keys never returned in clear text.

## Validation Commands

1. `npm install`
2. `npm run lint`
3. `npm run test`
4. `npm run build`
5. `npm run db:generate`
6. `npm run db:migrate`
7. `docker compose config`
8. `docker compose up`

## Recommended Execution Order

1. Clean the data model and empty states.
2. Tighten the responsive shell and admin surfaces.
3. Finish the backend workflows around documents and corrections.
4. Validate build, tests and security-sensitive routes.
5. Prepare the eventual Prisma-backed persistence layer.
