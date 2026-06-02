
# Plan — Front mp-ai-assistant dans Lovable, backend AWS intact

## Principe directeur

**Votre repo `mp-ai-assistant` et votre archi AWS ne sont pas touchés.** Ce projet Lovable devient un **second repo séparé**, dédié au front uniquement. Quand le front est prêt, vous décidez comment l'intégrer côté AWS (merge dans `apps/web`, déploiement séparé, ou autre).

```
mp-ai-assistant (votre repo, AWS)     ← INTACT, rien ne bouge
       │
       │ (point de départ : je lis le code de apps/web)
       ▼
mp-ai-assistant-front-lovable (nouveau repo)  ← édité ici
       │
       │ push auto à chaque modif
       ▼
GitHub → vous décidez quand/comment réintégrer
```

## Ce que je fais

### 1. Setup du projet Lovable
- Garder le scaffold **TanStack Start** actuel (pour conserver le preview live).
- Connecter ce projet à GitHub → création d'un nouveau repo `mp-ai-assistant-front-lovable` (ou nom de votre choix).
- Aucune modification dans `mp-ai-assistant`.

### 2. Portage du front `apps/web`
- Lire le code de `apps/web` depuis le clone que j'ai déjà.
- Porter les pages, composants, hooks, styles dans la structure TanStack Start :
  - `apps/web/src/pages/*` → `src/routes/*.tsx` (file-based routing TanStack)
  - `apps/web/src/components/*` → `src/components/*`
  - `apps/web/src/lib/*`, `hooks/*`, `styles/*` → équivalents ici
- Adapter le routing React Router → TanStack Router (différences mineures : `<Link>`, `useNavigate`, params).
- Conserver l'identité visuelle exacte (Tailwind, design tokens, fonts).

### 3. Couche API abstraite (clé pour ne pas casser AWS)
- Créer `src/lib/api/` qui expose les mêmes fonctions que votre client API actuel (`login`, `sendMessage`, `getSources`, etc.).
- Deux implémentations derrière la même interface :
  - **Mode mock** (par défaut ici) : données fictives pour itérer sur l'UI sans backend.
  - **Mode réel** : appelle votre API Fastify via `VITE_API_URL` (à activer quand vous aurez les accès AWS, ou via ngrok).
- Bascule via variable d'env `VITE_USE_MOCKS=true|false`.
- Les **contrats TypeScript** (types des requêtes/réponses) sont copiés depuis votre repo pour rester alignés avec Fastify/Prisma.

### 4. Ce qui est exclu volontairement
- Pas de portage de `apps/api`, `apps/worker`, `packages/ai`, `packages/rag`, Prisma, Terraform, docker-compose.
- Pas de tentative de réimplémenter le RAG, l'auth, les rôles côté Lovable Cloud.
- Pas de modif dans `mp-ai-assistant`.

## Organisation cible (front Lovable)

```
src/
  routes/
    __root.tsx              # layout (header, providers)
    index.tsx               # redirect vers /login ou /chat selon session mock
    login.tsx
    _authenticated.tsx      # garde de route (mock session)
    _authenticated.chat.tsx
    _authenticated.history.tsx
    _authenticated.admin.kb.tsx        # si rôle manager/admin
    _authenticated.admin.users.tsx     # si rôle superadmin
  components/
    chat/                    # MessageBubble, SourceCard, FeedbackButtons…
    layout/                  # Header, Sidebar, RoleBadge
    ui/                      # shadcn (déjà présent)
  lib/
    api/
      types.ts               # contrats partagés avec apps/api
      client.ts              # façade (mock | real)
      mocks/                 # données fictives
    auth/
      session.ts             # mock session + role helpers
  styles.css                 # tokens portés depuis apps/web
```

## Workflow attendu

1. Je porte écran par écran (login → chat → historique → admin KB → admin users).
2. Chaque écran fonctionne dans le preview Lovable avec données mockées.
3. Commit auto + push sur le nouveau repo GitHub à chaque étape.
4. Quand vous aurez les accès AWS : on bascule `VITE_USE_MOCKS=false` + `VITE_API_URL=https://votre-api`, et on règle les éventuels écarts (CORS, formats).
5. Réintégration finale dans `mp-ai-assistant/apps/web` : copie manuelle des fichiers ou PR depuis le nouveau repo.

## Risques et limites assumés

- **Divergence temporaire** entre ce front et celui de `mp-ai-assistant/apps/web`. Tant que vous n'éditez pas `apps/web` en parallèle, pas de souci de merge.
- **TanStack Router ≠ React Router** : quelques patterns diffèrent (loaders, params). Adaptés au cas par cas, l'UI reste identique.
- **Mocks ≠ vraie API** : il faudra une passe d'intégration quand vous aurez AWS pour caler les formats exacts.
- **Pas de test end-to-end ici** (pas de Postgres/OpenSearch/Redis). Validation finale sur AWS.

## Étapes d'exécution (ordre)

1. Connexion GitHub + création du nouveau repo (action utilisateur via menu + → GitHub).
2. Portage de la base : routes vides, layout, header, design tokens.
3. Écran **Login** + mock session.
4. Écran **Chat** (cœur de l'app) : input, stream de messages, source cards, feedback.
5. Écran **Historique** des conversations.
6. Écrans **Admin** (KB, users) selon les rôles.
7. Couche API réelle prête à brancher (mais désactivée par défaut).
8. README dans le nouveau repo expliquant : comment basculer mock↔réel, comment réintégrer dans `mp-ai-assistant`.

## Pré-requis avant que je commence (en mode Build)

1. Vous connectez ce projet à GitHub (menu + → GitHub → Create Repository).
2. Vous me confirmez le nom du repo (par défaut : `mp-ai-assistant-front-lovable`).
3. Vous validez ce plan.

Une fois en mode Build, je commence par l'étape 2 (base + layout + login).
