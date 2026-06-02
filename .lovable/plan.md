
# Refonte front MIGSO-PCUBED AI Assistant

Choix design verrouillés : **Cloud White** (accent `#3b82f6`) · **Sora + Manrope** · **Sidebar + main** · **Light par défaut + toggle dark**.

## 1. Réorganisation des dossiers

L'arbo actuelle (`src/mp/components/*` à plat, 19 fichiers mélangés) est ingérable. Nouvelle structure orientée features :

```
src/
├── routes/                    ← TanStack file-based (inchangé)
│   ├── __root.tsx             ← ThemeProvider + QueryClientProvider
│   ├── index.tsx              ← redirige selon session
│   ├── login.tsx              ← route dédiée
│   └── _authenticated/        ← layout sidebar protégé
│       ├── route.tsx          ← garde + AppShell
│       ├── chat.tsx
│       ├── history.tsx
│       ├── dashboard.tsx
│       ├── kb.tsx
│       ├── users.tsx
│       ├── prompts.tsx
│       ├── audit.tsx
│       └── embed.tsx
├── features/                  ← logique métier par domaine
│   ├── chat/                  ← ChatShell, MessageBubble, VoiceInput, Feedback, Sources
│   ├── auth/                  ← LoginPage, FirstVisitManagerSelection
│   ├── kb/                    ← KnowledgeBaseAdmin, UploadPanel
│   ├── admin/                 ← Users, Prompts, Audit, Dashboard, Embed
│   └── history/               ← ManagerAdminHistory
├── components/
│   ├── ui/                    ← shadcn (inchangé)
│   ├── layout/                ← AppShell, AppSidebar, AppHeader, ThemeToggle
│   └── shared/                ← DataTable, EmptyState, SourceViewer
├── lib/
│   ├── api/                   ← ApiClient + mocks (depuis src/mp/api.ts)
│   ├── auth/                  ← session, hooks useSession/useRole
│   └── utils.ts
├── types/                     ← shared.ts, types.ts consolidés
└── styles.css                 ← design tokens v2
```

Le dossier `src/mp/` disparaît, tout est migré. `_backend-reference/` reste intact.

## 2. Design system 2026

**Tokens** (`src/styles.css`, OKLCH) :
- Surface : blancs cassés (`#fafbfc`, `#f6f8fa`), bordures `#e8ecf1`, texte `oklch(0.15 0.02 250)`
- Accent unique : bleu `#3b82f6` + glow
- Dark mode : navy `#0a0e1a` / panels `#141a2e` / accent identique
- Rayons : `--radius: 0.75rem` (12px, plus moderne que 6px actuel)
- Ombres douces multi-niveaux (`shadow-sm` → `shadow-2xl`)
- Espacements 4/8/12/16/24/32/48 strict

**Typographie** :
- Sora (300/500/600/700) pour `h1`–`h3` + titres sidebar
- Manrope (400/500/600) pour body, UI, tableaux
- Tailwind `font-display` / `font-sans` mappés

**Motion** : Framer Motion (déjà dispo), transitions 150–250ms, easings physiques, blur-fade sur changements de route, message stream avec apparition lettre par lettre douce.

## 3. Composants layout (refonte)

- **AppShell** (`components/layout/AppShell.tsx`) : nouveau shell basé sur le **shadcn sidebar** (collapsible icon, mobile sheet auto, persistance cookie) au lieu de la sidebar maison actuelle qui casse en mobile.
- **AppSidebar** : navigation filtrée par rôle, badge utilisateur, indicateur état (online), footer avec ThemeToggle + Logout.
- **AppHeader** : breadcrumbs dynamiques, command palette (⌘K via shadcn `command`), avatar menu, toggle dark/light.
- **ThemeProvider** : `next-themes`-like maison (class strategy, persisté en localStorage, SSR-safe).
- **Responsive** : sidebar → Sheet en <768px, header sticky, contenu scrollable propre (résout les bugs actuels de scroll mobile).

## 4. Refonte écran par écran

### Chat (priorité 1, cœur de l'app)
- Centrage 720px, messages full-width avec gutters, avatars 32px
- Bulles sans bordure marquée, juste fond `bg-muted/50`, accent uniquement sur user
- Markdown rendering propre (code blocks avec syntax highlight `shiki`, tables, listes)
- Source citations en chips cliquables sous chaque réponse → ouvre `SourceViewer` en `Sheet`
- Input en bas, sticky, auto-grow, raccourcis `⌘↵`, drag-drop fichiers, bouton micro animé
- État vide soigné (suggestions de prompts par rôle)
- Stream avec curseur clignotant + bouton Stop

### Login
- Split-screen : visuel à gauche (gradient subtle + logo MP grand), formulaire à droite
- Champ email + password, comptes démo affichés en cartes cliquables (auto-fill)
- Micro-anim entrée

### Dashboard (Manager/Admin)
- KPI cards en bento-grid (4 cards + 1 grande)
- Charts via `recharts` (déjà installé) avec thème custom
- Filtres en haut (période, dépt) propres

### Knowledge Base Admin
- Toolbar : upload zone drag-drop + recherche + filtres status
- Table redesignée avec `DataTable` shadcn (tri, sélection multiple, actions bulk)
- Drawer détail document à droite

### Users / Prompts / Audit / Embed
- Pattern admin commun : header + filtres + DataTable + side panel détail
- Audit avec timeline visuelle + filtres date/action/acteur

### Historique Q/R
- Liste paginée, recherche full-text, expand inline pour voir Q+R complète

## 5. Couche fonctionnelle (corrections)

L'utilisateur dit "rien ne fonctionne". Probables causes vues dans le code actuel :
- Sidebar maison cassée en responsive → remplacée par shadcn
- Hydration issues localStorage → déjà patchées, on garde le pattern
- `ApiClient` recréé à chaque render (`useMemo` sur `session` mutable) → stabiliser via context React
- Pas de gestion d'erreur réseau visible → ajout `Sonner` toasts globaux
- Pas de loading states → skeletons partout

**Création `AuthContext` + `useAuth()` hook** pour centraliser session, éviter prop-drilling de `session`/`api` dans chaque composant.

## 6. Plan d'exécution (ordre)

1. **Fondations** : `styles.css` v2 (tokens, fonts via Google Fonts), `ThemeProvider`, install shadcn `sidebar` + `command` + `sonner` + `sheet`
2. **Layout** : `AppShell` + `AppSidebar` + `AppHeader` + `ThemeToggle` + routes `_authenticated/`
3. **Réorg dossiers** : déplacement `src/mp/components/*` → `src/features/*` + `src/components/layout/*` (en ajustant tous les imports)
4. **AuthContext** + refonte `LoginPage` (route dédiée)
5. **Chat redesign** (écran principal, le plus visible)
6. **Admin screens** (KB, Users, Dashboard, Prompts, Audit, Embed, History)
7. **Responsive QA** : mobile 375px, tablet 768px, desktop 1440px
8. **Dark mode QA** : chaque écran vérifié dans les deux modes

## Détails techniques

- `_backend-reference/` reste intact, aucun fichier back touché
- Mode mocks (`VITE_USE_MOCKS=true`) conservé, contrats API inchangés → quand vous brancherez AWS rien à refaire côté front
- Tous les imports refactorés vers `@/features/*`, `@/components/*`, `@/lib/*`
- Aucun composant shadcn existant supprimé
- Suppression de `src/mp/` après migration complète (commit séparé pour clarté)

## Ce qui n'est PAS dans ce plan (à valider plus tard)

- Animations hero/marketing (pas de landing publique ici)
- i18n complet (les libellés FR/EN restent en dur dans les composants pour l'instant)
- Tests unitaires (à ajouter ensuite)
- Storybook

Durée estimée : c'est un gros chantier qui sera fait en **plusieurs allers-retours**. Je commence par les étapes 1→4 (fondations + layout + auth + réorg), puis on valide visuellement avant d'attaquer le Chat et les écrans admin.
