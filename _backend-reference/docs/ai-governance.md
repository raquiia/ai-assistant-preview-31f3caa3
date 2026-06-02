# AI Governance

## System Card

Purpose: internal assistant for MIGSO-PCUBED consultants working in industrial project management, PMO and Project Controls.

Users:

- Consultants ask questions and provide feedback.
- Managers review their attached consultants' conversations.
- Super admins configure users, prompts, providers and system settings.
- Auditors read audit and compliance data.

Processed data:

- User identity and manager relationship.
- Questions, answers, feedback and admin comments.
- Uploaded documents and extracted chunks.
- Retrieval events, model metadata, token usage and latency.

## Core Controls

- RBAC is enforced by the API.
- Internal KB sources are prioritized.
- Answers based on KB must include source metadata.
- Relevance score is labelled as estimated relevance, not truth probability.
- If confidence is low or no reliable source is available, the assistant escalates to a manager.
- Admin comments do not fine-tune automatically. They become `KnowledgeCorrection` records only after approval.
- API keys are saved through a secret provider and returned only as masked values.
- Audit events record login, prompt changes, API key changes, document actions, comments, exports and access denials.

## Prompt Registry

The default system prompt is versioned as `prompt-default-v1`. Super admins can create new versions and roll back. Each response stores the prompt version used.

## Model Registry

Provider configs store provider name, model slug, active status and config JSON. The local MVP includes:

- Mistral primary: `mistral-large-latest`
- OpenAI fallback: `gpt-5.5`
- Local grounded provider when no key is configured

## Data Lineage

Document lineage path:

```text
Document -> extraction/OCR/transcription -> DocumentChunk -> vectorId -> RetrievalEvent -> AiResponse
```

Correction lineage path:

```text
AdminComment -> KnowledgeCorrection APPROVED -> ACTIVE -> DocumentChunk -> RetrievalEvent
```

## Retention And Export

The MVP exposes JSON export through `/superadmin/compliance/export`. Production should add configurable retention windows, legal hold controls and signed export bundles.

## Future Fine-Tuning

No automatic fine-tuning is performed. Future fine-tuning datasets should be exported from approved corrections only, reviewed by a human owner and versioned separately from runtime prompts.
