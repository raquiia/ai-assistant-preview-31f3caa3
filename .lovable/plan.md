## Objectif

Permettre au consultant d'orienter les réponses du chat selon :
- un **secteur d'activité** (Aéronautique, Défense, Pharma, Énergie, Nucléaire, Automobile, Transport/Rail, Manufacturing, IT/Digital, Finance, Secteur public, Infrastructure, Autres)
- un **domaine de management de projet** (Planning/Scheduling, Cost Control, Risk Management, Scope/Requirements, Change Control, PMO Governance, Resource Management, Quality, Reporting/KPI, Earned Value, Procurement, Stakeholder Mgmt, Agile/Delivery, Outils P6/MS Project/Jira/Smartsheet)

Les deux filtres sont **optionnels et combinables** (ET logique). Sans filtre = recherche générique sur toute la base.

## Approche recommandée

**Tags multi-valeurs sur chaque document/chunk** (déjà présent dans `_backend-reference/packages/rag/src/taxonomy.ts` via `industryTags` + `pmDomainTags`). Un document peut être :
- générique (aucun tag → toujours retourné)
- mono-tag (`industryTags=["aeronautique"]`)
- multi-tag (`industryTags=["aeronautique","defense"]`, `pmDomainTags=["risk management","planning/scheduling"]`)

Au moment de la requête RAG : filtre `industry IN (selected) OR industry IS EMPTY` et idem pour domaine. Les sources génériques restent toujours candidates, ce qui évite les "aucune source" frustrants.

## Changements UI (frontend uniquement)

### 1. `src/mp/components/ChatShell.tsx` — barre de filtres au-dessus du composer

Deux `Popover` compacts juste au-dessus du textarea :
- **Secteur** : multi-select avec checkboxes (13 options + "Tous")
- **Domaine PM** : multi-select avec checkboxes (14 options + "Tous")

Affichage compact :
```
[🏭 Secteur: Aéro, Pharma ▾]  [📊 Domaine: Risk, Planning ▾]  [Réinitialiser]
```

Si aucun filtre → libellé "Tous secteurs" / "Tous domaines" en muted.
Les filtres sélectionnés sont envoyés avec chaque message dans le payload `{ content, industryTags, pmDomainTags }` et persistés en mémoire de la conversation (state local, pas en DB pour l'instant).

### 2. Affichage dans la réponse

- Bandeau de réponse enrichi : ajouter chips "Secteur: X • Domaine: Y" si filtres actifs lors de la requête
- `SourceCards` : afficher un petit badge sur chaque source indiquant son ou ses tags (`Aéronautique`, `Risk Mgmt`…) pour transparence

### 3. `src/mp/shared.ts` — nouveaux types

```ts
export const INDUSTRIES = [...] as const;
export const PM_DOMAINS = [...] as const;
export type Industry = typeof INDUSTRIES[number];
export type PmDomain = typeof PM_DOMAINS[number];

export interface ChatFilters {
  industryTags: Industry[];
  pmDomainTags: PmDomain[];
}

// Étendre SourceCitation
export interface SourceCitation {
  // ... existant
  industryTags?: string[];
  pmDomainTags?: string[];
}
```

### 4. `src/mp/mocks.ts` — simuler le filtrage

- Étendre les chunks mock avec `industryTags`/`pmDomainTags`
- Sur `POST /chat/conversations/:id/messages` : lire `industryTags`/`pmDomainTags` du body, filtrer les sources mock en conséquence
- Retourner les filtres appliqués dans `lastAnswer.appliedFilters` pour affichage

### 5. `src/mp/components/KnowledgeBaseAdmin.tsx` + `UploadPanel.tsx` (SUPER_ADMIN)

À l'upload d'un document : deux multi-select (Secteurs, Domaines) + checkbox "Document générique (pas de tag)". Les tags sont envoyés avec le POST `/kb/upload`. Affichage dans la liste des documents : chips de tags, filtrable.

## Backend de référence (`_backend-reference/`)

Documentation et stubs uniquement (pas d'AWS dans la sandbox) :
- `packages/shared/src/types.ts` : ajouter `industryTags`/`pmDomainTags` sur `DocumentRecord`, `SourceCitation`, et payload chat
- `packages/rag/src/retriever.ts` : étendre `HybridRetriever.search()` avec `filters: { industryTags?, pmDomainTags? }` → filtre post-kNN (`tag IN filter OR tags empty`)
- `packages/rag/src/vectorProvider.ts` : pour OpenSearch Serverless, ajouter clause `bool.filter.terms` sur les champs `industry_tags` et `pm_domain_tags` du mapping k-NN
- `apps/api/src/services/chatService.ts` : transmettre les filtres du body de message vers le retriever
- Schéma Prisma : `Document.industryTags String[]`, `Document.pmDomainTags String[]` (déjà partiellement présent via taxonomy)

## Hors scope

- Persistance des filtres par conversation en DB (mémoire de session locale suffit pour MVP)
- Auto-classification IA des documents à l'upload (la taxonomy.ts existe déjà, peut être ajoutée après)
- Pondération par score (boost si tag match exact vs générique) — V2

## Question résiduelle

Les filtres choisis doivent-ils **persister entre conversations** (préférence utilisateur stockée en local) ou **se réinitialiser à chaque nouvelle conversation** ? Par défaut je propose : persistance via `localStorage` par utilisateur, réinitialisables d'un clic.
