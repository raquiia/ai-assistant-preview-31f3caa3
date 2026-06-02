# Refonte UX de la Knowledge Base — fin du scroll latéral

## Problème
La table actuelle a 7 colonnes (Document, Type, Tags, Statut, Version, Langue, Date) + un panneau latéral de 440px. À 1299px de viewport, ça force un scroll horizontal et tronque l'info utile (Tags, Statut).

## Solution proposée — Vue "cartes" denses + panneau latéral

Remplacer la `DataTable` par une **liste de cartes verticales** (une carte = un document), qui s'adapte naturellement à la largeur disponible. Pas de scroll horizontal, info hiérarchisée.

### Structure d'une carte (responsive)
```text
┌──────────────────────────────────────────────────────────┐
│ 📄 Titre du document.pdf                    [PUBLISHED]  │
│    pdf · v2 · FR · 12 nov. 2026                          │
│                                                          │
│    [Industrie X] [Industrie Y] [Domaine A]    [✏️ Tags]  │
└──────────────────────────────────────────────────────────┘
```
- **Ligne 1** : icône + titre (tronqué si besoin) + badge statut à droite
- **Ligne 2** : métadonnées secondaires fusionnées (`type · version · langue · date`) en petit muted
- **Ligne 3** : tags (avec « Générique » si vide) + bouton crayon (SUPER_ADMIN uniquement) à droite
- Carte cliquable → ouvre le détail dans le panneau de droite (comportement actuel)
- État sélectionné mis en évidence (ring primary)

### Barre d'outils au-dessus de la liste
- **Recherche** (input) : filtre par titre
- **Filtre tags** : popover réutilisant `TagEditor` pour ne montrer que les docs taggés X/Y
- **Filtre statut** : Select (Tous / NEEDS_REVIEW / PUBLISHED)
- Compteur « N documents » à droite

### Layout général
- Garder la grille `1fr / 440px` sur `xl+`
- Sous `xl` (< 1280px) : empiler verticalement (liste pleine largeur, puis détail en-dessous, ou via Sheet)
- À 1299px on est juste au-dessus du seuil xl — on conservera la grille mais sans table donc plus de scroll horizontal

## Fichiers touchés
- `src/mp/components/KnowledgeBaseAdmin.tsx` : remplacer le bloc `<DataTable …>` par une liste de cartes + barre d'outils ; extraire un petit composant `DocumentCard` local. Le panneau de droite, `TagEditor` et `TagList` restent inchangés.

## Hors scope
- Pas de changement backend, pas de nouveau champ
- Pas de modification de l'upload, du chat, ni des permissions
- Pas de pagination (volume actuel faible) — facile à ajouter ensuite si besoin
