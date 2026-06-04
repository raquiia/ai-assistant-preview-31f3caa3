# GitHub Actions — Déploiement AWS

Workflow : `.github/workflows/deploy-aws.yml`

## 🔑 Secrets GitHub à configurer (une seule fois)

Dans ton repo GitHub → **Settings → Secrets and variables → Actions → New repository secret** :

| Nom | Valeur |
|---|---|
| `AWS_ACCESS_KEY_ID` | Access key d'un utilisateur IAM avec droits de déploiement |
| `AWS_SECRET_ACCESS_KEY` | Secret key correspondante |

**Création de l'utilisateur IAM** (depuis la console AWS) :
1. IAM → Users → Create user → `github-actions-deploy`
2. Attach policies : `AdministratorAccess` (pour le bootstrap) ou plus restreint si tu veux durcir
3. Security credentials → Create access key → "Application running outside AWS" → copie les 2 valeurs

## 🚀 Premier déploiement (ordre obligatoire)

### Étape A — Bootstrap manuel via AWS CloudShell (UNE FOIS)
Le workflow GitHub Actions a besoin que l'infra de base (ECR, ECS cluster) existe déjà. Premier `terraform apply` dans CloudShell :

```bash
# Dans AWS CloudShell (console AWS → icône terminal)
cd ~
curl -sLO https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_linux_amd64.zip
unzip -o terraform_1.9.8_linux_amd64.zip && mkdir -p ~/bin && mv terraform ~/bin/
export PATH=$HOME/bin:$PATH

git clone https://github.com/<TON_USER>/mpaibot-v2.git
cd mpaibot-v2/_backend-reference/infra/aws
cp terraform.tfvars.example terraform.tfvars
# Édite terraform.tfvars : environment="prod", emails, domaines…
nano terraform.tfvars

terraform init
terraform apply   # ~15-20 min
```

### Étape B — Backend Terraform distant (RECOMMANDÉ)
Pour que GitHub Actions partage le même state que ton CloudShell, configure un backend S3 :

```bash
# Toujours dans CloudShell, crée le bucket + table DynamoDB
aws s3api create-bucket --bucket migso-pcubed-tfstate \
  --region eu-west-3 --create-bucket-configuration LocationConstraint=eu-west-3
aws s3api put-bucket-versioning --bucket migso-pcubed-tfstate \
  --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --region eu-west-3
```

Puis ajoute dans `_backend-reference/infra/aws/main.tf` (au début, dans le bloc `terraform {}`) :

```hcl
backend "s3" {
  bucket         = "migso-pcubed-tfstate"
  key            = "prod/terraform.tfstate"
  region         = "eu-west-3"
  dynamodb_table = "terraform-locks"
  encrypt        = true
}
```

Puis `terraform init -migrate-state` pour migrer le state local vers S3.

### Étape C — Push du code → déploiement auto
```bash
# Depuis CloudShell ou github.dev
git add . && git commit -m "Add CI/CD" && git push
```

Va dans l'onglet **Actions** de ton repo : tu verras le workflow tourner.

## 📦 Ce que fait le workflow à chaque push sur `main`

1. **build-and-push** (parallèle) : build des 3 images Docker (api/web/worker) → push vers ECR avec tag `<sha-court>` et `latest`
2. **terraform** : `terraform apply` avec les nouveaux tags d'images
3. **ecs-deploy** : force ECS à pull les nouvelles images (rolling update zero-downtime)

Temps total : **3-5 min** par déploiement.

## 🔄 Déclencher manuellement
Actions → "Deploy to AWS" → **Run workflow** → branche `main` → Run.
