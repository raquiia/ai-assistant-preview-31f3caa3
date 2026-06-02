# Refonte UX de l'onglet Historique

## Constat

L'onglet Historique souffre des mêmes maux que la KB avant refonte :

- **Scroll horizontal** sur la `DataTable` 6 colonnes (Date, Consultant, Question, Modèle, Confiance, Escalade) combinée à un panneau latéral de 440 px → la question (colonne clé) est tronquée et illisible sur viewport standard.
- **Filtres pauvres** : un seul filtre "Avec fallback", aucun filtre par tonalité de feedback (positif/négatif/neutre), par escalade, ni par période.
- **Pas d'aperçu** : impossible de voir l'extrait de réponse, le sentiment du feedback consultant, ni le nombre de retours sans cliquer ligne par ligne.
- **Panneau latéral fixe** : occupe 440 px même quand rien n'est sélectionné, ce qui réduit encore la zone utile.

## Ce que je propose

### 1. Liste en cartes denses (remplace la `DataTable`)

Chaque échange devient une **HistoryCard** verticale empilée, sans scroll latéral :

- **En-tête** : avatar + nom consultant, date relative, badges statut (Escalade / Fallback / OK).
- **Question** en titre lisible (line-clamp 2).
- **Extrait de réponse** sur 2 lignes en `text-muted-foreground`.
- **Pied** : modèle, latence, confiance (mini barre), et **pastille feedback** (👍 vert / 👎 rouge / ★ N/5 / "—" si aucun retour) + indicateur "commentaire admin" si présent.
- Carte entière cliquable → ouvre le détail.
- Carte sélectionnée mise en évidence (ring primary).

### 2. Toolbar enrichie

Au-dessus de la liste, une barre cohérente avec la KB :

- Recherche plein texte (déjà présente, conservée).
- `Select` **Tonalité du feedback** : Tous / Positifs / Négatifs / Neutres / Sans feedback.
- `Select` **Statut technique** : Tous / Escalade / Fallback / Normal.
- `Select` **Période** : 24 h / 7 j / 30 j / Tout.
- Compteur `{visible} / {total}` à droite.

Filtrage multi-critères via `useMemo`, comme dans `KnowledgeBaseAdmin`.

### 3. Pagination progressive

`PAGE_SIZE = 12`, bouton "Afficher plus" identique à la KB, reset à chaque changement de filtre.

### 4. Layout responsive du panneau de détail

- **Aucune sélection** → la liste prend toute la largeur (pas de colonne vide de 440 px).
- **Sélection active** → grille `xl:grid-cols-[minmax(0,1fr)_460px]`.
- Sur < `xl` (tablette / portrait), le détail passe sous la liste plutôt qu'à côté.
- Bouton "Fermer" dans l'en-tête du panneau pour revenir à la pleine largeur.

### 5. Petites améliorations du panneau de détail

- Date relative ("il y a 2 h") en plus de la date absolue.
- Bloc Q/R avec libellés visuels "Question" / "Réponse IA" pour la hiérarchie.
- Les sections existantes (Feedback consultant, Optimisation IA, Sources) restent telles quelles, juste re-titrées avec des icônes cohérentes.

## Fichiers modifiés

- `src/mp/components/ManagerAdminHistory.tsx` — seul fichier touché. Pas de changement du contrat API ni des mocks.

UX uniquement : aucune modification de logique métier, d'auth ou de schéma.
