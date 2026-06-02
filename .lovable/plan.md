## Audit de l'existant

**Onglet Prompt système** (`PromptEditor`) — déjà présent :
- Nom, instruction de base, ton (4 valeurs)
- Toggle Web search
- 6 politiques textuelles : sources, code de conduite, escalade, citations, langue, structure de réponse
- Versionning + rollback

**Onglet Providers & secrets** (`ApiKeyManager`) — minimal :
- provider (mistral / openai / search), model (texte libre), apiKey
- Liste des providers enregistrés

**Onglet Historique** : corrections approuvées/brouillon.

## Ce qui manque

### 1. Paramètres d'inférence (nouveau bloc dans l'onglet Prompt système OU nouvel onglet "Modèle & inférence")
- `temperature` (slider 0–2)
- `topP` (slider 0–1)
- `maxOutputTokens` (number)
- `presencePenalty`, `frequencyPenalty`
- `seed` (reproductibilité)
- `stopSequences` (tags)
- `streaming` (switch)
- `responseFormat` : text / json / structured
- `timeoutMs`
- Modèle par défaut + **modèle fallback** + condition de bascule (timeout / 429 / 402)

### 2. RAG & connaissance (nouveau bloc "Récupération & sources")
- `topK` chunks (1–20)
- `minRelevanceScore` (0–1)
- `rerankerEnabled` + modèle de reranker
- `embeddingModel` (sélection)
- `contextWindowTokens` (max tokens de contexte injecté)
- `maxHistoryTurns` (mémoire conversationnelle)
- Toggle "fallback web search si KB vide"

### 3. Garde-fous & sécurité (nouveau bloc "Garde-fous")
- `forbiddenTopics` (tags)
- `piiRedaction` (switch + niveau strict/standard)
- `safetyThreshold` (low/medium/high)
- `refusalTemplate` (textarea — message standard de refus)
- Toggle "loguer requêtes utilisateur en clair" (RGPD)

### 4. Variables & few-shot (nouveau bloc dans Prompt)
- Liste de **variables disponibles** (`{{user.name}}`, `{{user.role}}`, `{{date}}`, `{{kb_context}}`) avec aperçu
- **Few-shot examples** : tableau (question → réponse) injectés dans le prompt compilé

### 5. Gouvernance & cycle de vie
- `changelog` / notes par version
- `effectiveAt` (date de mise en production planifiée)
- **Ciblage** : prompt actif par rôle (consultant / manager) ou par département
- A/B testing : `canaryPercent` (0–100 %) entre 2 versions
- Workflow d'approbation : `status` (DRAFT / REVIEW / APPROVED / ACTIVE) + approbateur requis

### 6. Budget & quotas (nouveau bloc dans Providers)
- `dailyTokenBudget`, `monthlyCostCap` (€)
- `requestsPerMinute` par utilisateur
- Alerte par email si dépassement X %
- Modèles autorisés par rôle (matrice rôle × modèle)

### 7. Améliorations Providers
- Champ **modèle** : sélecteur avec catalogue prérempli (au lieu de texte libre) + version
- `baseUrl` custom (pour Azure/proxy on-prem)
- Toggle "actif/inactif", `priority` (ordre de fallback)
- Test de connexion (bouton "Tester la clé") avec retour latence/statut

## Plan d'implémentation

### Étape 1 — Étendre les types et le mock
- `src/mp/shared.ts` : enrichir `PromptVersion.configJson` avec les nouveaux champs (inférence, RAG, garde-fous, ciblage, variables, fewShot, changelog, effectiveAt, canaryPercent, status).
- `src/mp/shared.ts` : enrichir `AiProviderConfig` avec `baseUrl`, `priority`, `active`, `dailyTokenBudget`, `monthlyCostCap`.
- `src/mp/mocks.ts` : adapter les endpoints existants pour persister ces nouveaux champs + ajouter `POST /superadmin/providers/:id/test`.

### Étape 2 — Refonte de l'onglet "Prompt système"
Découper `PromptEditor` en sous-sections accordéon ou tabs internes :
1. **Identité & instruction** (existant)
2. **Politiques de réponse** (existant)
3. **Variables & few-shot** (nouveau)
4. **Garde-fous** (nouveau)
5. **Ciblage & déploiement** (nouveau : rôle, département, canaryPercent, effectiveAt, changelog)

Mettre à jour `buildPromptContent()` pour injecter les variables, few-shots et garde-fous dans l'aperçu compilé.

### Étape 3 — Nouvel onglet "Inférence & RAG"
Nouvelle section parallèle aux 3 onglets actuels avec :
- Bloc Inférence (temperature/topP/maxTokens/seed/stop/streaming/responseFormat/timeout/fallback)
- Bloc RAG (topK/minScore/reranker/embeddingModel/contextWindow/historyTurns)

### Étape 4 — Refonte de l'onglet "Providers & secrets"
- Catalogue de modèles prérempli par provider (sélecteur en cascade)
- Champs supplémentaires : baseUrl, priority, active, budgets
- Bouton "Tester la clé" → toast latence + statut
- Matrice rôles × modèles autorisés (sous-bloc)

### Étape 5 — Vérification
- Re-render des 3+1 onglets sans crash
- L'aperçu de prompt généré reflète les nouveaux blocs
- La sauvegarde envoie un `configJson` enrichi et l'historique l'affiche

## Points à confirmer avec toi

1. **Tu veux ajouter tous ces blocs**, ou tu préfères un sous-ensemble prioritaire (ex. seulement inférence + RAG + garde-fous, qui sont les plus critiques pour la prod) ?
2. Pour le **catalogue de modèles**, tu veux que je liste les modèles Lovable AI (`google/gemini-3-flash-preview`, `openai/gpt-5`, etc.) en plus de Mistral/OpenAI custom ?
3. Le **ciblage par rôle/département** et l'**A/B canary** sont des fonctionnalités lourdes — à inclure dès maintenant ou à reporter ?