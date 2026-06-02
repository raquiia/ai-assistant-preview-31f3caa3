## Contexte (existant déjà en place)

- **Backend de référence** (`_backend-reference/`)
  - `ModelRouter.answer()` : Mistral en primaire → fallback OpenAI déclenché si `qualityGate` échoue ou si `forceFallback=true`. ✅
  - `HybridRetriever` (`packages/rag`) renvoie chunks + score + champs `chunkId/documentId/page/section/excerpt`. ✅
  - RBAC : `canUploadKnowledge(actor)` autorise **MANAGER ET SUPER_ADMIN** ⚠️ (à restreindre).
  - Vector store : `MockVectorProvider` actif + stub `OpenSearchVectorProvider` non câblé.
- **Frontend** (`src/mp/`)
  - `ChatShell` : confiance `/100`, badge "fallback" minuscule, bouton "Retenter avec fallback".
  - `SourceCards` : titre + score `X/100` (pas de barre de pertinence, pas de page/extrait visibles).
  - `KnowledgeBaseAdmin` : publish/reindex gated `SUPER_ADMIN` ✅, mais `UploadPanel` rendu **sans garde** ⚠️.
  - Sidebar : entrée "Knowledge Base" visible aux MANAGER/AUDITOR (lecture seule cohérente, mais l'upload doit disparaître pour eux).

---

## Plan

### 1. Audit — synthèse à livrer dans la réponse finale (lecture seule)

Tableau écart par écart (côté chat + KB + RBAC), produit en chat sans modifier le code :
- Fallback OpenAI : déclencheurs réels vs déclencheurs UI.
- Citations : champs disponibles côté back vs ce qu'on affiche.
- Permissions upload front / back.
- État du vector store (mock vs OpenSearch).

### 2. UX chat — afficher proprement la provenance de la réponse

Fichiers : `src/mp/components/ChatShell.tsx`, `src/mp/components/SourceCards.tsx`.

a. **Bandeau "réponse" enrichi** sous chaque réponse IA :
   - Provider réel : pastille `Mistral` (primaire) ou `OpenAI · fallback` (avec icône + couleur sémantique `accent` / `warning`).
   - Modèle utilisé (`response.model`).
   - Confiance : barre de progression colorée + libellé (`≥80` vert, `60–79` ambre, `<60` rouge).
   - Latence (`latencyMs`) et badge `escalation` si `escalationTriggered=true`.

b. **Refonte `SourceCards`** :
   - Carte source avec titre du document + section/page si dispo.
   - Barre de pertinence `score/100` (couleur sémantique) + valeur en `%`.
   - Extrait (2 lignes max, `line-clamp-2`) cliquable → ouvre `SourceViewer` (déjà existant).
   - Tri décroissant par score, top 5 dépliable.

c. **Action fallback explicite** :
   - Remplacer le bouton "retry-fallback" cryptique par : *"Régénérer avec OpenAI"* visible uniquement si la réponse courante a `fallbackUsed=false`.
   - Toast clair en cas d'échec.

d. **Cas "aucune source"** : conserver l'`EmptyState` mais ajouter une mention *"La base de connaissance n'a renvoyé aucun extrait ≥ seuil de pertinence (`minRelevanceScore`)"* pour aider le SUPER_ADMIN à ajuster le seuil.

### 3. Verrouillage des permissions d'upload (SUPER_ADMIN uniquement)

**Frontend**
- `KnowledgeBaseAdmin.tsx` : conditionner le rendu de `<UploadPanel />` à `session.user.role === "SUPER_ADMIN"`. Pour les autres rôles : afficher une bannière *"Lecture seule — seul le Super Admin peut alimenter la base de connaissance."*
- `UploadPanel.tsx` : double garde (le composant refuse de monter si rôle ≠ SUPER_ADMIN) + bouton désactivé.
- `src/mp/mocks.ts` : `POST /kb/documents` et `/kb/documents/:id/reindex|publish|PATCH` → rejet 403 si `session.user.role !== "SUPER_ADMIN"`.

**Backend de référence**
- `_backend-reference/packages/shared/src/rbac.ts` :
  ```ts
  export function canUploadKnowledge(actor: User): boolean {
    return actor.role === "SUPER_ADMIN";
  }
  ```
- Vérifier que `apps/api/src/app.ts` (`POST /admin/kb/upload`, `/reindex`, `/publish`) utilise bien ce garde — c'est déjà le cas, le simple changement de la fonction suffit.
- Ajouter événement audit `KB_UPLOAD_DENIED` si appel par non-SUPER_ADMIN.

### 4. Vector store cible : OpenSearch Serverless (documentation backend uniquement)

Ce plan ne touche pas l'app Lovable (pas d'AWS exécutable depuis le sandbox), mais aligne `_backend-reference/` :
- `packages/rag/src/vectorProvider.ts` : compléter `OpenSearchVectorProvider` (déjà stub) pour utiliser AWS SigV4 + index `mp-document-chunks` (mapping `knn_vector`, dim 3072).
- `infra/aws/main.tf` : ajout collection OpenSearch Serverless type `VECTORSEARCH`, policy data-access, IAM pour la Lambda/ECS d'ingestion.
- `apps/worker/src/ingestionPipeline.ts` : appel embeddings (Mistral `mistral-embed` 1024 dim **ou** OpenAI `text-embedding-3-large` 3072 dim — au choix lors du build) + upsert vers OpenSearch.
- `.env.example` : `OPENSEARCH_ENDPOINT`, `OPENSEARCH_INDEX`, `AWS_REGION`.

> Côté Lovable, on garde `MockVectorProvider` pour le mode démo (`VITE_USE_MOCKS=true`). Le switch se fait via env quand on bascule sur l'API Fastify réelle.

---

## Hors scope

- Provisioning AWS effectif (Terraform apply) — reste manuel côté ops.
- Pipeline d'ingestion temps réel — déjà couvert par `apps/worker`, non modifié ici.
- Changements de modèle (Mistral large vs medium, GPT-5 vs GPT-5.5) — à régler via l'écran *Prompts & Modèles*.

## Détails techniques rapides

- Sémantique couleurs : créer si absent les tokens `--confidence-high|med|low` dans `src/styles.css` (oklch) pour ne pas hardcoder de Tailwind colors dans les cartes.
- `SourceCards` reçoit déjà `score`, `excerpt`, `title`, `page`, `section` via `SourceCitation` (`src/mp/shared.ts:88`) — aucune extension de type nécessaire.
- L'endpoint `/chat/responses/:id/retry-fallback` existe déjà dans `mocks.ts` et `app.ts`, on se contente de relabelliser le bouton.
