# GitHub Actions — Déploiement AWS

Workflow : `.github/workflows/deploy-aws.yml`

Pipeline : `terraform apply (infra)` → `docker build/push ECR` (api + web + worker en parallèle) → `terraform apply (rollout ECS)` → `prisma migrate deploy` (ECS run-task) → `summary`.

## Prérequis (one-shot)

### 1. Rôle IAM OIDC pour GitHub Actions

Crée un rôle IAM dans AWS qui fait confiance au provider OIDC GitHub :

```bash
# Provider OIDC (si pas déjà créé)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Trust policy (remplace `OWNER/REPO`) :

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:ref:refs/heads/main" }
    }
  }]
}
```

Attache au rôle les politiques nécessaires (a minima : `AdministratorAccess` pour la phase bootstrap, à durcir ensuite : `AmazonEC2ContainerRegistryPowerUser`, accès Terraform sur VPC/RDS/ECS/IAM/Secrets/AOSS/CloudFront/WAF).

### 2. Secrets GitHub

Dans **Settings → Secrets and variables → Actions** :

| Nom | Valeur |
|-----|--------|
| `AWS_DEPLOY_ROLE_ARN` | ARN du rôle créé ci-dessus |
| `TERRAFORM_TFVARS` *(optionnel)* | Contenu complet du fichier `terraform.tfvars`. Si absent, le workflow copie `terraform.tfvars.example`. |

### 3. Variables GitHub (optionnel)

| Nom | Défaut | Rôle |
|-----|--------|------|
| `AWS_REGION` | `eu-west-3` | Région cible |

### 4. Environnement protégé (pour `destroy`)

Crée l'environnement **`production-destroy`** (Settings → Environments) avec **Required reviewers**, pour qu'un `terraform destroy` exige une approbation manuelle.

## Utilisation

- **Push sur `main`** touchant `_backend-reference/**` → déploiement automatique.
- **Déclenchement manuel** (onglet Actions → *Deploy AWS Backend* → *Run workflow*) :
  - `action=plan` — `terraform plan` uniquement
  - `action=deploy` — pipeline complet
  - `action=destroy` — tear-down (approbation requise)
  - `skip_migrate=true` — saute Prisma

## Backend Terraform distant (recommandé)

Le workflow utilise par défaut un state local — non partageable entre runs. Pour un usage CI, configure un backend S3 + DynamoDB dans `_backend-reference/infra/aws/main.tf` :

```hcl
terraform {
  backend "s3" {
    bucket         = "migso-tfstate"
    key            = "ai-assistant/dev/terraform.tfstate"
    region         = "eu-west-3"
    dynamodb_table = "migso-tflock"
    encrypt        = true
  }
}
```
