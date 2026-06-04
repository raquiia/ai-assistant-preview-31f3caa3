#!/usr/bin/env bash
# ============================================================================
# mpaibot — Bootstrap déploiement AWS depuis CloudShell
# ============================================================================
# Usage (dans AWS CloudShell, région eu-west-3, compte mp-dev) :
#
#   curl -sLO https://raw.githubusercontent.com/raquiia/ai-assistant-preview-31f3caa3/main/_backend-reference/scripts/bootstrap-cloudshell.sh
#   bash bootstrap-cloudshell.sh
#
# Le script est 100% idempotent : si CloudShell coupe (inactivité > 20 min),
# relance simplement la même commande.
# ============================================================================
set -euo pipefail

# ----- PARAMÈTRES (modifiables si besoin via export avant de lancer) -----
: "${AWS_REGION:=eu-west-3}"
: "${PROJECT_NAME:=mpaibot}"
: "${ENVIRONMENT:=dev}"
: "${ALARM_EMAIL:=louis.lepotvin@migso-pcubed.com}"
: "${ADMIN_EMAIL:=louis.lepotvin@migso-pcubed.com}"
: "${REPO_URL:=https://github.com/raquiia/ai-assistant-preview-31f3caa3}"
: "${WORK_DIR:=$HOME/mpaibot}"

export AWS_REGION

banner() { echo ""; echo "════════════════════════════════════════════════════════════"; echo "▶ $1"; echo "════════════════════════════════════════════════════════════"; }

# ============================================================================
# ÉTAPE 1 — Vérification du compte AWS
# ============================================================================
banner "Vérification du compte AWS"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ACCOUNT_ARN=$(aws sts get-caller-identity --query Arn --output text)
echo "Compte AWS : $ACCOUNT_ID"
echo "Identité   : $ACCOUNT_ARN"
echo "Région     : $AWS_REGION"
echo ""
read -p "✋ Confirme que c'est bien le compte mp-dev (ENTRÉE = continuer, Ctrl+C = annuler) " _

# ============================================================================
# ÉTAPE 2 — Installation de Terraform
# ============================================================================
banner "Installation de Terraform"
if ! command -v terraform >/dev/null 2>&1; then
  TF_VERSION=1.9.8
  curl -sLo /tmp/tf.zip "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_amd64.zip"
  mkdir -p "$HOME/bin"
  unzip -o /tmp/tf.zip -d "$HOME/bin" >/dev/null
  chmod +x "$HOME/bin/terraform"
fi
export PATH="$HOME/bin:$PATH"
grep -q 'HOME/bin' ~/.bashrc || echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
terraform version

# ============================================================================
# ÉTAPE 3 — Clone / mise à jour du repo
# ============================================================================
banner "Clone du repo GitHub"
if [[ -d "$WORK_DIR/.git" ]]; then
  echo "Repo déjà cloné, mise à jour…"
  git -C "$WORK_DIR" pull --ff-only
else
  rm -rf "$WORK_DIR"
  git clone "$REPO_URL" "$WORK_DIR"
fi
cd "$WORK_DIR/_backend-reference"
chmod +x scripts/*.sh

# ============================================================================
# ÉTAPE 4 — Génération terraform.tfvars (1er passage, sans URL CloudFront)
# ============================================================================
banner "Configuration Terraform (passage 1)"
cat > infra/aws/terraform.tfvars <<EOF
aws_region        = "$AWS_REGION"
project_name      = "$PROJECT_NAME"
environment       = "$ENVIRONMENT"
alarm_email       = "$ALARM_EMAIL"
web_domain        = ""
enable_cloudfront = true
EOF
echo "✓ infra/aws/terraform.tfvars écrit"

# ============================================================================
# ÉTAPE 5 — Déploiement complet (15-25 min)
# ============================================================================
banner "Déploiement Terraform + build Docker (15-25 min, ne ferme pas l'onglet)"
./scripts/deploy.sh

# ============================================================================
# ÉTAPE 6 — Récupération de l'URL CloudFront
# ============================================================================
banner "Récupération de l'URL CloudFront"
cd infra/aws
CF_DOMAIN=$(terraform output -raw cloudfront_domain)
APP_URL="https://$CF_DOMAIN"
echo "✓ URL de l'app : $APP_URL"

# ============================================================================
# ÉTAPE 7 — 2e passage : injecter l'URL CloudFront dans Cognito + CORS
# ============================================================================
banner "Configuration Cognito + CORS (passage 2)"
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

# ============================================================================
# ÉTAPE 8 — Création du premier SUPER_ADMIN
# ============================================================================
banner "Création du premier SUPER_ADMIN"
POOL_ID=$(terraform output -raw cognito_user_pool_id)
CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id)

aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true \
  --region "$AWS_REGION" 2>/dev/null || echo "ℹ️  User existe déjà, on passe à l'ajout au groupe"

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --group-name SUPER_ADMIN \
  --region "$AWS_REGION"

# ============================================================================
# RÉSUMÉ FINAL
# ============================================================================
cat <<RESUME

╔════════════════════════════════════════════════════════════╗
║  🎉  DÉPLOIEMENT TERMINÉ                                   ║
╚════════════════════════════════════════════════════════════╝

🌐 URL de l'app (HTTPS)  : $APP_URL

📧 Cognito a envoyé un mot de passe temporaire à :
   $ADMIN_EMAIL
   (vérifie aussi les spams)

🔑 Infos techniques (à garder dans un gestionnaire de mots de passe) :
   AWS Account     : $ACCOUNT_ID
   Région          : $AWS_REGION
   User Pool ID    : $POOL_ID
   Client ID       : $CLIENT_ID

────────────────────────────────────────────────────────────
📋 ÉTAPES SUIVANTES :
   1. Ouvre $APP_URL dans ton navigateur
   2. Login avec $ADMIN_EMAIL + le mot de passe temporaire reçu
   3. Définis ton mot de passe définitif
   4. Tu n'as PLUS BESOIN de Lovable — l'app tourne 100% sur AWS
   5. Pour redéployer après modif : git push origin main
      (GitHub Actions prend le relais — voir DEPLOYMENT.md)

🔒 SÉCURITÉ POST-BOOTSTRAP (à faire dans la semaine) :
   - Détache AdministratorAccess de ton user SSO
   - Attache un rôle restreint (CloudWatchReadOnlyAccess + ECSReadOnly)
   - Les futurs déploiements passent par GitHub Actions (rôle OIDC dédié)
────────────────────────────────────────────────────────────
RESUME
