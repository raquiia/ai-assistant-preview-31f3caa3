
# Déploiement AWS — Vérification & Marche à suivre

## 1. Vérification "tout est sur GitHub"

Le repo contient déjà tout ce qu'il faut pour partir en production. Inventaire :

**Infrastructure as Code** — `_backend-reference/infra/aws/` (24 fichiers Terraform)
- Réseau : `network.tf`, `vpc-endpoints.tf`, `security.tf`, `waf.tf`, `cloudfront.tf`
- Compute : `ecs.tf`, `ecs-autoscaling.tf`, `ecr.tf`
- Données : `rds.tf` (Postgres Multi-AZ), `aoss.tf` (OpenSearch Serverless), `dynamodb-llm-cache.tf`, `backups.tf`
- IA / Ingestion : `textract.tf` (Wave 7), `bedrock-guardrails.tf`, `stepfunctions/ingestion.asl.json`
- Sécurité : `iam.tf`, Cognito dans `main.tf`, `security-monitoring.tf`
- FinOps & Obs : `aws-budgets.tf`, `finops-tags.tf`, `cloudwatch.tf`, `logs.tf`

**Applications conteneurisées** — `_backend-reference/apps/`
- `api/` (Fastify + Dockerfile) — JWT Cognito + RBAC (Wave 8) ✅
- `worker/` (SQS consumers + Textract/Transcribe callbacks) ✅
- `web/` (build de référence + nginx) ✅
- `lambda/` (4 fonctions : aoss-snapshot, billing-export, cognito-post-auth, secrets-rotation) ✅

**Base de données** — `_backend-reference/prisma/` (schema + 3 migrations dont `wave7_textract_async.sql`)

**Automation** — `_backend-reference/scripts/deploy.sh` (deploy one-shot idempotent) + `.github/workflows/deploy-aws.yml` (CI)

**Documentation** — 8 docs deployment : `DEPLOYMENT.md` (runbook complet) + `DEPLOYMENT_WAVE1..8.md` + `BACKEND_AWS_AUDIT.md` + `FINAL_REPORT.md`

**Frontend Lovable** — `src/mp/` (UI complète + `auth/cognitoProvider.ts` connectée à Cognito)

✅ **Verdict** : rien ne manque côté code. Tout est versionné. Il reste uniquement les actions côté AWS (création de compte, secrets, DNS).

---

## 2. Plan de déploiement pas à pas

### Étape 0 — Pré-requis sur ta machine
1. Compte AWS actif + carte de crédit liée
2. Installer : AWS CLI ≥ 2.15, Terraform ≥ 1.8, Docker (avec buildx), jq, Node.js 22
3. Créer un user IAM `deployer` avec `AdministratorAccess` (à restreindre après), puis `aws configure --profile mp-deployer`

### Étape 1 — Cloner le repo
```bash
git clone <ton-repo-github> mp-ai-assistant
cd mp-ai-assistant/_backend-reference
```

### Étape 2 — Configurer Terraform (5 min)
```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars
```
Éditer `terraform.tfvars` : `aws_region` (ex. `eu-west-3`), `project_name`, `environment=prod`, `alarm_email`. Laisser `web_domain=""` au premier passage (CloudFront skippé tant qu'il n'y a pas de DNS).

### Étape 3 — Déploiement initial (15-25 min)
```bash
export AWS_PROFILE=mp-deployer AWS_REGION=eu-west-3
cd ..
./scripts/deploy.sh
```
Ce script enchaîne automatiquement :
1. `terraform apply` pass 1 → VPC, RDS, ECR, IAM, Cognito, S3, SQS, AOSS
2. `docker buildx build --platform linux/amd64` + push des 3 images (api, web, worker) vers ECR
3. `terraform apply` pass 2 avec les tags d'images réels → ECS Fargate démarre
4. `prisma migrate deploy` via une tâche ECS one-shot

À la fin, il affiche `ALB_URL` (URL HTTP de l'API).

### Étape 4 — Bootstrap du premier admin (2 min)
```bash
POOL_ID=$(terraform -chdir=infra/aws output -raw cognito_user_pool_id)
aws cognito-idp admin-create-user --user-pool-id $POOL_ID \
  --username toi@migso-pcubed.com \
  --user-attributes Name=email,Value=toi@migso-pcubed.com Name=email_verified,Value=true
aws cognito-idp admin-add-user-to-group --user-pool-id $POOL_ID \
  --username toi@migso-pcubed.com --group-name SUPER_ADMIN
```
Cognito envoie un mot de passe temporaire par email.

### Étape 5 — Connecter le frontend Lovable au backend AWS
Dans Lovable → Project Settings → Environment, ajouter :
```
VITE_API_URL=https://<ALB_URL>
VITE_AUTH_MODE=cognito
VITE_COGNITO_REGION=eu-west-3
VITE_COGNITO_USER_POOL_ID=<output cognito_user_pool_id>
VITE_COGNITO_CLIENT_ID=<output cognito_client_id>
```
Republier Lovable → l'UI tape directement le backend AWS.

### Étape 6 — Tests de fumée
1. Se connecter sur l'UI Lovable avec le compte admin → reset password forcé
2. Upload d'un PDF dans Knowledge Base → vérifier passage `PROCESSING` → `PUBLISHED` (Textract async actif)
3. Poser une question dans le chat → réponse + citations
4. Vérifier dans CloudWatch : `/ecs/api`, `/ecs/worker`, `/ecs/migrate`

### Étape 7 — DNS + HTTPS (optionnel mais recommandé)
1. Créer ACM cert dans `us-east-1` (CloudFront) et dans ta région (ALB)
2. Renseigner `web_domain`, `cloudfront_certificate_arn`, `acm_certificate_arn` dans `terraform.tfvars`
3. Mettre à jour `web_allowed_origins`, `web_callback_urls`, `web_logout_urls`
4. `./scripts/deploy.sh` → CloudFront + WAF s'activent
5. Créer un CNAME chez ton registrar vers le domaine CloudFront

### Étape 8 — CI/CD automatique
Le workflow `.github/workflows/deploy-aws.yml` existe déjà. Ajouter dans GitHub → Settings → Secrets :
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (idéalement OIDC role) , `AWS_REGION`
Chaque push sur `main` rebuild + redéploie automatiquement.

---

## 3. Coûts estimés mensuels (région Paris)

| Poste | Dev (~) | Prod (~) |
|---|---|---|
| ECS Fargate (api+web+worker) | 60 € | 180 € |
| RDS Postgres Multi-AZ db.t4g.medium | 110 € | 110 € |
| OpenSearch Serverless (2 OCU min) | 180 € | 180 € |
| ALB + CloudFront + WAF | 25 € | 40 € |
| Bedrock (Claude/Titan) | usage | usage |
| Textract + S3 + SQS + Cognito | 20 € | 40 € |
| **Total infra fixe** | **~395 €** | **~550 €** |

Budget AWS déjà câblé dans `aws-budgets.tf` → alerte email automatique.

---

## 4. Détails techniques

- **Région par défaut** : `eu-west-3` (Paris) — RGPD compliant
- **JWT Cognito** vérifié via JWKS distant + `client_id` + fallback HMAC désactivé en prod (`ALLOW_LOCAL_AUTH=false`)
- **Ingestion** : SQS → worker → Textract async → SNS callback → chunking/embedding/AOSS → status `PUBLISHED`/`NEEDS_REVIEW`
- **Backups** : snapshots RDS + S3 versioning + AOSS snapshot Lambda nocturne
- **Sécurité** : VPC privé, NAT, VPC endpoints (S3/SQS/Secrets/ECR), WAF managed rules, KMS sur tous les volumes
- **Limites connues** : `web_domain` doit être configuré pour activer CloudFront ; le state Terraform est local par défaut → passer S3+DynamoDB pour équipe

---

## Ce qui se passe quand tu valides ce plan

Je passerai en mode build pour : (a) vérifier qu'aucun fichier critique n'a un import cassé avant ton premier `deploy.sh`, (b) éventuellement ajouter un script de smoke-test post-deploy, (c) compléter le runbook si tu veux que je détaille une étape précise (DNS, OIDC GitHub, restriction IAM…).
