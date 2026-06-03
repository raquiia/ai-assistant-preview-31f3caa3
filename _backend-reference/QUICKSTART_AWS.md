# 🚀 Quickstart AWS — Pour débutant total

> Tu as un compte AWS avec droits admin et **zéro** connaissance AWS ?
> Suis ce guide **dans l'ordre**, sans rien sauter. Durée totale : ~1h30
> (dont 30 min d'attente pendant que ça déploie tout seul).

---

## 🧰 Ce que tu vas installer sur ta machine (15 min)

Tu as besoin de **4 outils**. Tout est gratuit.

### macOS
```bash
# Installer Homebrew si tu ne l'as pas (https://brew.sh)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Puis les 4 outils :
brew install awscli terraform jq
brew install --cask docker
open -a Docker   # démarre Docker Desktop
```

### Windows (PowerShell admin)
```powershell
winget install Amazon.AWSCLI
winget install HashiCorp.Terraform
winget install jqlang.jq
winget install Docker.DockerDesktop
# Redémarre, puis lance Docker Desktop manuellement
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update && sudo apt install -y awscli jq docker.io
sudo usermod -aG docker $USER && newgrp docker
# Terraform : https://developer.hashicorp.com/terraform/install
```

### Vérifier que tout est OK
```bash
aws --version        # doit afficher 2.x
terraform --version  # doit afficher 1.8+
docker --version     # doit afficher 24+
jq --version
```

---

## 🔑 Étape 1 — Connecter ton compte AWS à ta machine (5 min)

1. Va sur https://console.aws.amazon.com → en haut à droite, clique sur ton nom → **Security credentials**
2. Section **Access keys** → **Create access key** → choisis **Command Line Interface (CLI)** → coche la case → **Next** → **Create access key**
3. Tu obtiens 2 valeurs : `Access key ID` et `Secret access key` → **garde cette page ouverte**, tu ne pourras plus voir le Secret après

Sur ta machine :
```bash
aws configure --profile mp-deployer
# AWS Access Key ID:      <colle l'access key>
# AWS Secret Access Key:  <colle le secret>
# Default region name:    eu-west-3
# Default output format:  json
```

Tester :
```bash
export AWS_PROFILE=mp-deployer
aws sts get-caller-identity
# → doit afficher ton numéro de compte. Si oui : ✅ tu es connecté.
```

---

## 📥 Étape 2 — Récupérer le code (2 min)

```bash
git clone <URL-de-ton-repo-github> mp-ai
cd mp-ai
```

---

## ⚙️ Étape 3 — Configurer le déploiement (3 min)

```bash
cd _backend-reference/infra/aws
cp terraform.tfvars.example terraform.tfvars
```

Ouvre `terraform.tfvars` dans ton éditeur. **Tu as juste 2 lignes à changer** :

```hcl
environment  = "dev"          # laisse "dev" pour le premier essai
alarm_email  = "toi@mail.com" # ton email pour recevoir les alertes
```

Tout le reste est OK par défaut. Sauvegarde.

---

## 🚀 Étape 4 — LE DÉPLOIEMENT (lance et va prendre un café — 25 min)

```bash
cd ../..   # retour à _backend-reference/
export AWS_PROFILE=mp-deployer
export AWS_REGION=eu-west-3
./scripts/deploy.sh
```

**Ce que tu vas voir défiler :**
1. ⏱️ ~10 min : Terraform crée le réseau, la base de données, les serveurs (VPC, RDS, ECS, Cognito, S3, etc.)
2. ⏱️ ~8 min : Docker construit et envoie les 3 images d'application
3. ⏱️ ~5 min : Terraform redéploie avec les nouvelles images
4. ⏱️ ~2 min : La base de données est initialisée

**À la fin tu verras :**
```
✅ Deployment complete
   API + Web:  http://mp-xxx-alb-yyy.eu-west-3.elb.amazonaws.com
```

**📋 Note cette URL** — c'est ton backend.

### Si ça plante
- **"Docker daemon not running"** → ouvre Docker Desktop, attends qu'il démarre, relance
- **"AccessDenied"** → ton user IAM n'a pas les droits admin (étape 1 à refaire)
- **"Region not enabled"** → va dans la console AWS → Account → Régions et active `eu-west-3`
- **Autre erreur** → relance simplement `./scripts/deploy.sh` (le script est idempotent, il reprend où il en est)

---

## 👤 Étape 5 — Créer ton premier compte admin (3 min)

```bash
cd infra/aws
POOL_ID=$(terraform output -raw cognito_user_pool_id)
CLIENT_ID=$(terraform output -raw cognito_client_id)
cd ../..

# Remplace par TON email
EMAIL="toi@migso-pcubed.com"

aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --group-name SUPER_ADMIN

echo "✅ Compte créé. Mot de passe temporaire envoyé à $EMAIL"
echo "Pool ID    : $POOL_ID"
echo "Client ID  : $CLIENT_ID"
```

**Garde ces 2 IDs**, tu en as besoin à l'étape suivante.

---

## 🔗 Étape 6 — Connecter Lovable au backend AWS (2 min)

Dans l'éditeur Lovable :
1. Bouton ⚙️ **Project Settings** → onglet **Environment Variables**
2. Ajoute ces 5 variables :

| Nom | Valeur |
|---|---|
| `VITE_API_URL` | l'URL ALB de l'étape 4 |
| `VITE_AUTH_MODE` | `cognito` |
| `VITE_COGNITO_REGION` | `eu-west-3` |
| `VITE_COGNITO_USER_POOL_ID` | le Pool ID de l'étape 5 |
| `VITE_COGNITO_CLIENT_ID` | le Client ID de l'étape 5 |

3. Clique **Publish** en haut à droite de l'éditeur Lovable
4. Ton app est maintenant connectée à ton backend AWS 🎉

---

## ✅ Étape 7 — Tester que tout marche (5 min)

1. Ouvre l'URL publiée de ton app Lovable
2. **Se connecter** avec l'email de l'étape 5 + mot de passe reçu par email
3. Tu vas être forcé de changer le mot de passe (normal, c'est Cognito)
4. **Test 1 — Knowledge Base** : upload un PDF → tu dois voir le statut passer `PROCESSING` → `PUBLISHED` en 1-2 min
5. **Test 2 — Chat** : pose une question → tu dois avoir une réponse avec des citations

Si les 2 tests passent : **✅ ton app est 100% fonctionnelle sur AWS.**

---

## 💸 Combien ça coûte ?

En `environment = "dev"` avec la conf par défaut : **~400 €/mois**
(RDS Multi-AZ + OpenSearch Serverless sont les 2 plus gros postes).

**Pour économiser** pendant les tests, édite `terraform.tfvars` :
```hcl
rds_multi_az            = false   # -55 € / mois
rds_deletion_protection = false   # permet de tout supprimer plus tard
api_desired_count       = 1       # -30 € / mois
worker_desired_count    = 1
```
Puis relance `./scripts/deploy.sh`.

Une alerte email automatique te prévient à 80% du budget (configurée dans `aws-budgets.tf`).

---

## 🧹 Tout supprimer si tu veux arrêter (5 min)

```bash
cd _backend-reference
./scripts/destroy.sh
```
⚠️ **Irréversible** — supprime base de données, fichiers, tout.

---

## 🆘 Besoin d'aide ?

- **Logs API en direct** : Console AWS → CloudWatch → Log groups → `/ecs/api`
- **État des serveurs** : Console AWS → ECS → cluster `mp-...` → Services
- **Documentation détaillée** : `DEPLOYMENT.md` dans ce même dossier
- **Sécurité Cognito + RBAC** : `DEPLOYMENT_WAVE8.md`
- **Pipeline OCR Textract** : `DEPLOYMENT_WAVE7.md`

Pour toute erreur, copie le message dans le chat Lovable, je t'aide à diagnostiquer.
