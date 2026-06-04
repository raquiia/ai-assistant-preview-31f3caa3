# Déploiement AWS via GitHub Actions

Pipeline : **push sur `main`** → build Docker → push ECR → `terraform apply` → ECS rolling update.

Aucune installation requise sur ton PC. Tout se fait via :
- **GitHub** (interface web) pour les fichiers et secrets
- **AWS CloudShell** (terminal dans le navigateur AWS) pour le bootstrap

---

## 🚀 Setup initial (1 seule fois)

### Étape 1 — Bootstrap AWS via CloudShell

1. Connecte-toi à la console AWS avec le compte **`mp-devops`**
2. Vérifie en haut à droite que la région est bien **`Europe (Paris) eu-west-3`**
3. Clique sur l'icône **CloudShell** (en haut à droite, à côté de la cloche 🔔) — un terminal s'ouvre dans le navigateur
4. Colle ces commandes :

   ```bash
   curl -sSL https://raw.githubusercontent.com/raquiia/ai-assistant-preview-31f3caa3/main/.github/workflows/bootstrap-tfstate.sh -o bootstrap.sh
   chmod +x bootstrap.sh
   ./bootstrap.sh
   ```

5. Le script crée automatiquement :
   - 📦 Bucket S3 `migso-pcubed-tfstate-<account-id>` (state Terraform)
   - 🔒 Table DynamoDB `migso-pcubed-tfstate-lock` (verrouillage)
   - 🔑 Provider OIDC GitHub
   - 👤 Rôle IAM `github-actions-migso-pcubed-deploy`

6. À la fin, **copie l'ARN affiché** :
   ```
   arn:aws:iam::123456789012:role/github-actions-migso-pcubed-deploy
   ```

> 💡 Si `curl` ne trouve pas le fichier, c'est que le repo n'est pas encore pushé. Dans ce cas, copie le contenu de `bootstrap-tfstate.sh` directement dans CloudShell avec un éditeur : `nano bootstrap.sh` → coller → `Ctrl+O` → `Enter` → `Ctrl+X` → puis `chmod +x bootstrap.sh && ./bootstrap.sh`.

### Étape 2 — Ajouter le secret GitHub

1. Va sur https://github.com/raquiia/ai-assistant-preview-31f3caa3/settings/secrets/actions
2. Clique **New repository secret**
3. Renseigne :
   - **Name** : `AWS_ROLE_TO_ASSUME`
   - **Secret** : l'ARN copié à l'étape 1 (point 6)
4. **Add secret**

### Étape 3 — Premier déploiement

Deux options au choix :

**Option A — automatique** : faire un commit sur la branche `main` (le workflow se déclenche tout seul).

**Option B — manuel** :
1. Va sur https://github.com/raquiia/ai-assistant-preview-31f3caa3/actions
2. Clique **Deploy to AWS** dans la liste à gauche
3. Bouton **Run workflow** → branche `main` → **Run workflow**

Le pipeline tourne ~10-15 min la première fois (création de toute l'infra).

---

## 📋 Ce que fait le workflow

| Job | Description | Durée typique |
|-----|-------------|---------------|
| `build-and-push` | Build des 3 images Docker (`api`, `web`, `worker`) en parallèle et push vers ECR | 5-8 min |
| `terraform` | `terraform init` + `plan` + `apply` (crée/met à jour VPC, RDS, ECS, CloudFront, etc.) | 3-10 min |
| `ecs-deploy` | Force ECS à pull les nouvelles images (rolling update sans downtime) | 1-3 min |

---

## 🔧 Variables hardcodées dans le workflow

Si tu veux changer ces valeurs, édite `.github/workflows/deploy-aws.yml` :

| Variable | Valeur | Description |
|----------|--------|-------------|
| `AWS_REGION` | `eu-west-3` | Région AWS (Paris) |
| `PROJECT_NAME` | `migso-pcubed` | Préfixe des ressources |
| `ENVIRONMENT` | `prod` | Suffixe d'environnement |
| `TF_VERSION` | `1.9.8` | Version de Terraform |

---

## 🐛 Troubleshooting

| Erreur | Cause | Solution |
|--------|-------|----------|
| `Could not assume role with OIDC` | ARN incorrect ou trust policy | Re-lance `bootstrap-tfstate.sh` |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Le repo GitHub dans la trust policy ne match pas | Vérifier `GITHUB_OWNER`/`GITHUB_REPO` dans `bootstrap-tfstate.sh` |
| `AccessDenied` sur ECR/ECS/Terraform | Le rôle n'a pas `AdministratorAccess` | Le script l'attache automatiquement ; vérifier dans IAM Console |
| `BucketAlreadyOwnedByYou` | Bucket existe déjà | Normal au 2ᵉ run, le script saute la création |
| `Error acquiring the state lock` | Un précédent apply a planté | `aws dynamodb delete-item --table-name migso-pcubed-tfstate-lock --key '{"LockID":{"S":"..."}}'` |

---

## 🔐 Sécurité — à faire après ~1 semaine de prod

Le rôle `github-actions-migso-pcubed-deploy` a actuellement `AdministratorAccess`. Pour restreindre :

1. AWS Console → IAM → Roles → `github-actions-migso-pcubed-deploy`
2. **Detach policy** `AdministratorAccess`
3. **Add inline policy** avec uniquement les permissions nécessaires (ECR push, ECS update, Terraform sur les ressources préfixées `migso-pcubed-prod-*`)

> ⚠️ Ne jamais commiter d'access key AWS dans le repo. Le workflow utilise OIDC = pas de credentials long-terme.
