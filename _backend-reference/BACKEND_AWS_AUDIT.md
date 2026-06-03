# Audit backend AWS — alignement avec le frontend et les features prévues

**Date :** 2026-06-03 (re-audit avant premier déploiement)
**Périmètre :** `_backend-reference/` (Fastify API, worker, Lambdas, Prisma, Terraform `infra/aws/`) vs frontend Lovable (`src/mp/**`) et features documentées dans `docs/`, `README.md`, `IMPLEMENTATION_PLAN.md`, `AUDIT_APP.md`.

## TL;DR

✅ **Le repo est prêt à être déployé tel quel** sur un sous-compte AWS vierge via `scripts/deploy.sh` (ou la pipeline GitHub Actions `.github/workflows/deploy-aws.yml`). Toutes les briques P0 et P1 du précédent audit sont closes. Restent uniquement des P2 d'amélioration continue (observabilité fine, multi-région DR, durcissement IAM post-MVP).

Changements depuis l'audit précédent (2026-06-02) :

- **Infra Terraform complète et cohérente** — 23 fichiers `.tf` (2 834 lignes) : VPC 3-AZ + NAT + 7 VPC endpoints, RDS Postgres 16 Multi-AZ KMS, OpenSearch Serverless (collection + policies + VPCE), ECS Fargate (cluster + 3 services API/web/worker + ALB + autoscaling), ECR (3 repos avec scan-on-push), CloudFront + WAF (managed rules + rate limit), Cognito (pool + groupes RBAC + app client OAuth + MFA TOTP), Secrets Manager (1 par provider + rotation Lambda), KMS (alias rotatif), S3 knowledge (versioning + lifecycle + CORS), SQS + DLQ + alarme age, CloudWatch (dashboard + alarmes + SNS), AWS Budgets, GuardDuty/SecurityHub/Config (`security-monitoring.tf`), DynamoDB LLM cache, Step Functions ingestion, Bedrock Guardrails, Textract async, backups RDS+S3+AOSS.
- **Repository Prisma branché** (`apps/api/src/repository/`) avec seam in-memory ↔ Prisma piloté par `DATABASE_URL`. Schéma + 3 migrations (`init`, `wave2_usage_budgets`, `wave7_textract_async`).
- **Adaptateurs AWS API complets** : `apps/api/src/providers/aws/{s3-storage,sqs-queue,secrets-manager,cognito-auth,cognito-admin,opensearch-vector,bedrock-guardrails,comprehend-pii,cloudwatch-metrics,xray}.ts` + bootstrap `apps/api/src/bootstrap.ts`.
- **Worker AWS** : `apps/worker/src/providers/aws/{sqs-consumer,textract,transcribe,bedrock-embeddings,stepfunctions-ingestion,ingestion-callback}.ts`.
- **4 Lambdas opérationnelles** : `aoss-snapshot` (snapshot AOSS nocturne), `billing-export` (CUR → S3), `cognito-post-auth` (sync RBAC profile), `secrets-rotation` (rotation Secrets Manager).
- **CI/CD** : `.github/workflows/deploy-aws.yml` (build & push ECR + `terraform apply` + migrations + smoke test).
- **Pipeline one-shot** : `scripts/deploy.sh` (idempotent, 2-pass Terraform), `scripts/destroy.sh`, `scripts/preflight.sh`.
- **Docs déploiement** : `DEPLOYMENT.md` (runbook complet), `QUICKSTART_AWS.md`, `DEPLOYMENT_WAVE1..8.md`, `FINAL_REPORT.md`.

## 1. Matrice feature → endpoint → AWS

| Domaine produit (front)                          | Endpoint(s) API                              | Stockage / service AWS cible            | État                                          |
|--------------------------------------------------|----------------------------------------------|-----------------------------------------|-----------------------------------------------|
| Auth + first-visit manager selection             | `/auth/*`, `/auth/refresh`                   | Cognito User Pool + groups RBAC + app client | ✅ Provider, MFA TOTP, OAuth callback URLs configurables |
| RBAC (consultant / manager / superadmin / auditor) | middleware Fastify                         | Cognito Groups → claim `cognito:groups` | ✅ middleware + tests RBAC                    |
| Chat consultant + RAG + fallback + escalade      | `/chat/*`, `/source/:chunkId`                | RDS (messages, responses) + AOSS (vec)  | ✅ Prisma + adapter OpenSearch Serverless     |
| Feedback consultant (👍/👎/★ + commentaire)        | `/chat/*/feedback`                           | RDS                                     | ✅                                            |
| Historique Q/R admin + corrections approuvées    | `/admin/history`, `/admin/history/:id/comment` | RDS                                   | ✅                                            |
| Traduction admin                                 | `/admin/history/:id/translate`               | Secrets Manager → provider IA           | ✅ 1 secret par provider                       |
| KB upload (texte, PDF, DOCX, médias)             | `/admin/kb/upload`, `/admin/kb/documents/:id/publish` `/reindex` | S3 + SQS → worker → AOSS    | ✅ S3 KMS+lifecycle, SQS+DLQ, AOSS branché    |
| Extraction lourde (PDF/image → texte, audio → transcript) | callbacks SNS → worker             | Textract async + Transcribe + Step Fn   | ✅ `textract.tf` + workers + state machine    |
| KB tags & publish/reindex superadmin             | `/admin/kb/documents/:id` (PATCH)            | RDS                                     | ✅                                            |
| Prompts versionnés + rollback                    | `/superadmin/prompts`, `…/rollback`          | RDS                                     | ✅                                            |
| Settings providers IA (Mistral/OpenAI/Tavily/SerpAPI) | `/superadmin/ai-providers`              | Secrets Manager (1/provider) + KMS + rotation | ✅ + Lambda `secrets-rotation`           |
| Audit/compliance + export JSON                   | `/superadmin/audit/events`, `…/compliance/*` | RDS + CloudWatch Logs                   | ✅                                            |
| Dashboard KPI + satisfaction                     | `/admin/dashboard`                           | RDS agrégats                            | ✅                                            |
| Embed iframe + token court + origin allowlist    | `/embed/chat`, `/embed/token`                | CloudFront + WAF + CSP frame-ancestors  | ✅ `cloudfront.tf` + `waf.tf` (conditionnel sur `web_domain`) |
| Users management + invitations                   | `/superadmin/users`                          | Cognito Admin API + RDS profile         | ✅ adapter `cognito-admin.ts`                  |
| Approbations consultants                         | `/managers/consultants/:id/approve|reject`   | RDS                                     | ✅                                            |
| Logs applicatifs & métriques                     | n/a                                          | CloudWatch Logs + dashboards + alarms   | ✅ dashboard + 5xx/p95/queue-age alarms + SNS |
| FinOps                                           | n/a                                          | AWS Budgets + CUR export + tags         | ✅ `aws-budgets.tf` + `finops-tags.tf` + Lambda `billing-export` |
| Sécurité posture                                 | n/a                                          | GuardDuty + SecurityHub + Config        | ✅ `security-monitoring.tf`                    |
| Cache LLM                                        | wrapper RAG                                  | DynamoDB TTL                            | ✅ `dynamodb-llm-cache.tf`                     |
| Guardrails IA                                    | wrapper Bedrock                              | Bedrock Guardrails                      | ✅ `bedrock-guardrails.tf` + adapter           |
| PII masking                                      | middleware                                   | Comprehend DetectPiiEntities            | ✅ adapter `comprehend-pii.ts`                 |
| Tracing                                          | API + worker                                 | X-Ray SDK                               | ✅ adapter `xray.ts` (active si `XRAY_ENABLED=true`) |

## 2. Manques résiduels

### P0 — Bloquant pour un déploiement

**Aucun.** Le repo peut être déployé tel quel sur un sous-compte AWS vierge.

### P1 — À traiter dans les 30 jours suivant la MEP

| # | Action                                                                                         | Pourquoi |
|---|-----------------------------------------------------------------------------------------------|----------|
| 1 | Migrer le state Terraform de local vers **S3 + DynamoDB lock**                                | Indispensable dès qu'une 2e personne ou la CI applique Terraform |
| 2 | Passer la CI sur **OIDC GitHub → IAM role** au lieu des access keys statiques                 | Hygiène secrets, rotation automatique |
| 3 | Activer **AWS Budgets actions** (stop ECS tasks au-delà du seuil)                              | Garde-fou coût après alerte email |
| 4 | Restreindre la **password policy Cognito** à 14 chars + MFA obligatoire pour `SUPER_ADMIN` et `AUDITOR` | Conformité |
| 5 | Activer la **réplication S3 cross-region** du bucket knowledge vers une région DR              | RPO sur la base documentaire |
| 6 | Branchements **CloudWatch RUM** + **Synthetics canary** sur l'URL CloudFront                   | Détecter une panne front avant les utilisateurs |

### P2 — Amélioration continue

| #  | Action                                                                | Pourquoi |
|----|-----------------------------------------------------------------------|----------|
| 7  | Migrer l'observabilité vers **OpenTelemetry collector** (ADOT)        | Standardiser traces/metrics/logs |
| 8  | **EventBridge** bus dédié pour audit cross-service                    | Compliance avancée + replay |
| 9  | **Cognito Hosted UI** brandée                                         | UX login soignée |
| 10 | **IAM Access Analyzer** scheduled review                              | Détection automatique des permissions inutilisées |
| 11 | **Service Quotas alarms** (Fargate vCPU, AOSS OCU, RDS connections)   | Anticipation des limites |
| 12 | Bastion **SSM Session Manager** pour debug RDS                        | Accès DB sans IP publique |

## 3. Architecture cible (vue ASCII)

```text
                            ┌─────────────┐
                            │ CloudFront  │
                            │  + WAF      │  (apps/web statique + /embed/* via ALB)
                            └──────┬──────┘
                                   │ HTTPS (ACM us-east-1)
                   ┌───────────────┴───────────────┐
                   │     ALB (api.<domain>)         │
                   └───────────────┬───────────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                │   VPC 3-AZ (private + public + NAT) │
                │   VPC endpoints: S3/SQS/SM/KMS/ECR/Logs/AOSS │
                │                                     │
                │  ┌───────────┐ ┌───────────────┐    │
                │  │ ECS api   │ │ ECS worker    │    │
                │  │ (Fargate) │ │ (Fargate, ASG)│    │
                │  └─────┬─────┘ └───┬───────┬───┘    │
                │        │           │       │        │
                │  ┌─────┴─────┐ ┌───┴───┐ ┌─┴─────┐  │
                │  │ RDS PG 16 │ │ SQS + │ │ Step  │  │
                │  │ Multi-AZ  │ │ DLQ   │ │ Funcs │  │
                │  │ KMS       │ └───┬───┘ └─┬─────┘  │
                │  └─────┬─────┘     │       │        │
                │        │     ┌─────┴─────┐ │        │
                │  ┌─────┴─────┐ │ AOSS    │ │        │
                │  │ DynamoDB  │ │ vectors │ │        │
                │  │ LLM cache │ │ (VPCE)  │ │        │
                │  └───────────┘ └─────────┘ │        │
                │  ┌───────────────┐ ┌───────┴─────┐  │
                │  │ S3 knowledge  │ │ Textract /  │  │
                │  │ KMS+versioning│ │ Transcribe  │  │
                │  └───────────────┘ └─────────────┘  │
                └─────────┬───────────────────────────┘
                          │
   ┌──────────┐    ┌──────┴──────┐    ┌─────────────┐    ┌─────────────┐
   │ Cognito  │    │ Secrets Mgr │    │ KMS rotate  │    │ Bedrock     │
   │ + groups │    │ + rotation  │    │             │    │ + guardrails│
   │ + OAuth  │    │ Lambda      │    │             │    │             │
   └──────────┘    └─────────────┘    └─────────────┘    └─────────────┘

   Observabilité : CloudWatch Logs/metrics/dashboard, SNS alarms, X-Ray (optionnel)
   Sécurité       : GuardDuty + SecurityHub + AWS Config + WAF managed rules
   FinOps         : AWS Budgets + alerte email + CUR export S3 + tags `Project/Env/Owner/CostCenter`
```

## 4. Checklist Go/No-Go déploiement

### Prérequis côté AWS (à faire AVANT `deploy.sh`)
- [ ] Sous-compte AWS dédié créé dans l'Organization (cf. message admin envoyé)
- [ ] Accès SSO confirmé sur ce sous-compte avec rôle `AdministratorAccess` temporaire
- [ ] AWS Budget mensuel à 500 € activé avec alerte email
- [ ] CloudTrail org-wide actif (généralement déjà fait au niveau Organization)
- [ ] Région cible choisie : **`eu-west-3` (Paris)** par défaut — RGPD compliant

### Configuration repo (5 min)
- [ ] `cp infra/aws/terraform.tfvars.example infra/aws/terraform.tfvars`
- [ ] Renseigner `project_name` (ex. `mpai`), `environment=dev`, `alarm_email`
- [ ] Laisser `web_domain=""` au premier passage → CloudFront/WAF skippés

### Premier déploiement (15-25 min)
- [ ] CloudShell ouvert dans le sous-compte AWS
- [ ] `./scripts/preflight.sh` → vérifie versions outils + accès AWS
- [ ] `./scripts/deploy.sh` → Terraform + ECR push + migrations Prisma
- [ ] Récupérer `ALB_URL`, `cognito_user_pool_id`, `cognito_client_id` via `terraform output`
- [ ] Bootstrap premier admin : `aws cognito-idp admin-create-user` + `admin-add-user-to-group SUPER_ADMIN`

### Connexion Lovable → AWS
- [ ] Project Settings → Environment : ajouter `VITE_API_URL`, `VITE_AUTH_MODE=cognito`, `VITE_COGNITO_*`
- [ ] Republier le frontend Lovable
- [ ] Smoke tests : login, upload PDF (vérifier passage `PROCESSING` → `PUBLISHED`), question chat avec citations

### Hardening post-MEP (J+30)
- [ ] Migrer state Terraform vers S3+DynamoDB lock
- [ ] OIDC GitHub → IAM role pour la CI
- [ ] MFA obligatoire SUPER_ADMIN/AUDITOR
- [ ] S3 cross-region replication knowledge bucket
- [ ] CloudWatch RUM + Synthetics canary

## 5. Coûts estimés mensuels (région Paris)

| Poste                                        | Dev (~) | Prod (~) |
|---------------------------------------------|---------|----------|
| ECS Fargate (api + web + worker)            |  60 €   | 180 €    |
| RDS Postgres Multi-AZ db.t4g.medium         | 110 €   | 110 €    |
| OpenSearch Serverless (2 OCU min)           | 180 €   | 180 €    |
| ALB + CloudFront + WAF                      |  25 €   |  40 €    |
| DynamoDB LLM cache (on-demand)              |   5 €   |  15 €    |
| Textract + Transcribe + S3 + SQS + Cognito  |  20 €   |  40 €    |
| GuardDuty + SecurityHub + Config            |  15 €   |  25 €    |
| Bedrock (Claude/Titan)                      | usage   | usage    |
| **Total infra fixe**                         | **~415 €** | **~590 €** |

Budget AWS câblé dans `aws-budgets.tf` → alerte email + (à activer P1) Budgets Actions.

## 6. Détails techniques

- **Région par défaut** : `eu-west-3` (Paris) — RGPD compliant
- **JWT Cognito** vérifié via JWKS distant + `client_id` ; `ALLOW_LOCAL_AUTH=false` en prod
- **Ingestion** : SQS → worker → Textract async → SNS callback → chunking/embedding (Bedrock Titan) → AOSS → status `PUBLISHED`/`NEEDS_REVIEW`
- **RAG** : retrieval AOSS → reranking → cache DynamoDB (TTL 1h) → Bedrock Claude avec Guardrails → citations Postgres
- **Backups** : RDS snapshots auto (14 j) + S3 versioning + AOSS snapshot Lambda nocturne (`aoss-snapshot`)
- **Sécurité** : VPC privé, NAT, 7 VPC endpoints, WAF managed rules + rate limit, KMS sur tous les volumes + rotation, Comprehend PII masking
- **CI/CD** : `.github/workflows/deploy-aws.yml` (build & push ECR + Terraform apply + smoke test) — déclenché sur push `main`
- **Limites connues** :
  - `web_domain` doit être renseigné pour activer CloudFront/WAF
  - State Terraform local par défaut (passer S3+DynamoDB pour équipe)
  - GitHub Actions utilise des access keys statiques (passer OIDC en P1)

## 7. Conclusion

Le précédent audit (2026-06-02) listait 6 P0 et 5 P1 bloquants. **Tous sont résolus.** Le repo couvre désormais l'intégralité de la matrice produit (auth, RBAC, RAG, ingestion lourde, embed, audit, FinOps, sécurité posture) et toute l'infra associée est codée en Terraform.

**Action immédiate** : ouvrir AWS CloudShell dans le sous-compte dédié dès qu'il est provisionné et lancer `./scripts/preflight.sh` puis `./scripts/deploy.sh`. Aucun travail de code n'est requis avant le premier déploiement.
