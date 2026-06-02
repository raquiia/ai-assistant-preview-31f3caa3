# Vague 4 — Sécurité, RGPD, réseau, sauvegardes

> Pré-requis : Vagues 1-3 déployées. Cette vague est **bloquante avant ouverture clients**.

## Ce que la Vague 4 apporte

| Lot | Sujet | Fichiers clés |
|---|---|---|
| 4.A | VPC endpoints PrivateLink (Bedrock, AOSS, Secrets, KMS, S3 gw, …) | `infra/aws/vpc-endpoints.tf` |
| 4.B | AWS WAFv2 (managed rules + rate-limit + geo) sur l'ALB | `infra/aws/waf.tf` |
| 4.C | CloudTrail multi-region + Config + GuardDuty + Security Hub | `infra/aws/security-monitoring.tf` |
| 4.D | PII redaction (regex + Comprehend) + Bedrock Guardrails | `services/piiRedactor.ts`, `providers/aws/comprehend-pii.ts`, `providers/aws/bedrock-guardrails.ts`, `infra/aws/bedrock-guardrails.tf` |
| 4.E | Backups DR (RDS cross-region, S3 replication, AOSS snapshot) | `infra/aws/backups.tf`, `apps/lambda/aoss-snapshot/` |
| 4.F | Secrets opérationnels dans Secrets Manager | Doc + rotation Lambda RDS |
| 4.G | Log groups centralisés + metric filters + Firehose archive | `infra/aws/logs.tf` |

---

## 1. VPC endpoints (4.A)

17 endpoints PrivateLink : `bedrock-runtime`, `bedrock`, `secretsmanager`, `kms`, `sqs`, `sns`, `textract`, `transcribe`, `logs`, `monitoring`, `states`, `ecr.api`, `ecr.dkr`, `sts`, `events`, `lambda`, `xray` + 2 gateway (S3, DynamoDB) + AOSS VPCe.

Conséquences :
- Trafic AWS reste 100 % intra-VPC → coût NAT divisé (~30-50 %).
- Permet de retirer la NAT Gateway sur les subnets workers purement AWS-internal (option agressive).
- SG `mp-vpc-endpoints` n'accepte que HTTPS depuis le SG `ecs_tasks`.

---

## 2. WAF (4.B)

Règles attachées à l'ALB :
1. AWSManagedRulesCommonRuleSet (OWASP top 10)
2. AWSManagedRulesKnownBadInputsRuleSet
3. AWSManagedRulesSQLiRuleSet
4. Rate-limit : 1000 req/5min/IP sur `/auth/*` et `/chat`
5. (opt) Geo allowlist via `var.waf_allowed_countries = ["FR","BE","LU","CH"]`

CloudWatch metrics activées pour toutes les règles → visible dashboard WAF.

---

## 3. CloudTrail / Config / GuardDuty / Security Hub (4.C)

- **CloudTrail** multi-region + data events S3 sur le bucket knowledge → bucket chiffré KMS, lifecycle Glacier 90j, retention 400j.
- **AWS Config** : 6 rules managées (S3 public, RDS encrypted, IAM password, SSH, root MFA, CloudTrail).
- **GuardDuty** : findings sévérité ≥ MEDIUM (≥4) routées vers SNS `mp-ops-alerts`.
- **Security Hub** : standards CIS + AWS FSBP activés.

SNS topic `mp-ops-alerts` chiffré KMS — y abonner PagerDuty / email / Slack manuellement.

---

## 4. PII redaction + Guardrails (4.D)

### Flow

```text
User prompt
  └─► piiRedactor.redact()
        ├─ regex pass (EMAIL, PHONE_FR, IBAN, NIR, CREDIT_CARD, IP, JWT-ish)
        └─ Comprehend DetectPiiEntities (score ≥ 0.85)
       => { redacted, tokenMap, counts }
  └─► chatService.ask(redacted)   ← Bedrock voit <EMAIL_1>, jamais l'email
        └─ withGuardrail(input)   ← deuxième filet côté provider
  └─► piiRedactor.restore(response, tokenMap)
  └─► audit("pii.redacted", { count: counts })   ← jamais les valeurs
```

### Bedrock Guardrails

Guardrail Terraform `aws_bedrock_guardrail.main` :
- Content filters HIGH sur SEXUAL / VIOLENCE / HATE / INSULTS / PROMPT_ATTACK
- PII anonymization sur EMAIL, PHONE, CREDIT_DEBIT_CARD, US_SOCIAL_SECURITY, IP, PASSWORD
- Topics interdits : legal-advice, medical-advice

ID exposé via env `BEDROCK_GUARDRAIL_ID` (output Terraform). Toggle global via présence/absence de l'env var.

### Toggle tenant

Ajouter `Org.piiRedactionEnabled BOOLEAN DEFAULT TRUE`. Le `chatService` lit le flag de l'org de l'utilisateur courant.

---

## 5. Backups DR (4.E)

- **RDS** : `aws_db_instance_automated_backups_replication` vers `var.dr_region` (défaut `eu-west-1`), retention 14j, KMS DR dédié.
- **S3 knowledge** : versioning ON, lifecycle (purge versions non-current 90j, IA 60j, Glacier 180j), replication vers `${bucket_prefix}-knowledge-dr`.
- **AOSS** : Lambda cron `mp-aoss-snapshot` (03:00 UTC) → `_snapshot/mp-dr/mp-YYYYMMDD` dans le bucket DR. Alarme CloudWatch si Lambda non invoquée pendant 25h.
- **Secrets Manager** : ajouter `recovery_window_in_days = 30` sur chaque secret existant.

Runbook DR : créer `docs/runbooks/dr-restore.md` (RPO 1h, RTO 4h, étapes : restaurer RDS PITR → re-pointer DNS → snapshot AOSS → relancer worker).

---

## 6. Secrets opérationnels (4.F)

Migrer hors `.env`/SSM brut vers Secrets Manager :

| Secret | Rotation |
|---|---|
| `mp/db/master` | Lambda RDS-managed 30j |
| `mp/auth/cognito-app-secret` | manuelle |
| `mp/auth/jwt-signing-key` | manuelle 90j |
| `mp/webhooks/cognito-sync-hmac` | manuelle 90j |
| `mp/stripe/secret` | manuelle |
| `mp/sentry/dsn` | n/a |

Code : factoriser via `secretsManager.getJson(name)` (déjà dans `aiProviderService`).

---

## 7. Logs centralisés (4.G)

- 7 log groups KMS-chiffrés, retention 30-90j.
- Metric filters : `BudgetExceededCount`, `RateLimitedCount`, `ModelNotAllowedCount`, `PIIRedactedCount` → namespace `MP/App`.
- Alarmes burst : > 5 budget_exceeded / 5 min, > 50 rate_limited / 5 min.
- Firehose subscription → bucket CloudTrail S3 (compression GZIP, partitionnement année/mois/jour) → requêtable Athena.

---

## 8. IAM additions

Task role API :
- `comprehend:DetectPiiEntities` (4.D)
- `bedrock:ApplyGuardrail`, `bedrock:GetGuardrail` (4.D)

Lambda `aoss-snapshot` :
- `aoss:APIAccessAll` sur la collection mp
- `iam:PassRole` sur `aws_iam_role.aoss_snapshot_repo`

Lambda billing / cognito-post-auth : `secretsmanager:GetSecretValue` sur `mp/*`.

---

## 9. Validation

| # | Test | Critère |
|---|---|---|
| 1 | `aws ec2 describe-vpc-endpoints` | 19 endpoints actifs, dont AOSS |
| 2 | curl ALB avec payload SQLi | 403 WAF (visible dans la console WAF Sampled Requests) |
| 3 | 1500 req /auth en 5 min | 429 après seuil |
| 4 | Prompt « Mon IBAN est FR76... » | Bedrock voit `<IBAN_1>`, réponse restaurée côté utilisateur, audit `pii.redacted: {IBAN:1}` |
| 5 | Tentative « Donne-moi un avis juridique nominatif » | Bedrock Guardrail BLOCKED, message fallback FR |
| 6 | Snapshot RDS via console DR region | snapshot du jour présent |
| 7 | Object S3 mis à jour | version répliquée visible dans bucket DR < 15 min |
| 8 | EventBridge invoke manuel `mp-aoss-snapshot` | snapshot `mp-YYYYMMDD` listé via `_snapshot/mp-dr/_all` |
| 9 | GuardDuty test finding (`aws guardduty create-sample-findings`) | message dans SNS ops-alerts |
| 10 | Métrique `BudgetExceededCount` > 5 sur 5 min | alarme `mp-budget-exceeded-burst` ALARM |

---

## 10. Hors scope (Vague 5/6)

- Câblage frontend des UX ops (jauge budget, sélecteur modèles, statut ingestion) → **Vague 5**.
- Multi-tenant strict, cache LLM, CI/CD GitHub Actions, FinOps tagging → **Vague 6**.
