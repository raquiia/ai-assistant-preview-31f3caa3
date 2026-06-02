# Audit backend AWS — alignement avec le frontend et les features prévues

**Date :** 2026-06-02
**Périmètre :** `_backend-reference/` (Fastify API, worker, Prisma, Terraform `infra/aws/`) vs frontend Lovable (`src/mp/**`) et features documentées dans `docs/`, `README.md`, `IMPLEMENTATION_PLAN.md`, `AUDIT_APP.md`.

## TL;DR

Le frontend est mûr et appelle des endpoints REST cohérents (mockés par défaut, branchables sur `VITE_API_URL`). Le code applicatif Fastify implémente les routes attendues, mais **deux gros chantiers bloquent un déploiement AWS réel** :

1. **L'API est encore in-memory** (`apps/api/src/state.ts`) — déployer tel quel sur ECS = appli amnésique à chaque restart.
2. **Le squelette Terraform est très incomplet** — seulement KMS + S3 + SQS + Cognito + Secrets + CloudWatch. Pas de VPC, ni RDS, ni ECS, ni OpenSearch, ni CloudFront/WAF, ni IAM scoping.

Ce document trace la correspondance feature → API → AWS, classe les manques en P0/P1/P2 et fournit une checklist de mise en production.

## 1. Matrice feature → endpoint → AWS

| Domaine produit (front)                          | Endpoint(s) API                              | Stockage / service AWS cible            | État actuel                                  |
|--------------------------------------------------|----------------------------------------------|-----------------------------------------|----------------------------------------------|
| Auth + first-visit manager selection             | `/auth/*`, `/auth/refresh`                   | Cognito User Pool + groups RBAC         | Pool + groupes OK, **App client + MFA + policy ajoutés (cf. hardening)** |
| RBAC (consultant / manager / superadmin / auditor) | middleware Fastify                         | Cognito Groups → claim `cognito:groups` | OK côté Cognito, scope dans l'API à valider  |
| Chat consultant + RAG + fallback + escalade      | `/chat/*`, `/source/:chunkId`                | RDS (messages, responses) + AOSS (vec)  | **RDS et AOSS absents du Terraform**          |
| Feedback consultant (👍/👎/★ + commentaire)        | `/chat/*/feedback`                           | RDS                                     | RDS absent                                   |
| Historique Q/R admin + corrections approuvées    | `/admin/history`, `/admin/history/:id/comment` | RDS                                   | RDS absent                                   |
| Traduction admin                                 | `/admin/history/:id/translate`               | Secrets Manager → provider IA           | Secret par provider (✅ après hardening)      |
| KB upload (texte, PDF, DOCX, médias)             | `/admin/kb/upload`, `/admin/kb/documents/:id/publish` `/reindex` | S3 + SQS → worker → AOSS    | S3 durci ✅, SQS+DLQ ✅, AOSS absent          |
| KB tags & publish/reindex superadmin             | `/admin/kb/documents/:id` (PATCH)            | RDS                                     | RDS absent                                   |
| Prompts versionnés + rollback                    | `/superadmin/prompts`, `…/rollback`          | RDS                                     | RDS absent                                   |
| Settings providers IA (Mistral/OpenAI/Tavily/SerpAPI) | `/superadmin/ai-providers`              | Secrets Manager (1 par provider) + KMS  | ✅ après hardening (`for_each`)               |
| Audit/compliance + export JSON                   | `/superadmin/audit/events`, `…/compliance/*` | RDS + CloudWatch Logs                   | Log groups ✅, RDS absent                     |
| Dashboard KPI + satisfaction                     | `/admin/dashboard`                           | RDS agrégats                            | RDS absent                                   |
| Embed iframe + token court + origin allowlist    | `/embed/chat`, `/embed/token`                | CloudFront + WAF + CSP frame-ancestors  | **CloudFront/WAF absents**                    |
| Users management + invitations                   | `/superadmin/users`                          | Cognito Admin API + RDS profile         | Cognito OK, RDS absent                       |
| Approbations consultants                         | `/managers/consultants/:id/approve|reject`   | RDS                                     | RDS absent                                   |
| Logs applicatifs & métriques                     | n/a                                          | CloudWatch Logs + dashboards + alarms   | Log groups ✅, dashboards/alarms partiels (queue age ajoutée) |

## 2. Manques classés

### P0 — Bloquant pour un déploiement

| # | Manque                                              | Impact                                                                 |
|---|-----------------------------------------------------|------------------------------------------------------------------------|
| 1 | **Repository in-memory** dans `apps/api`            | Aucune persistance, ECS = état perdu à chaque déploiement              |
| 2 | **Pas de RDS PostgreSQL** dans Terraform            | Aucun support de Prisma en prod                                        |
| 3 | **Pas de VPC** (subnets privés, NAT, VPC endpoints) | ECS/RDS/AOSS impossibles à placer correctement                         |
| 4 | **Pas d'ECS Fargate** (cluster, services, ALB)      | Pas de runtime pour `apps/api` ni `apps/worker`                        |
| 5 | **Pas d'OpenSearch Serverless** + adapter code      | Le RAG dégrade en mock, embeddings non persistés                       |
| 6 | **Pas d'IAM task roles scopés**                     | Sans rôles least-privilege, blocage sécurité avant prod                |

### P1 — Indispensable avant ouverture aux utilisateurs

| # | Manque                                                       | Pourquoi                                                  |
|---|--------------------------------------------------------------|-----------------------------------------------------------|
| 7 | **CloudFront + WAF** pour `apps/web` et `/embed/*`           | Performance, HTTPS managé, CSP `frame-ancestors`, anti-bot |
| 8 | **Extraction lourde** (PDF/DOCX/OCR/transcription)           | Sinon les uploads restent `NEEDS_REVIEW`                  |
| 9 | **Rotation Secrets Manager** (lambda)                        | Conformité, rotation périodique des clés IA               |
| 10 | **Alarmes CloudWatch** (5xx API, latence p95, queue age)    | Détection incident avant escalade utilisateur             |
| 11 | **Backups RDS + snapshots S3 cross-region**                 | RPO/RTO                                                   |

### P2 — Recommandé

| #  | Manque                                                | Pourquoi                                                   |
|----|-------------------------------------------------------|------------------------------------------------------------|
| 12 | X-Ray / OpenTelemetry sur API + worker                | Tracing RAG pipeline                                       |
| 13 | Step Functions pour le pipeline d'ingestion           | Visibilité étape par étape (extract → chunk → embed → index) |
| 14 | EventBridge pour audit cross-service                  | Compliance avancée                                         |
| 15 | Cognito Identity Pool + Hosted UI custom branding     | UX login soignée                                           |

## 3. Architecture cible (vue ASCII)

```text
                           ┌─────────────┐
                           │ CloudFront  │  (apps/web statique + /embed/* via ALB)
                           │  + WAF      │
                           └──────┬──────┘
                                  │ HTTPS
                  ┌───────────────┴───────────────┐
                  │   ALB (api.migso-pcubed)      │
                  └───────────────┬───────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │   VPC (private + public)      │
                  │                               │
                  │  ┌───────────┐ ┌───────────┐  │
                  │  │ ECS api   │ │ ECS       │  │
                  │  │ Fargate   │ │ worker    │  │
                  │  └─────┬─────┘ └─────┬─────┘  │
                  │        │             │        │
                  │  ┌─────┴─────┐ ┌─────┴─────┐  │
                  │  │  RDS PG   │ │   SQS +   │  │
                  │  │  (Prisma) │ │   DLQ     │  │
                  │  └───────────┘ └───────────┘  │
                  │        │             │        │
                  │  ┌─────┴─────┐ ┌─────┴─────┐  │
                  │  │ AOSS      │ │  S3       │  │
                  │  │ vectors   │ │ knowledge │  │
                  │  └───────────┘ └───────────┘  │
                  └────────┬──────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────┴─────┐      ┌─────┴─────┐      ┌─────┴─────┐
   │ Cognito  │      │ Secrets   │      │ KMS       │
   │ Pool +   │      │ Manager   │      │ (rotation)│
   │ groups   │      │ (per pro) │      │           │
   └──────────┘      └───────────┘      └───────────┘

   Observability: CloudWatch Logs (api/worker), metrics, alarms,
                  dashboards, optionnel X-Ray
```

## 4. Hardening appliqué dans ce commit

Modifications dans `infra/aws/main.tf`, `variables.tf`, `outputs.tf` :

- **KMS** : alias nommé `alias/<name>-secrets`.
- **S3 knowledge** : `public_access_block`, chiffrement KMS par défaut + bucket key, CORS pour PUT présigné, lifecycle (versions non-courantes 90 j, abort multipart 7 j).
- **SQS** : ajout d'une **DLQ** + `redrive_policy` (maxReceiveCount=5) + alarme CloudWatch `ApproximateAgeOfOldestMessage > 600 s`.
- **Cognito** : password policy (12 chars, mixed), MFA optionnel via TOTP, `account_recovery` email, **App Client OAuth** (callback/logout URLs configurables).
- **Secrets Manager** : un secret par provider (`mistral`, `openai`, `tavily`, `serpapi`) avec version placeholder ignorée au diff.
- **Outputs** : ARN du bucket, DLQ, app client Cognito, KMS, et map des secrets IA.
- **Placeholders structurés** (commentés) pour RDS Postgres, OpenSearch Serverless, ECS Cluster, deux CloudFront (web + embed) — visibles dans le `main.tf` comme TODO listés.

## 5. Checklist de mise en production

### Code applicatif (à faire avant le déploiement AWS)

- [ ] Remplacer `apps/api/src/state.ts` par une implémentation Prisma branchée sur RDS.
- [ ] Implémenter l'adapter `VectorProvider` OpenSearch Serverless (signed requests, mapping).
- [ ] Implémenter l'adapter `StorageProvider` S3 + signed URLs (PUT côté admin).
- [ ] Implémenter l'adapter `QueueProvider` SQS (worker en consommateur long-poll).
- [ ] Implémenter l'adapter `SecretProvider` Secrets Manager (cache 5 min, KMS decrypt).
- [ ] Adapter `AuthProvider` Cognito : vérification JWT (JWKS), mapping groupes → rôles app.
- [ ] Extraction lourde : Lambda Textract (PDF/image), Transcribe (audio/video), libs DOCX/PPTX/XLSX.
- [ ] Tests RBAC, fallback, embed allowlist, masking clés API, NEEDS_REVIEW workflow.

### Infra (à compléter dans Terraform)

- [ ] Module VPC (3 AZ, subnets privés/publics, NAT, VPC endpoints S3 + SM + KMS + ECR + Logs + AOSS).
- [ ] RDS PostgreSQL Multi-AZ + subnet group + SG + parameter group + automated backups 14 j + deletion protection.
- [ ] OpenSearch Serverless collection `VECTORSEARCH` + encryption/network/data access policies.
- [ ] ECS Cluster + Task Definitions api/web/worker + Services + ALB + target groups + autoscaling.
- [ ] IAM task roles scopés par service (S3 path-level, SQS queue ARN, secrets ARN, AOSS collection, KMS).
- [ ] CloudFront `web` (origin S3) + CloudFront `embed` (origin ALB) + WAF web ACL + response headers policy (CSP, HSTS, frame-ancestors par env).
- [ ] Route 53 zones + ACM certificates (us-east-1 pour CloudFront).
- [ ] Secrets Manager rotation lambdas pour chaque provider IA.
- [ ] CloudWatch dashboards (API p95, RAG latency, queue depth, fallback rate, satisfaction) + alarmes SNS.
- [ ] Backups : RDS snapshots cross-region, S3 replication knowledge bucket vers région DR.

### Sécurité & conformité

- [ ] GuardDuty + Security Hub + Config + AWS Inspector activés.
- [ ] CloudTrail org-wide vers S3 chiffré + Athena.
- [ ] KMS rotation activée (✅ déjà), policies KMS least-privilege.
- [ ] Review IAM Access Analyzer trimestrielle.
- [ ] Audit Cognito : MFA obligatoire pour `SUPER_ADMIN` et `AUDITOR`.

## 6. Conclusion

L'écart entre `_backend-reference/` et un déploiement AWS productif reste **significatif mais bien cadré** : tous les contrats applicatifs et les boundaries provider sont en place côté code, le Terraform a maintenant un socle durci (S3/SQS/Cognito/Secrets/KMS) et liste explicitement les briques manquantes (RDS, ECS, AOSS, CloudFront/WAF, VPC). Les deux prochains jalons logiques :

1. **Brancher Prisma → RDS** (P0 #1 + #2) — sans cela, le reste de l'infra n'apporte rien.
2. **Provisionner VPC + ECS + RDS** (P0 #3 + #4 + #6) — premier vrai environnement déployable.

Le frontend Lovable continue de tourner sur mocks et basculera sans changement de code en pointant `VITE_API_URL` sur l'ALB une fois ces deux jalons franchis.
