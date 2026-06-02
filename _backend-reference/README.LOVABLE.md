# _backend-reference/

Clone read-only de https://github.com/raquiia/mp-ai-assistant (branche main, depth=1)
au moment du portage front dans Lovable.

## Pourquoi ce dossier existe

- Donner à l'agent Lovable le **contexte complet du backend AWS** (Fastify, Prisma,
  worker, packages partagés, Terraform) pour pouvoir proposer/modifier des fichiers
  back même si le runtime AWS n'est pas connecté.
- **N'est PAS buildé par Vite/TanStack Start** : `tsconfig.json` ne compile que
  `src/**`, et rien ici n'est importé depuis `src/`. Le preview Lovable l'ignore
  totalement.

## Règles d'usage

1. **Ne pas importer** depuis `_backend-reference/` dans `src/` → casserait le build
   (dépendances Node-only incompatibles avec le runtime Cloudflare Worker).
2. **Source de vérité = le vrai repo GitHub** `raquiia/mp-ai-assistant`. Ce dossier
   est un snapshot. Toute modif faite ici doit être recopiée manuellement dans le
   vrai repo via PR.
3. **Resync** : pour rafraîchir depuis main :
   ```bash
   rm -rf _backend-reference
   git clone --depth=1 https://github.com/raquiia/mp-ai-assistant.git _backend-reference
   rm -rf _backend-reference/.git
   ```

## Workflow proposé

- Front : modifié directement dans `src/mp/*` (visible dans le preview Lovable).
- Back : modifié ici dans `_backend-reference/apps/api`, `apps/worker`,
  `packages/*` → l'utilisateur copie ensuite les diffs dans son repo local et
  pousse via PR.
