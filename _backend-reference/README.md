# MIGSO-PCUBED AI Assistant

Local-first enterprise chatbot for MIGSO-PCUBED consultants, built as a TypeScript monorepo with clean provider boundaries for a future AWS migration.

## Quick Start

Prerequisites: Node.js 22+, npm, Docker Desktop.

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis opensearch minio
npm run db:migrate
npm run seed
npm run dev
```

Open:

- Web: `http://localhost:5173`
- API health: `http://localhost:4000/health`
- MinIO console: `http://localhost:9001`
- OpenSearch: `http://localhost:9200`

You can also run the whole stack with:

```bash
docker compose up --build
```

## Development Accounts

The local seed now keeps only the minimum set of development accounts and no fake conversations, KPIs or knowledge base content in the main flow.

- `consultant1@migso-pcubed.local`
- `manager.a@migso-pcubed.local`
- `superadmin@migso-pcubed.local`
- `auditor@migso-pcubed.local`

Default password: `password123`.

## What Works In The MVP

- Local login, refresh token, manager selection, RBAC enforced in API routes.
- Consultant chat with language detection, internal KB retrieval, citations, confidence, fallback and escalation.
- Admin history with filters-ready data, comments, translation and approved correction activation.
- Superadmin user management, prompt versioning/rollback, model settings and API key storage with masking.
- KB text upload and chunking; PDF/media upload contracts are present and marked `NEEDS_REVIEW` until extraction, OCR or transcription adapters are enabled.
- Source viewer with chunk highlight metadata.
- Audit/compliance center and JSON export.
- Embed iframe endpoint, short-lived token and origin allowlist enforcement.
- Worker ingestion pipeline and provider interfaces for storage, queues and observability.
- Prisma schema, Docker Compose and AWS Terraform skeleton.
- Empty states are now explicit for conversations, KB, KPI and provider configuration.

## Scripts

```bash
npm run dev
npm run dev:web
npm run dev:api
npm run dev:worker
npm run test
npm run lint
npm run db:migrate
npm run seed
npm run ingest:sample
```

## Architecture

```text
apps/web       React/Vite UI
apps/api       Fastify API, auth/RBAC, chat, admin, audit, embed
apps/worker    ingestion worker shell
packages/ai    model providers, prompt builder, quality gate, search providers
packages/rag   chunking, taxonomy, hybrid retrieval, vector provider contract
packages/shared contracts, seed data, validators, RBAC helpers
packages/config branding and runtime defaults
prisma         database schema, migration and seed
infra/docker   local stack notes
infra/aws      Terraform skeleton for AWS migration
docs           architecture, governance and embed docs
```

See [docs/architecture.md](docs/architecture.md), [docs/ai-governance.md](docs/ai-governance.md), and [docs/embed.md](docs/embed.md).

Design concept used for the first implementation pass: [docs/assets/ui-concept.png](docs/assets/ui-concept.png).

## AWS Migration Path

The MVP is intentionally local-first. Provider interfaces are already named for the target AWS services:

- `StorageProvider`: MinIO now, S3 later.
- `AuthProvider`: local auth now, Cognito later.
- `VectorProvider`: local retrieval/OpenSearch local now, OpenSearch Serverless later.
- `SecretProvider`: local AES-GCM now, Secrets Manager/KMS later.
- `QueueProvider`: in-memory/BullMQ contract now, SQS/Lambda/EventBridge later.
- `ObservabilityProvider`: console logs now, CloudWatch/OpenTelemetry later.

The active API repository is still in-memory for now so the app runs immediately. Prisma is included as the persistence contract and can be promoted to the active repository implementation next.

## Security Notes

- No hardcoded production secret.
- API keys are never returned in clear text after save.
- RBAC checks are server-side.
- Upload MIME types are allowlisted.
- Prompt injection guard is included in the default prompt and quality gate.
- Embed origins are checked before issuing iframe content or tokens.
- Audit events are append-only in the application layer.
