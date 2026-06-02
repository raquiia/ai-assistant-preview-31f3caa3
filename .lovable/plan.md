# Ce qui reste pour une prod AWS complète

Les **Vagues 1-3** (déjà livrées dans `_backend-reference/`) couvrent : Cognito + JIT, RAG Bedrock/AOSS, Secrets Manager pour les clés IA, comptabilité tokens/USD, budgets, rate-limit, quotas modèles, Step Functions, X-Ray, export Stripe.

Reste à planifier **3 vagues** pour atteindre une vraie prod : sécurité/RGPD/réseau, UX ops, multi-tenant + ops industrialisées.

---

## Vague 4 — Sécurité, RGPD, réseau, sauvegardes

Le plus critique avant ouverture clients.

### 4.A Réseau privé end-to-end (VPC endpoints)
- VPC endpoints (PrivateLink) pour : `bedrock-runtime`, `bedrock`, `s3` (gateway), `secretsmanager`, `kms`, `sqs`, `sns`, `textract`, `transcribe`, `aoss`, `logs`, `ecr.api`, `ecr.dkr`, `sts`.
- Plus aucun appel AWS depuis l'ECS ne sort vers Internet → réduit coût NAT + surface d'attaque.
- Security groups stricts : ECS tasks ↔ RDS, ECS ↔ AOSS, ECS ↔ Redis (Vague 6).
- Fichier : `infra/aws/network.tf` (extension), nouveau `infra/aws/vpc-endpoints.tf`.

### 4.B WAF + protection L7
- `AWS WAFv2` devant l'ALB / CloudFront avec :
  - règles managées (Core, KnownBadInputs, SQLi, BotControl light)
  - rate-rule 1000 req/5min/IP sur `/auth/*` et `/chat`
  - geo-blocking optionnel (whitelist FR/EU)
- Fichier : `infra/aws/waf.tf`.

### 4.C Conformité & détection
- **CloudTrail** organisation-wide vers bucket S3 chiffré KMS + Log Insights.
- **AWS Config** : rules `s3-bucket-public-read-prohibited`, `rds-storage-encrypted`, `iam-password-policy`, `restricted-ssh`.
- **GuardDuty** activé + findings vers SNS ops.
- **Security Hub** agrégateur (CIS AWS Foundations + AWS Foundational Best Practices).

### 4.D RGPD : PII redaction avant LLM
- Service `services/piiRedactor.ts` :
  - 1ère passe regex (email, IBAN, NIR, téléphone, IP).
  - 2ème passe `Amazon Comprehend DetectPiiEntities` (FR + EN).
  - Remplacement par tokens `<EMAIL_1>`, restauration côté réponse via map.
- Appelé dans `chatService.ask()` avant Bedrock + dans worker avant embeddings.
- Audit : event `pii.redacted` avec compteur (pas le contenu).
- Toggle par tenant : `Org.piiRedactionEnabled`.
- Bedrock Guardrails : créer un guardrail (denied topics, PII filter, profanity) et l'attacher aux `InvokeModel` via `guardrailIdentifier`.

### 4.E Sauvegardes & disaster recovery
- **RDS** : PITR 14 j + snapshot quotidien cross-region (eu-west-3 → eu-west-1) via `aws_db_instance_automated_backups_replication`.
- **S3 knowledge bucket** : versioning ON + lifecycle (cleanup 90j de versions non-current) + `replication_configuration` cross-region.
- **AOSS** : snapshots quotidiens (`aws_opensearchserverless_*` ne fait pas de snapshot natif → cron Lambda `aoss-snapshot` qui `_snapshot/repo` vers S3 chiffré).
- **Secrets Manager** : `RecoveryWindowInDays = 30`.
- Runbook `docs/runbooks/dr-restore.md` : RPO 1 h, RTO 4 h.

### 4.F Secrets opérationnels (au-delà des clés IA)
Tous les secrets restants (actuellement supposés en env brut) → Secrets Manager :
- `mp/db/master` (Prisma URL avec rotation Lambda RDS-managed 30 j)
- `mp/auth/cognito-app-secret`
- `mp/auth/jwt-signing-key` (si tokens applicatifs)
- `mp/webhooks/cognito-sync-hmac` (partagé Lambda ↔ API)
- `mp/stripe/secret`
- `mp/sentry/dsn` (Vague 5)

### 4.G Logs centralisés + rétention
- CloudWatch Logs groups : retention 30 j ECS / 90 j API audit / 400 j CloudTrail.
- Subscription filters → Firehose → S3 + Athena (recherche long terme).
- Metric filters : `BudgetExceeded`, `ModelNotAllowed`, `RateLimited`, `PIIRedacted` → alarmes.

### 4.H Documentation & validation
- `_backend-reference/DEPLOYMENT_WAVE4.md` : runbooks (restore PITR, rotation KMS, perte d'un AZ, incident PII).
- Test : pen-test léger (OWASP ZAP) sur preview ; restore PITR en environnement staging chronométré.

---

## Vague 5 — UX ops dans l'app (câblage frontend des features Vagues 1-3)

Tout le backend Vagues 1-3 existe mais l'UI ne l'expose pas encore. Ce sont des composants React, pas de l'infra AWS.

### 5.A Budgets visibles utilisateur
- `Topbar.tsx` : jauge `spent / limit` lue depuis `/me.budget` (vert/orange/rouge selon `level`).
- `ChatView` : intercepte HTTP 402 → modal « Budget mensuel atteint, contactez votre manager ».
- Header `X-Budget-Warning` → toast non-bloquant à 80 %.
- `SuperAdminDashboard` : nouvel onglet **Budgets** (CRUD `Budget` rows, scope user/role/org).

### 5.B Sélecteur modèles filtré + erreurs quotas
- Nouvelle route API `/me/models` → utilisée par `PromptAndModelSettings.tsx` pour griser les modèles interdits.
- HTTP 403 `model_not_allowed` → message UI clair.
- HTTP 429 `rate_limited` → toast « Trop de requêtes, retry dans Ns » avec compte à rebours `retryAfterSec`.

### 5.C Gestion des clés IA (Vague 1.B finalisé côté UI)
- `PromptAndModelSettings.tsx` : champ clé en `type=password`, affiche `••••••abcd` (`maskedKey`).
- Boutons : `Sauvegarder` (POST), `Rotater` (modal nouvelle clé), `Supprimer`.
- Pull subscribe `/superadmin/audit/events?entityType=AiProvider` → toast temps réel.

### 5.D Statut d'ingestion en temps réel
- `KnowledgeBaseAdmin.tsx` : colonne **Pipeline** affichant les états Step Functions (`Classify → Extracting → Embedding → Indexing → PUBLISHED`) via polling `/admin/kb/documents/:id/execution`.
- Lien « Voir dans la console AWS » (Step Functions execution URL) pour SuperAdmin.
- Bouton `Réindexer` + bouton `Annuler` (StopExecution).

### 5.E Observabilité utilisateur
- Footer chat : badge `trace-id` (copiable, depuis header `X-Amzn-Trace-Id`).
- Section SuperAdmin **Observabilité** : iframe lien CloudWatch dashboard `MP-Usage` + lien X-Ray service map.

### 5.F Approbation consultant (déjà DB-side, finir l'UX)
- `ConsultantApprovals.tsx` : intégrer la liste réelle (`status=PENDING_MANAGER`).
- Email transactionnel (SES) « Votre compte est validé ».

### 5.G Sentry / front-end error tracking
- `@sentry/react` + `LOVABLE_SENTRY_DSN` côté front, `mp/sentry/dsn` côté back.
- Tag `userId`, `role`, `traceId` automatiquement.

---

## Vague 6 — Multi-tenant strict, cache LLM, CI/CD, FinOps

Pour passer du MVP à une plateforme multi-clients.

### 6.A Isolation multi-tenant
- Table `Org` consolidée, FK `orgId` sur `User`, `Document`, `Chunk`, `UsageEvent`, `Budget`.
- Middleware `requireOrgScope` : injecte `req.org` depuis le claim Cognito `custom:orgId`.
- Index AOSS `mp-chunks` filtré systématiquement sur `orgId` (term filter) + AOSS data access policies par org.
- Bucket S3 `knowledge/{orgId}/...` + IAM condition `s3:prefix = ${aws:PrincipalTag/orgId}`.
- Tests : impossible de lire un doc d'une autre org même en forgeant le `documentId`.

### 6.B Cache des réponses LLM (cross-user)
- `services/llmCache.ts` :
  - Clé : `sha256(orgId + model + system + messages + retrievedChunkIds)`
  - Store : DynamoDB `MpLlmCache (pk, ttl, response)` TTL 24 h.
  - Hit rate cible : 15-30 % sur prompts FAQ → économies $$ visibles dans CloudWatch.
- Bypass possible via header `Cache-Control: no-store` (admin debug).

### 6.C Streaming chat
- Si pas déjà : passer `/chat` en **SSE** Fastify (`reply.raw.write`) + AI SDK côté front (`useChat` parts).
- Sinon API Gateway WebSocket + Lambda pour scaling extrême (option).
- Mesurer : TTFB < 600 ms p95.

### 6.D Auto-scaling & haute dispo
- ECS service : `min=2`, `max=20`, scaling sur `CPUUtilization>60` et `ALBRequestCountPerTarget>50`.
- Multi-AZ pour RDS + AOSS + ECS.
- ALB health check `/healthz` (à exposer dans `app.ts`).

### 6.E CI/CD industrialisé
- `.github/workflows/` :
  - `pr.yml` : lint + test + `terraform plan` + `prisma migrate diff` → comment PR.
  - `deploy-staging.yml` : sur merge main → build image → ECR → ECS bleu/vert + `prisma migrate deploy` + Lambda updates.
  - `deploy-prod.yml` : manual approval gate, idem.
- Trois environnements : `dev` (sandbox dev), `staging` (mirror prod), `prod`.
- Tags Git → release notes auto + Sentry release.

### 6.F FinOps AWS infra
- Tagging obligatoire `Project=MP`, `Env=prod|staging|dev`, `Org=<orgId>`, `Component=api|worker|ingestion`.
- AWS Budgets : alerte 80 % du budget mensuel infra par env.
- Cost Explorer report saved : coût/tag/jour.
- CUR (Cost & Usage Report) → S3 + Athena pour reporting par client (corrélation avec `UsageEvent.orgId`).

### 6.G Tests d'intégration
- LocalStack pour SQS/SNS/S3/Secrets Manager en CI.
- Pour Bedrock/AOSS/Textract : suite e2e contre compte AWS sandbox éphémère (Terraform up/down).

---

## Récapitulatif des chantiers (par priorité décroissante)

| Vague | Sujet | Impact si pas fait | Effort |
|---|---|---|---|
| 4.A | VPC endpoints | Trafic AWS hors VPC = $$ NAT + risque | 0.5 j |
| 4.B | WAF | DDoS/brute-force exposé | 0.5 j |
| 4.D | PII redaction + Guardrails | RGPD KO, contrat client bloquant | 1.5 j |
| 4.E | Backups DR | Perte de données possible | 1 j |
| 4.F | Secrets ops (DB/JWT) | DB password en clair en env | 0.5 j |
| 4.C | CloudTrail/Config/GuardDuty | Pas d'audit forensique | 0.5 j |
| 4.G | Logs centralisés | Pas de recherche d'incident | 0.5 j |
| 5.A | Jauge budget UI | Users surpris par 402 | 0.5 j |
| 5.B | Sélecteur modèles + 429 | UX cassée si rate-limit | 0.5 j |
| 5.C | UI clés IA | SuperAdmin doit aller dans AWS console | 0.5 j |
| 5.D | Statut ingestion temps réel | « Mon doc est où ? » support++ | 1 j |
| 5.E | Trace-id + dashboards | Debug client lent | 0.3 j |
| 5.G | Sentry front | Bugs invisibles | 0.3 j |
| 6.A | Multi-tenant strict | Fuites de données entre clients | 2 j |
| 6.B | Cache LLM | 15-30 % économies $ ratées | 0.5 j |
| 6.C | Streaming SSE | Perçu lent | 0.5 j |
| 6.D | Auto-scaling + healthz | Indispo sous charge | 0.5 j |
| 6.E | CI/CD complet | Deploys manuels, risques | 1.5 j |
| 6.F | FinOps tagging + CUR | Pas de marge mesurable par client | 0.5 j |
| 6.G | Tests intégration | Régressions silencieuses | 1 j |

**Total restant : ~14 j de dev + ~3 j ops Terraform/AWS Console.**

---

## Ce qui n'est PAS nécessaire (à exclure du scope sauf demande explicite)

- Multi-region active-active (DR cross-region suffit).
- API Gateway HTTP en front de l'ALB (l'ALB seul suffit + WAF).
- Step Functions Distributed Map (overkill < 10 k chunks par doc).
- Service mesh App Mesh / Istio.
- Bedrock fine-tuning (utiliser RAG d'abord).

---

## Question avant de lancer

Veux-tu :
1. **Que je démarre la Vague 4** (sécurité/RGPD/réseau — le plus bloquant pour ouvrir à des clients) ?
2. **Que je démarre la Vague 5** (UX ops — pour que tu puisses *voir* et *utiliser* tout ce qui est déjà fait backend) ?
3. **Un sous-ensemble précis** (ex : « juste 4.D PII + 5.A jauge budget + 5.C UI clés ») ?
