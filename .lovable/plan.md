# Rendre le backend AWS prêt à déployer et fonctionnel

Choix retenus :
- **Périmètre** : Infra Terraform complète + adaptateurs AWS dans le code applicatif.
- **Infra** : Région `eu-west-3`, VPC `10.0.0.0/16`, RDS `db.t4g.medium` Multi-AZ, env `dev` seul, domaine TBD (CloudFront avec cert ACM créé conditionnellement).
- **Code** : Garder l'in-memory comme fallback ; basculer sur Prisma quand `DATABASE_URL` est défini.
- **Déploiement** : Script `deploy.sh` (build → push ECR → terraform apply → migrate).

## Ce que je vais livrer

### 1. Infra Terraform complète (`_backend-reference/infra/aws/`)

Découpée en modules locaux dans des fichiers séparés pour rester lisible :

- `network.tf` : VPC `10.0.0.0/16` sur 3 AZ, subnets publics (ALB) + privés (ECS/RDS/AOSS), 1 NAT GW, route tables, **VPC endpoints** S3 (gateway), Secrets Manager, KMS, ECR API/DKR, CloudWatch Logs (interface).
- `security.tf` : SG ALB, SG ECS api, SG ECS worker, SG RDS, SG AOSS, SG VPC endpoints. Règles least-privilege (ALB→ECS:4000, ECS→RDS:5432, ECS→AOSS:443).
- `rds.tf` : `aws_db_subnet_group`, `aws_db_instance` Postgres 16 `db.t4g.medium` Multi-AZ, encryption KMS, backups 14j, deletion protection, parameter group avec `log_statement=ddl`. Master password stocké dans Secrets Manager.
- `aoss.tf` : OpenSearch Serverless collection `VECTORSEARCH` + encryption/network/data access policies.
- `ecr.tf` : 3 repos (`api`, `web`, `worker`) avec scan-on-push et lifecycle (garde 10 dernières).
- `ecs.tf` : Cluster Fargate Container-Insights, 3 task definitions (api/web/worker), 3 services, ALB + 2 target groups (`/` → web, `/api/*` `/auth/*` `/admin/*` `/superadmin/*` `/chat/*` `/embed/*` `/source/*` `/managers/*` → api). Worker sans ALB. Autoscaling target tracking sur CPU 60 %.
- `iam.tf` : `ecs_task_execution_role` (pull ECR + logs + secrets), `task_role_api` (S3 RW knowledge prefix, SQS send, Secrets Manager read scoped, AOSS read/write collection, KMS decrypt), `task_role_worker` (S3 RW, SQS receive/delete, AOSS write, Textract/Transcribe optionnel mais commenté).
- `cloudfront.tf` : Distribution `web` (origin = ALB pour `apps/web`), distribution `embed` (origin = ALB chemin `/embed/*`), WAF web ACL (AWS Managed Common Rules + rate limit), response headers policy (HSTS, strict CSP, `frame-ancestors` paramétrable). ACM cert conditionnel via `var.web_domain` (skip si vide).
- `cloudwatch.tf` : dashboard avec widgets (ALB 5xx, ECS CPU/mem, RDS connections, SQS depth, AOSS errors), alarmes SNS topic (`var.alarm_email`).

`main.tf` devient juste le bootstrap (provider, KMS, locals) et `outputs.tf` est étendu.

### 2. Adaptateurs AWS dans le code (`_backend-reference/`)

Chaque adapter respecte le provider boundary existant. Switch via env vars : si présent → adapter AWS, sinon → impl en mémoire.

- `packages/shared/src/providers/` : interfaces `StorageProvider`, `QueueProvider`, `VectorProvider`, `SecretProvider`, `AuthProvider` (si pas déjà extraites — vérification à l'exécution).
- `apps/api/src/providers/aws/`
  - `s3-storage.ts` : `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (presigned PUT/GET).
  - `sqs-queue.ts` : `@aws-sdk/client-sqs` send.
  - `secrets-manager.ts` : `@aws-sdk/client-secrets-manager` avec cache 5 min in-memory.
  - `cognito-auth.ts` : vérif JWT Cognito via JWKS (`jose`), mapping `cognito:groups` → rôles app (`CONSULTANT`/`MANAGER`/`SUPER_ADMIN`/`AUDITOR`).
  - `opensearch-vector.ts` : `@opensearch-project/opensearch` + `@aws-sdk/credential-provider-node` signer SigV4 pour AOSS.
- `apps/api/src/repository/` :
  - `index.ts` : factory qui exporte `inMemoryRepo` si `DATABASE_URL` absent, sinon `prismaRepo`.
  - `prisma-repo.ts` : implémentation Prisma des méthodes utilisées par les services (users, conversations, messages, responses, feedback, adminComments, documents, chunks, prompts, providerConfigs, auditEvents). Mappage 1-pour-1 avec l'API in-memory existante pour ne pas casser les call sites.
- `apps/worker/src/providers/aws/` : worker SQS long-poll qui pop les jobs d'ingestion et appelle le pipeline existant ; écrit dans S3 + AOSS.
- `apps/api/src/bootstrap.ts` : sélection des providers selon env (`NODE_ENV`, `DATABASE_URL`, `AWS_REGION`, `S3_KNOWLEDGE_BUCKET`, `SQS_INGESTION_URL`, `COGNITO_USER_POOL_ID`, `AOSS_ENDPOINT`, `SECRETS_PREFIX`).

Ajout des deps :
```
@aws-sdk/client-s3, @aws-sdk/s3-request-presigner,
@aws-sdk/client-sqs, @aws-sdk/client-secrets-manager,
@aws-sdk/credential-provider-node, @aws-sdk/signature-v4,
@opensearch-project/opensearch, jose,
@prisma/client + prisma (dev)
```

### 3. Dockerfiles + image runtime

- `apps/api/Dockerfile` : multi-stage Node 22 alpine, build TS, runtime non-root.
- `apps/worker/Dockerfile` : idem.
- `apps/web/Dockerfile` : build Vite → nginx alpine servant le bundle statique.
- `.dockerignore` racine.

### 4. Script de déploiement `_backend-reference/scripts/deploy.sh`

Pipeline idempotent :

```
1. Vérifie aws cli, terraform, docker, jq, AWS_PROFILE et AWS_REGION.
2. terraform -chdir=infra/aws init && terraform apply -auto-approve
   pour créer ECR/RDS/etc. (1ère passe sans images = task defs commentées).
3. Récupère les URLs ECR via terraform output.
4. docker buildx build --platform linux/amd64 + push api/web/worker.
5. terraform apply -auto-approve (2e passe avec les images réelles).
6. Récupère DATABASE_URL depuis Secrets Manager → npx prisma migrate deploy
   via une task ECS run-task one-shot.
7. Affiche l'URL ALB / CloudFront et le user_pool_id.
```

Plus `scripts/destroy.sh` pour teardown propre (skip RDS deletion protection).

### 5. Runbook `_backend-reference/DEPLOYMENT.md`

Document opérationnel pas-à-pas :
- Prérequis (compte AWS, AWS CLI configuré, Docker Desktop, Terraform ≥1.8).
- Variables à customiser dans `terraform.tfvars.example` (région, CIDR, domaine optionnel, alarm_email).
- Création d'un premier utilisateur Cognito via AWS CLI (commande prête).
- Comment basculer le frontend Lovable : `VITE_API_URL=https://<alb-dns>` + `VITE_USE_MOCKS=false`.
- Procédure de rollback (terraform state + ECR image tags).
- Surveillance post-deploy (dashboards CloudWatch + alarmes).

## Limites assumées

- Je **ne peux pas exécuter** `terraform apply` ni `docker push` depuis ce sandbox — tu lances `deploy.sh` toi-même avec tes credentials AWS.
- Je **ne peux pas tester end-to-end** sans environnement AWS réel. Le code compile en local et respecte les contrats existants, mais le premier deploy révélera typiquement 1–3 itérations à faire (security group ports, IAM scoping, AOSS access policies — corrigeables ensuite).
- **Extraction lourde** (Textract/Transcribe) reste hors scope comme convenu.
- **CI/CD GitHub Actions** non scaffold (tu as choisi `deploy.sh`).
- **Domaine custom** : si vide, CloudFront servira sur le hostname `*.cloudfront.net`. Tu pourras ajouter le cert ACM us-east-1 plus tard.

## Fichiers touchés

Nouveaux :
- `_backend-reference/infra/aws/{network,security,rds,aoss,ecr,ecs,iam,cloudfront,cloudwatch}.tf`
- `_backend-reference/infra/aws/terraform.tfvars.example`
- `_backend-reference/apps/{api,worker,web}/Dockerfile`
- `_backend-reference/.dockerignore`
- `_backend-reference/apps/api/src/providers/aws/*.ts` (5 adapters)
- `_backend-reference/apps/api/src/repository/{index,prisma-repo}.ts`
- `_backend-reference/apps/api/src/bootstrap.ts`
- `_backend-reference/apps/worker/src/providers/aws/sqs-consumer.ts`
- `_backend-reference/scripts/{deploy,destroy}.sh`
- `_backend-reference/DEPLOYMENT.md`

Modifiés :
- `_backend-reference/infra/aws/main.tf` (allégé, juste bootstrap)
- `_backend-reference/infra/aws/variables.tf` (+ vars network/RDS/domaine/email)
- `_backend-reference/infra/aws/outputs.tf` (+ ALB DNS, CloudFront, ECR URLs, RDS endpoint)
- `_backend-reference/package.json` (+ deps AWS SDK + Prisma) et `apps/api/package.json`, `apps/worker/package.json`
- `_backend-reference/apps/api/src/state.ts` (factory repo)
- `_backend-reference/BACKEND_AWS_AUDIT.md` (statut mis à jour : "P0 #2/#3/#4 traités").

Aucune modification du frontend Lovable `src/**`. Le basculement mocks→AWS se fait par 2 env vars sans rebuild de code.
