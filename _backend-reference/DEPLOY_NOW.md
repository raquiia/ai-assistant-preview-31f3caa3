# 🚀 Déploiement mpaibot — Mode "1 seule commande"

Tout l'infra + frontend + backend + IA sur AWS, accessible via une URL HTTPS `https://d123abc.cloudfront.net`. **Sortie totale de Lovable.**

| Paramètre | Valeur (déjà pré-configurée) |
|---|---|
| Compte AWS | `mp-dev` (sous-compte dédié) |
| Région | `eu-west-3` (Paris) |
| Repo GitHub | `raquiia/ai-assistant-preview-31f3caa3` |
| Email admin / alertes | `louis.lepotvin@migso-pcubed.com` |
| Durée totale | ~25-35 min |

---

## ✅ Pré-requis (à vérifier UNE fois)

- [ ] Tu as un accès **SSO** au sous-compte `mp-dev`
- [ ] Ton user SSO a la policy **`AdministratorAccess`** (le temps du bootstrap)
- [ ] Le repo GitHub contient bien `_backend-reference/` ([vérifier ici](https://github.com/raquiia/ai-assistant-preview-31f3caa3/tree/main/_backend-reference))

---

## 🎯 LA seule commande à lancer

1. Ouvre la **Console AWS** → compte **mp-dev** via SSO
2. **Vérifie en haut à droite** : région = **Europe (Paris) eu-west-3**
3. Clique sur l'icône **CloudShell** (`>_` à côté de la cloche)
4. Attends 10-20 sec que le terminal soit prêt
5. **Copie-colle EXACTEMENT** la commande ci-dessous et presse Entrée :

```bash
curl -sLO https://raw.githubusercontent.com/raquiia/ai-assistant-preview-31f3caa3/main/_backend-reference/scripts/bootstrap-cloudshell.sh && bash bootstrap-cloudshell.sh
```

C'est tout. Le script fait **toute la suite** automatiquement :

```text
1. ✓ Vérifie le bon compte AWS (te demande confirmation)
2. ✓ Installe Terraform 1.9.8
3. ✓ Clone le repo GitHub
4. ✓ Génère terraform.tfvars (passage 1)
5. ✓ Déploie toute l'infra + build/push des 3 images Docker (api/web/worker)
6. ✓ Récupère l'URL CloudFront générée
7. ✓ Réinjecte l'URL dans Cognito + CORS (passage 2)
8. ✓ Crée ton compte SUPER_ADMIN dans Cognito
9. ✓ Affiche l'URL finale + identifiants
```

⏱️ Si CloudShell coupe (inactivité > 20 min) : **relance exactement la même commande**, tout est idempotent.

---

## 🔑 Après le script

1. Le script affiche `🌐 URL de l'app : https://d...cloudfront.net` → **clique dessus**
2. Cognito t'a envoyé un **mot de passe temporaire par email** (vérifie les spams)
3. Login avec `louis.lepotvin@migso-pcubed.com` + mot de passe temporaire
4. Cognito te demande un mot de passe définitif → définis-le
5. Tu arrives sur le dashboard SUPER_ADMIN ✅

### Tests rapides

- **Knowledge Base** : upload un PDF court → statut passe `PROCESSING` → `PUBLISHED` en 1-2 min
- **Chat** : pose une question liée au PDF → réponse + citations

---

## 🚪 Sortie complète de Lovable

Une fois les tests OK :

- ❌ Pas besoin de publier le frontend Lovable
- ❌ Pas besoin de configurer des `VITE_*` dans Lovable
- ✅ Code = GitHub `raquiia/ai-assistant-preview-31f3caa3`
- ✅ Infra + run = AWS sous-compte `mp-dev`
- ✅ Frontend servi par CloudFront → ECS (conteneur nginx `apps/web/`)
- ✅ Chaque `git push origin main` → redéploie auto via `.github/workflows/deploy-aws.yml`
  *(une config secrets GitHub OIDC suffit, voir `DEPLOYMENT.md`)*

**Tu peux fermer ton compte Lovable.** Le projet ne dépend plus que de GitHub + AWS.

---

## 🔒 Sécurité post-bootstrap (dans la semaine)

1. Console IAM Identity Center → ton user SSO → **détacher `AdministratorAccess`**
2. Attacher un set de permissions restreint :
   - `CloudWatchReadOnlyAccess` (logs/metrics)
   - `AmazonECS_ReadOnlyAccess` (état services)
   - `AmazonRDSReadOnlyAccess` (état DB)
3. Les redéploiements passent désormais par **GitHub Actions** (rôle OIDC dédié, déjà configuré)

---

## ❌ Diagnostic rapide

| Symptôme | Action |
|---|---|
| `aws sts get-caller-identity` montre un autre compte | Mauvais profil SSO. Reconnecte-toi sur **mp-dev** |
| `terraform apply` échoue sur quota (VPC/EIP/OCU AOSS) | Console → **Service Quotas** → demander l'augmentation. Copie-moi l'erreur. |
| `deploy.sh` échoue sur push ECR | Relance la commande — tout est idempotent |
| URL CloudFront répond 502/504 | ECS démarre encore. Attends 3-5 min puis recharge |
| Login Cognito boucle | Vérifie que le **2e** `terraform apply` a bien tourné (avec l'URL CF) |
| Upload KB reste `PROCESSING` | CloudWatch → `/ecs/worker` → cherche erreurs Textract → copie-moi |
| CloudShell timeout pendant build | Relance la commande, c'est idempotent |
| `Access Denied` IAM divers | Vérifie que ton user SSO a bien `AdministratorAccess` ATTACHÉE |

Pour tout autre souci : **copie-moi le message d'erreur exact** depuis CloudShell.

---

## 🔁 Vie quotidienne après déploiement

| Action | Comment |
|---|---|
| Modifier le code | `git push origin main` → CI redéploie auto |
| Voir les logs API | Console → CloudWatch → Log groups → `/ecs/api` |
| Ajouter un utilisateur | Dashboard SUPER_ADMIN → User Management |
| Voir le coût | Console → Billing → Cost Explorer (filtrer tag `Project=mpaibot`) |
| Ajouter un domaine custom | Voir section "Ajouter ton propre domaine" dans `DEPLOYMENT.md` |
| Tout détruire | `cd ~/mpaibot/_backend-reference && ./scripts/destroy.sh` ⚠️ |
