# Plan — Auth Cognito côté frontend avec fallback local

## Objectif

Permettre au frontend (`src/mp/`) de basculer entre :
- **Mode `local`** (défaut, dev) : POST `/auth/login` → JWT custom du backend Fastify
- **Mode `cognito`** (prod AWS) : SDK Cognito → JWT RS256 du User Pool

Le choix se fait via une variable d'environnement Vite, **sans rework visuel** de `LoginPage.tsx`.

## Architecture cible

```text
LoginPage.tsx
   │
   ▼
authProvider (interface)
   ├── LocalAuthProvider    → POST /auth/login (actuel)
   └── CognitoAuthProvider  → amazon-cognito-identity-js
              │
              ▼
       Session { token, user, refreshToken? }
              │
              ▼
       ApiClient (Authorization: Bearer <token>)
              │
              ▼
       API Fastify ── verify() ──┬── tokens.ts (HS256 local)
                                 └── providers/aws/cognito-auth.ts (RS256 JWKS)
```

Le backend a déjà les deux vérificateurs en place (`security/tokens.ts` + `providers/aws/cognito-auth.ts`). Côté frontend, seule la **production du token** change.

## Changements frontend

### 1. Variables d'environnement (`.env.example` + types Vite)
```
VITE_AUTH_MODE=local           # ou "cognito"
VITE_COGNITO_REGION=eu-west-3
VITE_COGNITO_USER_POOL_ID=
VITE_COGNITO_CLIENT_ID=
```
Ces valeurs sont publiques (publishable) → OK dans le bundle.

### 2. Nouvelle abstraction `src/mp/auth/providers.ts`
Interface commune :
```ts
interface AuthProvider {
  signIn(email, password): Promise<Session>
  signOut(session): Promise<void>
  refresh?(session): Promise<Session>
  getUserFromToken(token): Promise<User>  // pour rehydrate
}
```

### 3. Deux implémentations
- `src/mp/auth/localProvider.ts` — extrait le code actuel de `LoginPage.submit()`
- `src/mp/auth/cognitoProvider.ts` — utilise `amazon-cognito-identity-js` :
  - `CognitoUser.authenticateUser()` → récupère `idToken` + `refreshToken`
  - Map des `cognito:groups` → `Role` (déjà fait côté backend, mais on en a besoin pour l'UI immédiate)
  - Récupère le profil applicatif via `GET /me` (endpoint backend qui lit `request.user` injecté par le middleware Cognito)

### 4. Factory `src/mp/auth/index.ts`
```ts
export const authProvider: AuthProvider =
  import.meta.env.VITE_AUTH_MODE === "cognito"
    ? new CognitoAuthProvider({...})
    : new LocalAuthProvider(api);
```

### 5. Refactor minimal
- **`LoginPage.tsx`** : remplace l'appel direct `api.post("/auth/login", ...)` par `authProvider.signIn(email, password)`. **Zéro changement visuel.** Le bloc "Comptes disponibles" devient conditionnel (caché en mode cognito).
- **`auth.tsx` (AuthProvider React)** : `logout()` appelle `authProvider.signOut()` ; au boot, si session stockée → option `refresh()`.
- **`api.ts` (ApiClient)** : aucun changement — continue à attacher `Bearer <token>` ; le backend route vers le bon verifier selon l'émetteur.

### 6. Dépendance
```
bun add amazon-cognito-identity-js
```
(léger, ~50KB gzip, pas besoin de tout `aws-amplify`)

## Changements backend (mineurs)

Dans `_backend-reference/apps/api/src/app.ts` :
- Middleware d'auth déjà conditionné par `bootstrap.ts` (Cognito si `COGNITO_USER_POOL_ID` présent, sinon tokens locaux). **Rien à changer.**
- Vérifier qu'un endpoint `GET /me` existe et retourne le `User` applicatif à partir de `request.user.sub` (créer le user en DB au premier login si absent — "JIT provisioning"). À ajouter si manquant.

## Bootstrap utilisateur en prod

Documenté brièvement dans `DEPLOYMENT.md` (déjà fait) — création du premier admin via :
```
aws cognito-idp admin-create-user --user-pool-id ... --username admin@... \
  --user-attributes Name=email,Value=admin@... \
  --temporary-password '...'
aws cognito-idp admin-add-user-to-group --group-name SUPER_ADMIN ...
```

## Fichiers à créer / modifier

**Créer**
- `src/mp/auth/providers.ts` (interface + types)
- `src/mp/auth/localProvider.ts`
- `src/mp/auth/cognitoProvider.ts`
- `src/mp/auth/index.ts` (factory)

**Modifier**
- `src/mp/components/LoginPage.tsx` (1 ligne effective : remplace `api.post` par `authProvider.signIn`)
- `src/mp/auth.tsx` (logout → `authProvider.signOut`)
- `.env.example` (+ `vite-env.d.ts` si typage strict)
- `package.json` (dépendance)
- `_backend-reference/apps/api/src/app.ts` (endpoint `/me` si absent + JIT user provisioning depuis claims Cognito)

**Inchangé**
- Tout le reste de l'UI (`ChatShell`, `AdminLayout`, etc.)
- Le visuel de `LoginPage`
- L'ApiClient et la signature des requêtes

## Validation

1. `VITE_AUTH_MODE=local` → comportement actuel identique (login dev fonctionne)
2. `VITE_AUTH_MODE=cognito` + User Pool dummy → erreur claire si vars manquantes
3. Build prod : pas de leak du SDK Cognito dans le bundle local (code-split dynamique de `cognitoProvider.ts` si bundle size critique)

## Hors scope (à faire plus tard si besoin)

- Cognito Hosted UI (redirect OAuth) — on reste sur formulaire custom
- MFA / SMS challenge — Cognito le supporte mais ajoute des étapes UI
- "Forgot password" flow Cognito — peut être ajouté en V2
- Migration des utilisateurs locaux existants vers Cognito (script séparé)
