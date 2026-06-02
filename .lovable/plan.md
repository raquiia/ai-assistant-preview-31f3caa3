# Enrichir le Dashboard Super Admin avec la satisfaction

## Constat

Le dashboard actuel (`src/mp/components/SuperAdminDashboard.tsx`) affiche 4 KPI : Questions, Utilisateurs actifs, Fallback, Coût estimé — plus latence p50/p95, fallback, escalade et un journal d'activité.

Il manque les indicateurs liés au **feedback utilisateur**, alors que le système collecte déjà :
- des votes pouce haut / pouce bas (`UP` / `DOWN`)
- des notes 1 à 5 étoiles (`ONE`…`FIVE`)
- des commentaires libres

Aucun de ces signaux n'est aujourd'hui agrégé dans le dashboard.

## Ce que je propose d'ajouter

### 1. Nouveaux KPI exposés par le payload dashboard

Étendre `DashboardPayload.kpis` (`src/mp/types.ts`) avec :
- `satisfactionRate` (% de feedbacks positifs : `UP`, `FOUR`, `FIVE`)
- `feedbackCount` (volume total de feedbacks)
- `averageStars` (moyenne des notes 1–5, ignore UP/DOWN)
- `positiveCount`, `neutralCount`, `negativeCount` (répartition)

### 2. Mock backend cohérent

Mettre à jour `src/mp/mocks.ts` (`GET /admin/dashboard`) pour calculer ces valeurs à partir de `historyFeedback` déjà présent dans les mocks (UP, DOWN, THREE…), afin que les chiffres soient cohérents avec ce que le manager voit dans l'historique.

### 3. UI dashboard

Dans `SuperAdminDashboard.tsx` :

- **Carte KPI "Satisfaction"** en première position (ton `success`), valeur `XX %`, hint = nombre de feedbacks (`N retours`).
- Réorganiser la grille de cartes en 5 KPI clés (responsive `md:grid-cols-2 xl:grid-cols-4` → on garde 4 cartes principales : Satisfaction, Questions, Fallback, Coût ; Utilisateurs actifs et latence p50 passent dans une seconde ligne secondaire).
- Nouvelle **section "Qualité perçue"** à côté de "Latence & qualité" :
  - barre empilée Positif / Neutre / Négatif
  - moyenne d'étoiles affichée en grand (`★ 4,2 / 5`)
  - compteur de feedbacks totaux
- Mettre à jour `hasOperationalData` pour qu'il prenne aussi `feedbackCount > 0` en compte.

### 4. État vide

Si `feedbackCount === 0`, afficher dans la section Qualité perçue un `EmptyState` discret ("Aucun retour utilisateur pour le moment"), sans inventer de chiffre — conforme à la règle "zéro chiffre inventé".

## Fichiers modifiés

- `src/mp/types.ts` — extension de `DashboardPayload.kpis`
- `src/mp/mocks.ts` — calcul des nouveaux KPI à partir de `historyFeedback`
- `src/mp/components/SuperAdminDashboard.tsx` — nouvelle carte Satisfaction + section Qualité perçue

Aucun changement de routing, d'auth ou de schéma backend réel — uniquement la couche présentation et le contrat de payload côté front/mock.
