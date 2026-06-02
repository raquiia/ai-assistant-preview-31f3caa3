# Architecture

## Product Surface

The application exposes three integration surfaces:

- Dedicated web platform: `apps/web`
- Secure iframe/widget surface: `/embed/chat` and `/embed/token`
- Internal REST API: `apps/api`

The primary user journey is consultant chat with source transparency. Admin and superadmin journeys expose history, comments, corrections, prompts, AI provider configuration, audit events and exports.

## Logical Modules

`apps/api` groups the requested modules behind route families:

- `AuthModule`: `/auth/*`, local login, refresh token, first-visit manager selection.
- `AccessControlModule`: `canViewConversation`, `canUploadKnowledge`, `canManageUsers`, `canViewAudit`.
- `ChatModule`: `/chat/*`, messages, feedback, retry fallback.
- `AiOrchestrationModule`: `packages/ai`, prompt builder, providers, model router and quality gate.
- `RagModule`: `packages/rag`, hybrid retrieval and taxonomy.
- `KnowledgeBaseModule`: `/admin/kb/*`, document upload, publish and reindex.
- `SourceViewerModule`: `/source/:chunkId`.
- `AdminModule`: `/admin/history`, `/admin/dashboard`.
- `SuperAdminModule`: `/superadmin/*`.
- `AuditComplianceModule`: `/superadmin/audit/events`, `/superadmin/compliance/*`.
- `AnalyticsModule`: dashboard KPIs.
- `WidgetModule`: `/embed/*`.

## Response Pipeline

1. Detect language and capture the consultant message.
2. Run hybrid retrieval over published chunks and active corrections.
3. If no KB source is available, call the configured `SearchProvider`.
4. Build a versioned prompt with user context, sources, approved guidance and safety rules.
5. Route to Mistral first.
6. Route to OpenAI fallback when requested or when the quality gate fails.
7. Apply quality gate, confidence scoring and human escalation.
8. Persist response metadata, usage, retrieval events and audit events.
9. Return answer, sources and feedback actions.

## Provider Boundaries

The code avoids tying business logic to one infrastructure provider:

- `AiProvider`: Mistral, OpenAI and local grounded provider.
- `SearchProvider`: mock, OpenAI hosted, Tavily, SerpAPI contracts.
- `VectorProvider`: mock vector provider now; OpenSearch adapter next.
- `SecretProvider`: local AES-GCM provider now; AWS Secrets Manager/KMS next.
- `StorageProvider`: worker local object storage contract now; S3/MinIO adapter next.
- `QueueProvider`: in-memory/BullMQ contract now; SQS/EventBridge next.
- `ObservabilityProvider`: console now; CloudWatch/OpenTelemetry next.

## Data Model

Prisma models cover users, manager profiles, conversations, messages, attachments, responses, usage, feedback, admin comments, approved corrections, documents, chunks, retrieval events, prompt versions, provider configs, audit events and metrics.

Important indexes:

- Conversation visibility by user/manager/date.
- Document status/language and chunk taxonomy tags.
- AI response provider/model/fallback/escalation.
- Audit action/entity timelines.

## Heavy Feature Contracts

The MVP includes interfaces and route contracts for files that require heavier processing:

- PDF extraction
- DOCX/PPTX/XLSX normalized HTML rendering
- OCR for images
- Audio/video transcription with timecodes
- OpenSearch vector indexing
- Live external web search

For local MVP safety, unsupported extraction paths create `NEEDS_REVIEW` documents rather than inventing extracted content.
