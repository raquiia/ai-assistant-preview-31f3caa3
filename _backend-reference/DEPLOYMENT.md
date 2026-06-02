# MIGSO-PCUBED AI Assistant — AWS Deployment Runbook

This document walks through a clean deployment to a fresh AWS account.
Target architecture: VPC → ALB → ECS Fargate (api/web/worker) → RDS Postgres
(Multi-AZ) + OpenSearch Serverless + S3 + SQS + Cognito + Secrets Manager,
all wrapped by CloudFront/WAF (optional).

---

## 0. Prerequisites

| Tool        | Min version | Notes                                          |
|-------------|-------------|------------------------------------------------|
| AWS CLI     | 2.15        | `aws configure` (or `AWS_PROFILE`)             |
| Terraform   | 1.8         | `terraform version`                            |
| Docker      | 24          | with `buildx` (for linux/amd64 cross-build)    |
| jq          | 1.6         | parsing terraform outputs                      |
| Node.js     | 22 LTS      | only for local dev                             |

The deployer's IAM principal needs: VPC, EC2, RDS, ECR, ECS, IAM,
Secrets Manager, KMS, S3, SQS, Cognito, OpenSearch Serverless, ELBv2,
WAFv2, CloudFront, CloudWatch, SNS. `AdministratorAccess` works for a
first deployment; lock it down afterwards.

---

## 1. Configure

```bash
cd _backend-reference/infra/aws
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`. Important fields:

| Variable                | First-deploy guidance                                  |
|-------------------------|--------------------------------------------------------|
| `aws_region`            | `eu-west-3` (Paris) by default                         |
| `project_name`          | short slug used as prefix everywhere                   |
| `environment`           | `dev` / `staging` / `prod`                             |
| `vpc_cidr`              | `10.0.0.0/16` unless conflicting with peering          |
| `web_allowed_origins`   | start with your Lovable preview URL                    |
| `web_domain`            | leave empty until you have DNS — CloudFront is skipped |
| `rds_*`                 | tune sizing/HA according to env                        |
| `alarm_email`           | optional; confirm the SNS subscription via email       |

State backend: this template uses local state. For multi-operator use,
switch to S3 + DynamoDB locking by adding a `backend "s3" {}` block in
`main.tf` before the first `init`.

---

## 2. Deploy

```bash
cd _backend-reference
./scripts/deploy.sh
```

What the script does:

1. `terraform apply` — provisions VPC/RDS/AOSS/ECR/IAM/ALB/ECS/etc.
   (ECS services start at 0 tasks because no images exist yet.)
2. `docker buildx --platform linux/amd64` and push api/web/worker to ECR.
3. `terraform apply` again with the new image tags → ECS rolls out.
4. Runs `prisma migrate deploy` as a one-shot Fargate task using the
   DATABASE_URL from Secrets Manager.

First run takes 15–25 minutes (RDS provisioning is the long pole).

---

## 3. Bootstrap an admin user

Cognito starts empty. Create your first SUPER_ADMIN:

```bash
USER_POOL_ID=$(terraform -chdir=infra/aws output -raw cognito_user_pool_id)

aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username admin@yourdomain.com \
  --user-attributes Name=email,Value=admin@yourdomain.com Name=email_verified,Value=true \
  --temporary-password "ChangeMe!2026"

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --username admin@yourdomain.com \
  --group-name SUPER_ADMIN
```

The user is forced to change their password on first sign-in.

---

## 4. Load AI provider secrets

The Terraform stack creates empty placeholder secrets for each provider.
Fill them in:

```bash
for p in mistral openai tavily serpapi; do
  aws secretsmanager put-secret-value \
    --secret-id "migso-pcubed-dev/ai-providers/$p" \
    --secret-string "{\"apiKey\":\"REPLACE_WITH_REAL_KEY\"}"
done
```

The API picks up rotated values within 5 minutes (Secrets Manager cache TTL).

---

## 5. Point the Lovable frontend at the API

The Lovable frontend reads two env vars:

```
VITE_API_URL=https://<your-alb-or-cloudfront-domain>
VITE_USE_MOCKS=false
```

Set them in **Project Settings → Environment Variables**, then redeploy
from the Publish dialog. Until they're set, the frontend keeps using the
in-app mocks.

---

## 6. Add a custom domain (optional)

1. Create an ACM cert **in your region** for the ALB (`*.yourdomain.com`).
2. Create another ACM cert **in `us-east-1`** for CloudFront.
3. Set `web_domain`, `acm_certificate_arn`, `cloudfront_certificate_arn`
   in `terraform.tfvars`.
4. `./scripts/deploy.sh` again — CloudFront + WAF + HTTPS listener get
   created.
5. Point your DNS at the CloudFront domain (or the ALB if you skipped
   CloudFront).

---

## 7. Day-2 operations

| Action                          | How                                                       |
|---------------------------------|-----------------------------------------------------------|
| Deploy new code                 | `./scripts/deploy.sh` (auto-detects new git SHA)          |
| Roll back to a previous image   | `terraform apply -var api_image_tag=<prev-sha>`           |
| Connect to RDS                  | SSM session manager + `psql` from a bastion / VPN         |
| View logs                       | CloudWatch Logs: `/ecs/migso-pcubed-dev/{api,worker}`     |
| Dashboards & alarms             | CloudWatch Dashboards → `migso-pcubed-dev`                |
| Tear down                       | `./scripts/destroy.sh`                                    |

---

## 8. Provider switch matrix

Each AWS adapter activates when its env var is present (the rest fall
back to in-memory). On AWS, ECS task defs export all of them — you don't
manage this manually unless you're running locally.

| Env var                  | Adapter that activates    | In-memory fallback           |
|--------------------------|---------------------------|------------------------------|
| `DATABASE_URL`           | Prisma repository         | `AppRepository` (seed state) |
| `S3_KNOWLEDGE_BUCKET`    | `S3StorageProvider`       | `LocalObjectStorageProvider` |
| `SQS_INGESTION_URL`      | `SqsQueueProvider`        | `InMemoryQueueProvider`      |
| `COGNITO_USER_POOL_ID`   | `CognitoAuthProvider`     | local bcrypt auth            |
| `AOSS_ENDPOINT`          | `OpenSearchVectorProvider`| `MockVectorProvider`         |
| `SECRETS_PREFIX`         | `SecretsManagerProvider`  | reads env vars directly      |

---

## 9. Known sharp edges (you will likely hit these on first deploy)

- **AOSS data access policy & IAM role propagation**: a first apply
  sometimes fails because the OpenSearch collection is created before
  the data access policy fully propagates. Re-run `terraform apply` —
  Terraform converges on the second attempt.
- **ALB target health on cold start**: the first ECS task takes ~60s
  to become healthy because of `/health` checks. The
  `health_check_grace_period_seconds = 60` setting accounts for this.
- **Migrate task IAM role lookup**: if the IAM role name doesn't match
  the `aws iam get-role` query in `deploy.sh`, the migration step
  prints a warning instead of failing. Run `prisma migrate deploy`
  manually with the DATABASE_URL from Secrets Manager.
- **Cognito callback URLs**: change `web_callback_urls` once you have a
  real frontend domain — otherwise the hosted UI rejects the OAuth
  redirect.

---

## 10. Cost order of magnitude (eu-west-3, dev sizing)

| Component                    | ~Monthly         |
|------------------------------|------------------|
| RDS db.t4g.medium Multi-AZ   | $120             |
| ECS Fargate (3 services)     | $60              |
| ALB                          | $20              |
| NAT Gateway                  | $35 + traffic    |
| OpenSearch Serverless        | $24 / OCU-hour (typically $50–$200) |
| CloudFront + WAF (optional)  | $20–$50          |
| S3 + KMS + Secrets + Logs    | <$10             |

Plan for **~$300/month** as a floor for the dev environment with no
real traffic. Multi-AZ RDS + AOSS are the dominant fixed costs — both
are required for production reliability; for an experiment, set
`rds_multi_az=false` and skip AOSS (the in-memory vector provider stays
active when `AOSS_ENDPOINT` is unset).
