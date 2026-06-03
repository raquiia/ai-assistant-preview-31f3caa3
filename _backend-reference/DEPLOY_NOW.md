# 🚀 Déploiement 100% AWS — Mode "copier-coller"

Sortie totale de Lovable. Frontend + backend + base + IA → tout sur AWS, accessible via une URL HTTPS CloudFront du type `https://d123abc.cloudfront.net`.

| Paramètre | Valeur |
|---|---|
| Repo GitHub | `https://github.com/raquiia/ai-assistant-preview-31f3caa3` |
| Nom projet AWS | `mpaibot` |
| Environnement | `dev` |
| Région AWS | `eu-west-3` (Paris) |
| Email alertes | `louis.lepotvin@migso-pcubed.com` |
| Email premier admin | `louis.lepotvin@migso-pcubed.com` |
| Domaine | aucun pour l'instant → URL CloudFront brute (HTTPS auto) |

---

## ÉTAPE 1 — Email à ton admin AWS Organizations

**Action :** copier le bloc, coller dans un email à l'admin AWS de ton orga, attendre la confirmation (1-2 jours).

```text
Objet : Création sous-compte AWS dédié — projet mpaibot (assistant IA interne)

Bonjour,

Je dois déployer une nouvelle app interne (assistant IA "mpaibot"). Peux-tu me
créer un sous-compte AWS dédié dans l'Organization, isolé des comptes appxx-*
existants ?

Détails :
- Nom du compte : mpaibot-dev (ou équivalent selon votre convention)
- OU rattachement : OU "Workloads/Dev" ou équivalent
- Email racine : à ta convenance (compte technique)
- Accès demandé : SSO pour louis.lepotvin@migso-pcubed.com avec rôle
  AdministratorAccess (le temps du bootstrap, à restreindre ensuite)
- Région principale : eu-west-3 (Paris) — contrainte RGPD
- Services AWS utilisés : VPC, ECS Fargate, RDS Postgres, OpenSearch Serverless,
  S3, SQS, Cognito, Secrets Manager, KMS, CloudFront, WAF, Bedrock, Textract,
  Transcribe, Lambda, DynamoDB, Step Functions, CloudWatch, GuardDuty,
  SecurityHub, Config
- Garde-fous demandés :
  * AWS Budgets activé sur le compte avec alerte email à 500€/mois vers
    louis.lepotvin@migso-pcubed.com
  * CloudTrail organization-wide (probablement déjà en place)
- Pas besoin de SCP restrictive supplémentaire : je reste sur services
  standards et tout est isolé dans ce sous-compte.

Merci de me confirmer dès que les accès SSO sont prêts.
```

---

## ÉTAPE 2 — Pousser le repo sur GitHub (déjà fait normalement)

Vérifie sur https://github.com/raquiia/ai-assistant-preview-31f3caa3/tree/main/_backend-reference/infra/aws — tu dois voir les fichiers `.tf`. Si vide, dans Lovable : bouton `+` (chat) → **GitHub** → **Connect project**.

---

## ÉTAPE 3 — Déploiement complet AWS via CloudShell

**Action :**
1. Console AWS → sous-compte **mpaibot-dev** (via SSO)
2. Région **"Europe (Paris) eu-west-3"** (en haut à droite)
3. Icône **CloudShell** (`>_` à côté de la cloche en haut à droite)
4. Attends que le terminal soit prêt (10-20 sec)
5. **Copie-colle EXACTEMENT le bloc ci-dessous**, presse Entrée à la fin :

```bash
set -e
export AWS_REGION=eu-west-3
export PROJECT_NAME=mpaibot
export ENVIRONMENT=dev
export ALARM_EMAIL=louis.lepotvin@migso-pcubed.com
export ADMIN_EMAIL=louis.lepotvin@migso-pcubed.com
export REPO_URL=https://github.com/raquiia/ai-assistant-preview-31f3caa3

echo "=== Vérification du compte AWS ==="
aws sts get-caller-identity
echo ""
read -p "↑ Vérifie que c'est BIEN le compte mpaibot-dev. ENTRÉE pour continuer, Ctrl+C pour annuler. " _

echo "=== Installation de Terraform ==="
if ! command -v terraform &>/dev/null; then
  TF_VERSION=1.9.8
  curl -sLo /tmp/tf.zip "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_amd64.zip"
  mkdir -p "$HOME/bin"
  unzip -o /tmp/tf.zip -d "$HOME/bin"
  chmod +x "$HOME/bin/terraform"
  export PATH="$HOME/bin:$PATH"
fi
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
terraform version

echo "=== Clone du repo ==="
rm -rf ~/mpaibot
git clone "$REPO_URL" ~/mpaibot
cd ~/mpaibot/_backend-reference

echo "=== Configuration Terraform (1er passage : sans URL CloudFront connue) ==="
cat > infra/aws/terraform.tfvars <<EOF
aws_region        = "$AWS_REGION"
project_name      = "$PROJECT_NAME"
environment       = "$ENVIRONMENT"
alarm_email       = "$ALARM_EMAIL"
web_domain        = ""
enable_cloudfront = true
EOF

echo "=== Déploiement initial (15-25 min, ne ferme pas l'onglet) ==="
chmod +x scripts/*.sh
./scripts/deploy.sh

echo "=== Récupération de l'URL CloudFront ==="
cd infra/aws
CF_DOMAIN=$(terraform output -raw cloudfront_domain)
APP_URL="https://$CF_DOMAIN"
echo "→ URL de l'app : $APP_URL"

echo "=== 2e passage : injecter l'URL CloudFront dans Cognito + CORS ==="
cat > terraform.tfvars <<EOF
aws_region          = "$AWS_REGION"
project_name        = "$PROJECT_NAME"
environment         = "$ENVIRONMENT"
alarm_email         = "$ALARM_EMAIL"
web_domain          = ""
enable_cloudfront   = true
web_allowed_origins = ["$APP_URL"]
web_callback_urls   = ["$APP_URL/callback"]
web_logout_urls     = ["$APP_URL"]
EOF
terraform apply -auto-approve

echo "=== Création du premier SUPER_ADMIN ==="
POOL_ID=$(terraform output -raw cognito_user_pool_id)
CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id)

aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true \
  --region "$AWS_REGION" || echo "(user existe déjà, on passe)"

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --group-name SUPER_ADMIN \
  --region "$AWS_REGION"

cat <<RESUME

============================================================
🎉 DÉPLOIEMENT TERMINÉ
============================================================

🌐 URL de ton app (HTTPS) : $APP_URL

📧 Cognito a envoyé un mot de passe temporaire à :
   $ADMIN_EMAIL

🔑 Identifiants Cognito (info technique) :
   User Pool ID : $POOL_ID
   Client ID    : $CLIENT_ID
   Region       : $AWS_REGION

============================================================
ÉTAPES SUIVANTES :
1. Ouvre $APP_URL dans ton navigateur
2. Login avec $ADMIN_EMAIL + le mot de passe reçu par email
3. Définis ton mot de passe définitif
4. Tu n'as PLUS BESOIN de Lovable — l'app tourne 100% sur AWS
============================================================
RESUME
```

⏱️ **Durée totale : 20-30 minutes** (deux `terraform apply` + build des 3 images Docker). Si la session CloudShell se coupe (inactivité > 20 min), relance simplement le bloc — tout est idempotent.

---

## ÉTAPE 4 — Premier login & tests

1. Ouvre l'URL `https://d...cloudfront.net` affichée à la fin du script
2. Login avec `louis.lepotvin@migso-pcubed.com` + mot de passe temporaire reçu par email
3. Cognito te demande un nouveau mot de passe → définis-le
4. Tu arrives sur le dashboard SUPER_ADMIN
5. **Test KB** : Knowledge Base → upload un PDF court → vérifie passage `PROCESSING` → `PUBLISHED` (1-2 min)
6. **Test Chat** : pose une question liée au PDF → vérifie réponse + citations

---

## ÉTAPE 5 — Sortir complètement de Lovable

Une fois l'étape 4 validée, **tu n'as plus besoin de Lovable** :

- ❌ Pas besoin de publier le frontend Lovable
- ❌ Pas besoin de configurer des `VITE_*` dans Lovable
- ✅ Tout le code est sur GitHub (`raquiia/ai-assistant-preview-31f3caa3`)
- ✅ Toute l'infra tourne sur ton sous-compte AWS
- ✅ Le frontend est servi par CloudFront → ECS → conteneur nginx (`_backend-reference/apps/web/`)
- ✅ Chaque `git push origin main` redéploie automatiquement via `.github/workflows/deploy-aws.yml` (après config secrets GitHub, voir `DEPLOYMENT.md`)

Tu peux fermer ton compte Lovable quand tu veux. Le projet ne dépend plus que de : **GitHub** (code) + **AWS** (run).

### Ajouter ton propre domaine plus tard

Quand tu auras un domaine (acheté ou existant) :

```bash
cd ~/mpaibot/_backend-reference/infra/aws

# 1. Créer un cert ACM dans us-east-1 (CloudFront l'exige)
CERT_ARN=$(aws acm request-certificate \
  --domain-name app.mondomaine.com \
  --validation-method DNS \
  --region us-east-1 \
  --query CertificateArn --output text)
echo "→ Valide le certificat via les enregistrements DNS affichés dans la console ACM us-east-1"

# 2. Mettre à jour terraform.tfvars avec web_domain + cloudfront_certificate_arn
# 3. terraform apply
# 4. Créer un CNAME chez ton registrar : app.mondomaine.com → d...cloudfront.net
```

---

## ❌ Diagnostic rapide

| Symptôme | Action |
|---|---|
| `aws sts get-caller-identity` montre un autre compte | Mauvais profil SSO. Reconnecte-toi sur mpaibot-dev. |
| `terraform apply` échoue sur quota (VPC, EIP, OCU AOSS) | Console → **Service Quotas** → demande augmentation. Copie-moi l'erreur. |
| `deploy.sh` échoue sur push ECR | Relance le bloc — `deploy.sh` est idempotent. |
| URL CloudFront répond 502/504 | ECS encore en train de démarrer. Attends 3-5 min puis recharge. |
| Login Cognito boucle | Vérifie `terraform output cognito_user_pool_client_id` et que le 2e `apply` a bien tourné avec l'URL CF. |
| Upload KB reste `PROCESSING` | Console → CloudWatch → Logs → `/ecs/worker` → erreurs Textract. Copie-moi. |
| CloudShell timeout pendant build Docker | Relance le bloc (idempotent). Sinon utilise `nohup ./scripts/deploy.sh &`. |

Pour tout autre souci : copie-moi le message d'erreur exact.

---

## 🔁 Vie quotidienne après déploiement

| Action | Comment |
|---|---|
| Modifier le code | `git push origin main` → CI redéploie auto |
| Voir les logs API | Console → CloudWatch → Log groups → `/ecs/api` |
| Ajouter un utilisateur | Dashboard SUPER_ADMIN → User Management |
| Coût mensuel actuel | Console → Billing → Cost Explorer (filtrer tag `Project=mpaibot`) |
| Tout détruire | `./scripts/destroy.sh` (⚠️ irréversible) |
