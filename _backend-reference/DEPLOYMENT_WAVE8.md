# Wave 8 — JWT Cognito + RBAC `cognito:groups` → rôles

Objectif : toutes les routes protégées (en priorité `/admin/kb/*`) acceptent un
access token Cognito, vérifient sa signature contre le JWKS de la User Pool,
mappent `cognito:groups` au rôle applicatif et autorisent l'action via
`requireRole(...)`.

## Variables d'env (ECS task `api` et `worker`)

| Variable                | Prod                                | Dev / preview            |
| ----------------------- | ----------------------------------- | ------------------------ |
| `COGNITO_USER_POOL_ID`  | `<aws_cognito_user_pool.main.id>`   | _absent_ (HMAC local)    |
| `COGNITO_CLIENT_ID`     | `<aws_cognito_user_pool_client.web>` | _absent_                |
| `ALLOW_LOCAL_AUTH`      | `false`                             | `true` (défaut)          |
| `AWS_REGION`            | `eu-west-3`                         | `eu-west-3`              |

Les deux premières sont injectées automatiquement par `infra/aws/ecs.tf`
(via le bloc `local.common_env`). `ALLOW_LOCAL_AUTH=false` désactive
définitivement le fallback HMAC en production.

## Matrice de droits — Knowledge Base

| Route                                       | SUPER_ADMIN | MANAGER | AUDITOR | CONSULTANT |
| ------------------------------------------- | :---------: | :-----: | :-----: | :--------: |
| `POST   /admin/kb/upload`                   | ✅          | 403     | 403     | 403        |
| `POST   /admin/kb/documents/:id/publish`    | ✅          | 403     | 403     | 403        |
| `POST   /admin/kb/documents/:id/reindex`    | ✅          | 403     | 403     | 403        |
| `GET    /admin/kb/documents`                | ✅          | ✅      | ✅      | 403        |
| `GET    /admin/kb/documents/:id`            | ✅          | ✅      | ✅      | 403        |

## Création d'un utilisateur + assignation à un groupe

```bash
POOL_ID="eu-west-3_xxxxxxxxx"
EMAIL="alice@example.com"

aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --group-name SUPER_ADMIN
```

## Révocation d'un accès

```bash
aws cognito-idp admin-remove-user-from-group \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --group-name SUPER_ADMIN

# Optionnel : forcer une déconnexion immédiate côté navigateur
aws cognito-idp admin-user-global-sign-out \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL"
```

Comportement attendu :
1. Le prochain appel API présentant un access token avec **0 groupe** passe
   par `jitProvisionUser` qui met `user.status = DISABLED` et émet l'audit
   `user.disabled_by_group_removal`.
2. Le middleware `authPre` répond alors `401 Unauthorized` à toute requête
   suivante.
3. Sans `admin-user-global-sign-out`, l'access token reste valide jusqu'à
   `exp` (≤ 60 min par défaut), mais l'utilisateur est déjà bloqué côté app.

## Promotion / rétrogradation

`admin-add-user-to-group` (resp. `admin-remove-user-from-group`) → à la
prochaine requête, `jitProvisionUser` détecte le delta et émet :

- `user.role_synced` si le rôle monte ;
- `user.role_demoted` si le rôle descend (audit explicite).

Le rôle stocké en base est resynchronisé sur le rôle Cognito : **Cognito est
la source de vérité**.

## Pourquoi cette architecture

- **JWKS distant** (`createRemoteJWKSet`) → rotation transparente des clés
  Cognito sans redéploiement.
- **Cache JWKS** (jose, 10 min) → quasi-zéro overhead par requête.
- **JIT provisioning** → pas de double base utilisateurs à maintenir.
- **`email_verified` requis** sur création → prévient un bypass via mail
  non vérifié.
- **`ALLOW_LOCAL_AUTH=false` en prod** → impossible de présenter un HMAC
  signé localement même si la clé fuit.

## Smoke test post-deploy

```bash
TOKEN=$(curl -s -X POST "https://cognito-idp.eu-west-3.amazonaws.com/" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -d '{"AuthFlow":"USER_PASSWORD_AUTH","ClientId":"'"$CLIENT_ID"'","AuthParameters":{"USERNAME":"alice@example.com","PASSWORD":"…"}}' \
  | jq -r .AuthenticationResult.AccessToken)

# Doit renvoyer 200 + le user provisionné
curl -H "Authorization: Bearer $TOKEN" https://api.example.com/me

# Doit renvoyer 403 si Alice n'est pas SUPER_ADMIN
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/admin/kb/documents/doc-1/publish
```
