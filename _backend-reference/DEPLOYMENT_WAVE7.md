# Wave 7 — Textract async extraction (NEEDS_REVIEW → PUBLISHED auto)

## What ships

- `Document` gets `externalJobId`, `extractionEngine`, `extractionConfidence`,
  `extractionWarnings`, `updatedAt`. Migration: `prisma/migrations/wave7_textract_async.sql`.
- `runIngestion` now persists `status=PROCESSING` + `externalJobId` when it
  hands off to Textract / Transcribe (via `deps.markProcessing`).
- `TextractProvider.fetchResult` returns the average OCR confidence so the
  callback worker can decide between `PUBLISHED` and `NEEDS_REVIEW`.
- `ingestion-callback.ts` implements the full SNS→SQS path: fetch result,
  finalize chunking + embeddings + indexing, persist final status.
- `worker.ts` starts both consumers in AWS mode (main queue + callback queue).
- Infra: `infra/aws/textract.tf` provisions SNS topic, SQS queue + DLQ,
  Textract service role, and the worker task IAM policy.
- UI: `KnowledgeBaseAdmin` shows a pulsing "OCR…" badge for `PROCESSING`
  documents and polls every 10 s until they resolve.

## Required environment variables

```
AWS_REGION=eu-west-3
S3_KNOWLEDGE_BUCKET=mp-knowledge-prod
SQS_INGESTION_QUEUE_URL=https://sqs.eu-west-3.amazonaws.com/.../mp-ingestion
SQS_INGESTION_CALLBACK_URL=https://sqs.eu-west-3.amazonaws.com/.../mp-ingestion-callback
TEXTRACT_SNS_TOPIC_ARN=arn:aws:sns:eu-west-3:...:mp-textract-callback
TEXTRACT_ROLE_ARN=arn:aws:iam::...:role/mp-textract-service
TEXTRACT_MIN_CONFIDENCE=0.7
```

The Terraform stack outputs `textract_sns_topic_arn`, `textract_service_role_arn`,
`sqs_ingestion_callback_url`, `sqs_ingestion_callback_dlq_url` — wire them into
the worker task definition as env vars.

## Deploy steps

1. `cd _backend-reference/infra/aws && terraform apply` — this adds the SNS
   topic, the SQS callback queue + DLQ, and the IAM policies. No replacement
   of existing resources.
2. `cd _backend-reference && bunx prisma migrate deploy` — applies
   `wave7_textract_async.sql`.
3. Redeploy the worker ECS service. The bootstrap auto-detects AWS mode
   (presence of `AWS_REGION` + `SQS_INGESTION_QUEUE_URL`) and starts both
   consumers.

## Verifying

- Upload a scanned PDF via `KnowledgeBaseAdmin` → row appears with badge
  `OCR…` (PROCESSING).
- CloudWatch: worker logs `worker_aws_mode`, then `ingestion_job_completed`
  with `status=PROCESSING externalJobId=...`.
- A few seconds / minutes later, Textract publishes to the SNS topic, SQS
  delivers the message, the worker logs `callback_persisted` and the badge
  flips to `PUBLISHED` (or `NEEDS_REVIEW` if confidence < `TEXTRACT_MIN_CONFIDENCE`).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Documents stuck at PROCESSING forever | SNS → SQS subscription not active, or Textract IAM role can't `sns:Publish`. Check `aws sns list-subscriptions-by-topic` and the role trust policy. |
| Messages pile up in DLQ | The worker can't reach Postgres or the callback handler throws. Tail worker logs for `[callback]` errors. |
| All callbacks land as NEEDS_REVIEW | `TEXTRACT_MIN_CONFIDENCE` too high, or the PDF is too low-quality. Inspect `extractionConfidence` on the row. |
| `loadJob returned null` | The Textract job was started before the schema migration, so `externalJobId` was never persisted. Re-upload the document. |

## Out of scope (next chantiers)

- Textract Tables / Forms (invoices, POs) — currently only `DetectText`.
- End-to-end Transcribe validation (the SQS path is wired but not load-tested).
- Step Functions migration (`stepfunctions/ingestion.asl.json` exists but
  remains opt-in).
