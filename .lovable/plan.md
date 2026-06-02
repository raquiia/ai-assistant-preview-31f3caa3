# Plan — JWT Cognito + mapping `cognito:groups` → rôles pour la KB

## Objectif
Toutes les routes protégées (et **prioritairement les actions Knowledge Base**) acceptent un access token Cognito, valident sa signature contre le JWKS de la User Pool, mappent `cognito:groups` au rôle applicatif, et autorisent l'action seulement si le rôle correspond — sans casser le mode local (HMAC) qui sert au dev.

## État actuel
- `CognitoAuthProvider.verify()` : OK — vérifie issuer, JWKS, `client_id` / `aud`, `token_use`, et calcule `role` depuis `cognito:groups` par priorité (`SUPER_ADMIN > MANAGER > AUDITOR > CONSULTANT`). ✅
- `jitProvisionUser()` : OK — crée la `User` row sur première connexion et resynchronise le `role` si le groupe change. ✅
- Route `GET /me` : OK — vérifie Cognito + JIT-provision. ✅
- Infra Terraform : User Pool, 4 groupes (`CONSULTANT`/`MANAGER`/`SUPER_ADMIN`/`AUDITOR`), App Client web. ✅
- ❌ **Trou de sécurité** : `function auth(repo)` (preHandler partagé par TOUS les `/admin/kb/*`, `/superadmin/*`, `/chat/*`, etc.) n'appelle que `verifyToken(... "access")` — **le token HMAC local**. En prod avec Cognito branché, un client qui présente un bearer Cognito reçoit 401, et inversement un attaquant pourrait théoriquement forger un HMAC si la clé locale fuit. Aucune route protégée ne passe par `cognitoAuth.verify`.
- ❌ Pas de `requireRole(...)` central : les routes KB font `if (!canUploadKnowledge(actor)) reply.code(403)` au cas par cas, parfois oublié.
- ❌ Frontend `cognitoProvider` envoie déjà le Bearer Cognito, mais le backend le rejette dès qu'il sort de `/me`.
- ❌ Pas de cache des claims : chaque requête refait la vérif JWKS (jose la cache déjà 10 min en interne, OK), mais on relookup `User` à chaque requête sans cache.

## Découpage

### 1. Vérificateur hybride côté API
- Extraire le préHandler dans `src/security/authMiddleware.ts` :
  - Si `cognitoAuth` est instancié → tenter `cognitoAuth.verify(header)` d'abord ; si succès, JIT-provision et `request.actor = user`.
  - Sinon, ou si le token n'est pas un JWT Cognito valide (fallback explicite contrôlé par flag `ALLOW_LOCAL_AUTH=true`, défaut **false en prod**) → `verifyToken(... "access")` local.
  - Toujours rejeter 401 si rien n'aboutit ; loguer la raison sans fuir d'info.
- Mettre en place un **cache LRU de claims** (clé = `kid+jti` ou hash du token, TTL = exp - now, max 1000 entrées) pour éviter la re-vérif sur chaque requête courte.

### 2. RBAC explicite sur les KB endpoints
- Ajouter dans `@mp/shared/rbac`:
  - `canReadKnowledge(actor)` → `SUPER_ADMIN | MANAGER | AUDITOR`.
  - `canManageKnowledge(actor)` (alias `canUploadKnowledge`, plus parlant pour publish/reindex/archive).
- Créer `requireRole(...roles: Role[])` factory dans `authMiddleware.ts` → preHandler Fastify qui renvoie 403 + audit `ACCESS_DENIED`.
- Re-câbler les routes :
  - `POST /admin/kb/upload` → `[auth, requireRole("SUPER_ADMIN")]`.
  - `POST /admin/kb/documents/:id/publish` → `[auth, requireRole("SUPER_ADMIN")]`.
  - `POST /admin/kb/documents/:id/reindex` → `[auth, requireRole("SUPER_ADMIN")]`.
  - `GET  /admin/kb/documents[/:id]` → `[auth, requireRole("SUPER_ADMIN", "MANAGER", "AUDITOR")]`.
  - `GET  /admin/kb/documents/:id/execution` → idem lecture.
- Supprimer les `if (!canUploadKnowledge…)` redondants une fois le middleware en place (defense in depth conservée pour les checks fins, ex. `canViewConversation`).

### 3. JIT provisioning durci
- Bloquer la JIT-création si `claims.email` est absent ou non vérifié (`email_verified !== true`) → 401 `email_not_verified` (corrige un bypass possible si Cognito émet un token id sans email vérifié).
- Forcer la resynchro **descendante** : si l'utilisateur est retiré de tous les groupes → `status = DISABLED` (révocation immédiate à la prochaine requête).
- Émettre `user.role_demoted` quand le rôle redescend.

### 4. Frontend
- `cognitoProvider` : aucun changement de signature, mais s'assurer que le `accessToken` est rafraîchi proactivement à `exp - 60 s` (déjà fait via Amplify si activé) — sinon ajouter un retry-once sur 401 qui appelle `refreshSession` puis re-tente.
- `KnowledgeBaseAdmin` : gating UI déjà aligné sur `SUPER_ADMIN`. Ajouter un **bandeau d'erreur** explicite si le backend renvoie 403 (`Vous n'avez pas le droit de publier`) au lieu d'un toast générique.

### 5. Infra Terraform
- `infra/aws/main.tf` (Cognito) : OK, rien à toucher.
- Ajouter `outputs.tf` :
  - `cognito_user_pool_id`, `cognito_client_id`, `cognito_issuer_url` — pour les injecter automatiquement dans la task definition ECS via `ecs.tf`.
- `ecs.tf` (task env) : ajouter `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `ALLOW_LOCAL_AUTH=false` (prod) / `true` (dev preview).
- Documenter dans `DEPLOYMENT_WAVE8.md` la procédure pour ajouter un user à un groupe (`aws cognito-idp admin-add-user-to-group`).

### 6. Tests
- `cognito-auth.test.ts` :
  - Token valide groupe `SUPER_ADMIN` → role = SUPER_ADMIN.
  - Token avec plusieurs groupes (`SUPER_ADMIN` + `MANAGER`) → SUPER_ADMIN (priorité).
  - Token sans groupe → CONSULTANT par défaut.
  - Token avec `client_id` faux → throw.
  - Token expiré → throw.
- `authMiddleware.test.ts` :
  - Cognito branché + bearer Cognito → 200, `request.actor` typé.
  - Cognito branché + bearer HMAC → 401 quand `ALLOW_LOCAL_AUTH=false`.
  - Cognito non branché + bearer HMAC → 200.
  - `requireRole("SUPER_ADMIN")` avec actor MANAGER → 403 + audit `ACCESS_DENIED`.
- `app.test.ts` KB :
  - `POST /admin/kb/upload` avec MANAGER → 403.
  - `POST /admin/kb/documents/:id/publish` avec CONSULTANT → 403.
  - `GET  /admin/kb/documents` avec AUDITOR → 200.

### 7. Documentation
- `DEPLOYMENT_WAVE8.md` :
  - Variables d'env (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `ALLOW_LOCAL_AUTH`).
  - Comment créer un user + l'ajouter à un groupe en CLI.
  - Tableau de matrice droits × rôle pour la KB.
  - Procédure de révocation (retirer du groupe, attendre <60 s pour expiration access token, rotation refresh).

## Estimation
~1 j dev + 0,5 j tests/doc = **1,5 jour**.

## Hors scope
- MFA WebAuthn / hardware key (Cognito supporte SMS+TOTP, déjà câblés via `mfa_configuration = OPTIONAL`).
- SCIM provisioning depuis un IdP externe (SAML/OIDC fédéré).
- Migration `cognito:groups` → tables `user_roles` Postgres : volontairement gardée en lecture seule depuis Cognito pour respecter la source de vérité unique.
