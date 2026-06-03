# 🚀 Déploiement AWS — Mode "copier-coller"

Tout est pré-rempli pour ton projet. Suis les étapes dans l'ordre, sans rien modifier.

| Paramètre | Valeur |
|---|---|
| Repo GitHub | `https://github.com/raquiia/ai-assistant-preview-31f3caa3` |
| Nom projet AWS | `mpaibot` |
| Environnement | `dev` |
| Région AWS | `eu-west-3` (Paris) |
| Email alertes | `louis.lepotvin@migso-pcubed.com` |
| Email premier admin | `louis.lepotvin@migso-pcubed.com` |

---

## ÉTAPE 1 — Message à envoyer à ton admin AWS Organizations

**Action :** copier le bloc ci-dessous, le coller dans un email à l'admin AWS de ton orga, et attendre la confirmation (1-2 jours).

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

## ÉTAPE 2 — Préparer le repo (à faire UNE FOIS depuis Lovable)

**Action :** dans Lovable, clique sur le bouton **GitHub** (menu `+` en bas à gauche du chat) → **Connect project** si pas encore fait, puis attends que tout le contenu de `_backend-reference/` soit bien poussé sur le repo `raquiia/ai-assistant-preview-31f3caa3`.

Vérification (optionnel) : ouvre https://github.com/raquiia/ai-assistant-preview-31f3caa3/tree/main/_backend-reference/infra/aws — tu dois voir les fichiers `.tf`.

---

## ÉTAPE 3 — Premier déploiement AWS via CloudShell

**Action :**
1. Connecte-toi à la console AWS sur le **sous-compte mpaibot-dev** (via SSO)
2. En haut à droite, **change la région en "Europe (Paris) eu-west-3"**
3. Clique sur l'icône **CloudShell** (icône terminal `>_` en haut à droite à côté de la cloche)
4. Attends que le terminal soit prêt (10-20 sec)
5. **Copie-colle EXACTEMENT le bloc ci-dessous** (un seul gros copier-coller, presse Entrée à la fin) :

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
read -p "↑ Vérifie que c'est BIEN le compte mpaibot-dev. Tape ENTRÉE pour continuer, Ctrl+C pour annuler." _

echo "=== Installation de Terraform (CloudShell ne l'a pas par défaut) ==="
if ! command -v terraform &>/dev/null; then
  TF_VERSION=1.9.8
  curl -sLo /tmp/tf.zip "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_amd64.zip"
  unzip -o /tmp/tf.zip -d "$HOME/bin"
  chmod +x "$HOME/bin/terraform"
  export PATH="$HOME/bin:$PATH"
fi
terraform version

echo "=== Clone du repo ==="
rm -rf ~/mpaibot
git clone "$REPO_URL" ~/mpaibot
cd ~/mpaibot/_backend-reference

echo "=== Configuration Terraform ==="
cat > infra/aws/terraform.tfvars <<EOF
aws_region   = "$AWS_REGION"
project_name = "$PROJECT_NAME"
environment  = "$ENVIRONMENT"
alarm_email  = "$ALARM_EMAIL"
web_domain   = ""
EOF
echo "→ terraform.tfvars créé"

echo "=== Lancement du déploiement (15-25 min, ne ferme pas l'onglet) ==="
chmod +x scripts/*.sh
./scripts/deploy.sh

echo ""
echo "============================================================"
echo "✅ Déploiement terminé. Récupération des sorties..."
echo "============================================================"
cd infra/aws
ALB_URL=$(terraform output -raw alb_url 2>/dev/null || echo "N/A")
POOL_ID=$(terraform output -raw cognito_user_pool_id)
CLIENT_ID=$(terraform output -raw cognito_client_id)

echo ""
echo "=== Création du premier SUPER_ADMIN ==="
aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true \
  --region "$AWS_REGION"
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --group-name SUPER_ADMIN \
  --region "$AWS_REGION"

echo ""
echo "============================================================"
echo "🎉 TOUT EST PRÊT. Variables à copier dans Lovable :"
echo "============================================================"
echo "VITE_API_URL=https://$ALB_URL"
echo "VITE_AUTH_MODE=cognito"
echo "VITE_COGNITO_REGION=$AWS_REGION"
echo "VITE_COGNITO_USER_POOL_ID=$POOL_ID"
echo "VITE_COGNITO_CLIENT_ID=$CLIENT_ID"
echo "============================================================"
echo "📧 Cognito a envoyé un mot de passe temporaire à $ADMIN_EMAIL"
echo "============================================================"
```

⏱️ **Durée totale : 15-25 minutes.** Garde l'onglet CloudShell ouvert. Si la session se coupe (inactivité > 20 min), relance simplement le bloc — `deploy.sh` est idempotent (il reprend où il en était).

---

## ÉTAPE 4 — Connecter Lovable au backend AWS

**Action :** à la fin de l'étape 3, CloudShell affiche un bloc `VITE_…=…` (5 lignes). Copie-le tel quel.

1. Dans Lovable, clique sur le nom du projet (haut gauche) → **Settings** → **Project section** → **Environment variables** (ou via `Cmd/Ctrl+K` → "environment")
2. Colle les 5 variables (une par ligne)
3. Clique **Save**
4. En haut à droite, clique **Publish** → **Update** pour republier le frontend avec les nouvelles variables

---

## ÉTAPE 5 — Premier login & tests de fumée

1. Va sur l'URL publiée de ton app Lovable (ex: `https://mpaibot.lovable.app`)
2. Login avec `louis.lepotvin@migso-pcubed.com` + mot de passe temporaire reçu par email
3. Cognito te demande de définir un nouveau mot de passe → fais-le
4. Tu arrives sur le dashboard SUPER_ADMIN
5. **Test #1 — KB** : Knowledge Base → upload un PDF court → vérifie passage `PROCESSING` → `PUBLISHED` (peut prendre 1-2 min)
6. **Test #2 — Chat** : pose une question liée au PDF → vérifie réponse + citations

---

## ❌ Si ça casse — diagnostic rapide

| Symptôme | Action |
|---|---|
| `aws sts get-caller-identity` montre un autre compte | Mauvais profil SSO. Reconnecte-toi sur le compte mpaibot-dev. |
| `terraform apply` échoue sur quota (VPC, Elastic IP, OCU) | Console AWS → **Service Quotas** → demande l'augmentation. Email moi le message d'erreur exact. |
| `deploy.sh` échoue sur le push ECR | Relance le bloc — `deploy.sh` est idempotent. |
| Le login Lovable boucle | Vérifie que `VITE_COGNITO_CLIENT_ID` colle bien à `terraform output cognito_client_id`. |
| Upload KB reste en `PROCESSING` | Console AWS → CloudWatch → Logs → `/ecs/worker` → cherche les erreurs Textract. |

Pour tout autre souci : copie-moi le message d'erreur exact et je débugue.

---

## 🔁 Re-déploiement futur

Une fois en place, **chaque push sur la branche `main`** du repo redéploie automatiquement via `.github/workflows/deploy-aws.yml`. Tu n'as plus à toucher CloudShell, sauf pour des opérations exceptionnelles (rollback, restore RDS).

Pour activer la CI auto, voir `DEPLOYMENT.md` section "GitHub Actions OIDC".
