# Audit du backend AWS vs features prévues et frontend

## Ce que j'ai constaté en explorant

- Le frontend Lovable (`src/mp/**`) tourne sur **mocks** par défaut (`VITE_USE_MOCKS=true`) et tape sinon `VITE_API_URL` (Fastify).
- Le "backend" cible vit dans `_backend-reference/` : monorepo TypeScript (Fastify API + worker + web + Prisma) avec un **squelette Terraform AWS** dans `_backend-reference/infra/aws/` (85 lignes de `main.tf`).
- Les features livrées côté front couvrent : auth + RBAC, chat consultant avec RAG/fallback/escalade, KB (upload, publish, reindex, tags), historique Q/R + commentaires admin + corrections approuvées, gestion users, prompts versionnés + rollback, providers IA (Mistral primary / OpenAI fallback), embed iframe, audit/compliance, dashboard avec satisfaction.

## Verdict — le Terraform AWS n'est PAS aligné avec les features

Le `main.tf` actuel ne déclare que : `KMS`, `S3 (knowledge)`, `SQS (ingestion)`, `Cognito user pool + groups`, `Secrets Manager (ai-provider-keys)`, `CloudWatch log groups api/worker`. Tout le reste est un commentaire `# Placeholders for VPC, ECS, RDS, OpenSearch`.

Manques bloquants par rapport au produit :

| Feature front / API                                  | AWS attendu                                          | État Terraform     |
|------------------------------------------------------|------------------------------------------------------|--------------------|
| Persistance Prisma (users, conv, messages, audit…)   | RDS PostgreSQL + subnet group + SG                   | Absent             |
| Run de l'API Fastify + worker ingestion              | ECS Fargate (cluster, services, task defs, ALB)      | Absent             |
| Réseau privé, accès DB/AOSS sans Internet            | VPC, subnets privés/public, NAT, VPC endpoints       | Absent             |
| Retrieval hybride / vecteurs                         | OpenSearch Serverless (collection + policies)        | Absent             |
| KB upload PDF/DOCX/médias                            | S3: lifecycle, encryption, public access block, CORS | Bucket nu, pas de versioning chiffré ni public-access-block ni CORS pour upload présigné |
| File d'ingestion                                     | SQS + DLQ + alarme age-of-oldest                     | SQS sans DLQ ni alarme |
| Secrets IA (Mistral, OpenAI, Tavily, SerpAPI)        | Un secret par provider                               | Un seul secret générique |
| Cognito → rôles app (`CONSULTANT/MANAGER/SUPER_ADMIN/AUDITOR`) | App client, callback URLs, password policy, MFA | Pool + groupes seuls (pas d'app client, pas de MFA, pas de policy) |
| Embed iframe avec token court                        | CloudFront + WAF + origin allowlist                  | Absent             |
| Audit / observabilité                                | CloudWatch dashboards + alarms + (optionnel) X-Ray   | Log groups seuls   |
| Edge front statique                                  | S3 + CloudFront pour `apps/web`                      | Absent             |
| IAM least-privilege (task roles api/worker)          | Rôles ECS + policies scopées S3/SQS/SM/AOSS/KMS      | Absent             |
| Rotation des secrets                                 | Secrets Manager rotation lambda                      | Absent             |

Autres écarts notables côté code :

- **Persistance** : l'API tourne encore sur un repository in-memory (`apps/api/src/state.ts`) alors que Prisma + RDS sont prévus. Tant que ce n'est pas branché, déployer sur ECS sans RDS donnerait une appli amnésique à chaque redéploiement.
- **Vector store** : `VectorProvider` est mocké ; aucune intégration OpenSearch n'existe côté code, donc même si on provisionnait AOSS, le worker ne l'utiliserait pas encore.
- **Extraction lourde** (PDF/DOCX/OCR/transcription) : contrats présents, adapters non implémentés → besoin de Lambda/Textract/Transcribe non listés dans Terraform.
- **Embed widget** : besoin d'un CloudFront avec header `Content-Security-Policy: frame-ancestors` + origin allowlist, non prévu.

## Plan d'action proposé

### 1. Livrable `BACKEND_AWS_AUDIT.md` (à la racine de `_backend-reference/`)

Document Markdown structuré qui sert de référence partageable :

- Table de correspondance "feature front → endpoint API → ressource AWS → état actuel".
- Liste des manques classés P0/P1/P2.
- Recommandations d'architecture cible (schéma ASCII : ALB → ECS api/worker dans VPC privé → RDS + AOSS + S3 + SQS + Secrets Manager + Cognito + CloudFront/WAF pour web et embed).
- Checklist de mise en production (RLS-equivalent IAM, KMS partout, rotation, alarmes, backups).

### 2. Hardening du squelette Terraform existant

Modifications **chirurgicales** dans `_backend-reference/infra/aws/main.tf` (et `variables.tf`/`outputs.tf` au besoin) — pas une refonte complète, juste de quoi rendre le skeleton crédible et combler les manques les plus immédiats sans coûter cher à un environnement non-appliqué :

- `aws_s3_bucket_public_access_block`, `aws_s3_bucket_server_side_encryption_configuration` (KMS) et `aws_s3_bucket_cors_configuration` sur le bucket knowledge.
- DLQ SQS + `redrive_policy` + `aws_cloudwatch_metric_alarm` `ApproximateAgeOfOldestMessage`.
- Cognito : `aws_cognito_user_pool_client`, password policy + MFA optionnel sur le pool.
- Secrets : passer d'un secret unique à `for_each` sur `["mistral", "openai", "tavily", "serpapi"]`.
- Ajouter les **placeholders nommés mais déclarés** (commentés `// TODO` mais avec la structure correcte) pour : `aws_vpc`, `aws_db_instance` (RDS Postgres), `aws_opensearchserverless_collection`, `aws_ecs_cluster`, `aws_cloudfront_distribution` pour le front + l'embed.
- `outputs.tf` : exporter les ARN clés (bucket, queue, dlq, user_pool_id, kms_key_arn).

### 3. Pas de changement frontend

Cette demande est une vérification d'alignement backend/infra. Aucune modification de `src/**`. Le mode mocks reste actif par défaut, et basculera sur l'API AWS une fois `VITE_API_URL` configuré.

## Fichiers touchés (en mode build)

- ➕ `_backend-reference/BACKEND_AWS_AUDIT.md` (nouveau)
- ✏️ `_backend-reference/infra/aws/main.tf` (durcissement S3/SQS/Cognito/Secrets + stubs structurés)
- ✏️ `_backend-reference/infra/aws/outputs.tf` (nouveaux outputs)
- ✏️ `_backend-reference/infra/aws/variables.tf` (variables pour DLQ, AOSS, RDS si stubs)

Aucun code applicatif (`apps/api`, `apps/worker`, `src/**`) n'est modifié — l'audit identifie les chantiers code (in-memory → Prisma, OpenSearch adapter, extraction) mais ne les exécute pas ici.

## À confirmer avant build

1. Tu veux un **audit-document uniquement** (juste le `.md`), ou **audit + hardening Terraform** comme proposé ci-dessus ?
2. Tu veux que je liste aussi les chantiers **applicatifs** à faire pour vraiment brancher AWS (Prisma + OpenSearch + extraction) dans le doc, ou seulement l'infra ?
