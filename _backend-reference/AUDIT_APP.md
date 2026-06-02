# Audit Application

Date: 2026-06-01

## Resume

The application is already much more than a mockup. It is a TypeScript monorepo with a web UI, a Fastify API, an ingestion worker, Prisma contracts, architecture docs and AWS-ready provider boundaries.

The biggest remaining gap is persistence: the active runtime still uses an in-memory repository. That said, the seed has been reduced to the minimum development accounts, fake KPI and fake conversation content have been removed from the main flow, and the UI now relies much more on clean empty states.

## Current Architecture

- npm workspaces with `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/ai`, `packages/rag`, `packages/config`.
- React/Vite frontend in TypeScript with Tailwind CSS and componentized business screens.
- Fastify API in TypeScript with auth, RBAC, chat, admin, audit, KB and embed endpoints.
- Dedicated worker shell for ingestion.
- Prisma schema with rich domain entities and useful indexes.
- Docker Compose for PostgreSQL, Redis, OpenSearch and MinIO.
- Docs for architecture, governance, embed and AWS migration paths.

## Strong Points

- Local login, refresh token and initial manager selection.
- Server-side RBAC for consultant, manager, superadmin and auditor.
- Chat with language detection, internal retrieval, citations, confidence, fallback and escalation.
- KB upload, chunking, source viewer and review workflow.
- Admin history, comments, translations and active corrections.
- API key masking in UI and API responses.
- Audit/compliance center and JSON export.
- Embed iframe endpoint with origin allowlist.
- Stronger enterprise UI shell: collapsible sidebar, mobile panels, better empty states, improved spacing and typography.

## Remaining Gaps

- The active repository is still in-memory, so state is not durable across restarts.
- PDF, DOCX, audio and video ingestion contracts exist, but real extraction/transcription remains limited or simulated.
- There is no active S3/MinIO object storage integration yet.
- There is no durable queue backend yet.
- There is no persisted vector store wired to OpenSearch or pgvector yet.
- Admin translation still depends on future provider work.
- Dense tables and panels still need care on narrower screens, even though the responsive pass is much better now.

## Technical Debt

- The in-memory repository blocks real persistence and restart recovery.
- Some business screens still need a persistence-backed model before they can be used operationally.
- Prompt versioning and admin correction workflows are richer now, but still need stronger governance and review tooling.
- Preview content must remain clearly separated from real operational data.

## Data Policy

- The seed now contains only the minimal development accounts.
- There are no fake conversations, fake KPI, fake history entries or fake knowledge base documents in the main flow.
- Empty states must stay explicit until real operational data exists.

## Priority Fixes

1. Replace the in-memory repository with a real Prisma-backed implementation or document the memory mode more explicitly.
2. Finish document ingestion for extraction, transcription and retrieval.
3. Add a real persistent vector layer.
4. Strengthen advanced admin and audit workflows.
5. Continue hardening the responsive UI, especially for narrow screens and dense tables.
6. Expand automated tests around RBAC, empty states, fallback, uploads and embed security.
