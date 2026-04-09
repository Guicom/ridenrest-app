# Story 17.1: Système de versioning app & popin "Nouvelle release"

Status: done

> **Ajouté 2026-04-09** — Première story de l'Epic 17 (Quality of Life). Objectif : informer les utilisateurs des nouveautés après chaque mise à jour via une popin changelog. Système de versioning basé sur `package.json` + parsing `CHANGELOG.md` au build. Les stories suivantes (17.2→17.5) seront documentées dans le changelog dès cette story en place.

## Story

As a **user returning to the app after an update**,
I want to see a changelog popup explaining what changed in the new version,
So that I'm aware of new features, improvements, and bug fixes without having to search for release notes.

## Acceptance Criteria

### A — Injection de la version au build

1. **Given** l'app est buildée (`turbo build`),
   **When** `next.config.ts` est exécuté,
   **Then** `NEXT_PUBLIC_APP_VERSION` est défini à partir du champ `version` de `apps/web/package.json` (semver, actuellement `"0.1.0"`).

2. **Given** `NEXT_PUBLIC_APP_VERSION` est injecté,
   **When** le cache Turborepo est vérifié,
   **Then** la variable est déclarée dans `turbo.json` → `tasks.build.env[]` pour invalider le cache si la version change.

### B — Fichier CHANGELOG.md

3. **Given** un fichier `apps/web/CHANGELOG.md` existe,
   **When** un développeur prépare une release,
   **Then** le fichier suit ce format :

   ```markdown
   ## 1.0.0 — 2026-04-09

   ### Nouveautés
   - Système de notes de version avec popin au lancement

   ### Améliorations
   - 

   ### Corrections
   - 
   ```

4. **Given** le `CHANGELOG.md` est maintenu,
   **When** le build Next.js s'exécute,
   **Then** un module `lib/changelog.ts` exporte un objet typé `ReleaseEntry` contenant **uniquement** l'entrée correspondant à la version courante (`NEXT_PUBLIC_APP_VERSION`) — pas l'historique complet.

### C — Popin release notes

5. **Given** un utilisateur ouvre l'app (routes `(app)/`),
   **When** `NEXT_PUBLIC_APP_VERSION` diffère de `localStorage.getItem('ridenrest:last-seen-version')`,
   **Then** une Dialog modale `<ReleaseNotesDialog />` s'affiche avec :
   - Titre : "Nouveautés — v{version}"
   - Contenu : les sections parsées (Nouveautés, Améliorations, Corrections) — sections vides masquées
   - Un bouton "Compris" (`size="lg"`) dans le `DialogFooter`

6. **Given** l'utilisateur ferme la popin (clic "Compris", Escape, ou clic overlay),
   **When** la Dialog se ferme,
   **Then** `localStorage.setItem('ridenrest:last-seen-version', currentVersion)` est appelé — la popin ne se rouvre plus jusqu'à la prochaine version.

7. **Given** c'est la première visite de l'utilisateur (pas de clé `ridenrest:last-seen-version` dans localStorage),
   **When** l'app charge,
   **Then** la popin ne s'affiche PAS — `lastSeenVersion` est initialisé silencieusement à la version courante. Les release notes ne s'affichent que pour les utilisateurs revenant après une mise à jour.

### D — Version dans les Settings

8. **Given** l'utilisateur navigue vers la page Settings,
   **When** la page s'affiche,
   **Then** une section "À propos" est visible (en bas, avant "Zone dangereuse") affichant :
   - Le numéro de version (ex : "Version 1.0.0")
   - Un lien/bouton "Voir les notes de version" qui rouvre `<ReleaseNotesDialog />`

## Tasks / Subtasks

### Volet A — Version injection

- [x] Task 1 — Injecter `NEXT_PUBLIC_APP_VERSION` dans `next.config.ts` (AC: #1)
  - [x] 1.1 — Dans `apps/web/next.config.ts`, lire `version` depuis `./package.json` et l'exposer via `env: { NEXT_PUBLIC_APP_VERSION: version }`
  - [x] 1.2 — Ajouter `NEXT_PUBLIC_APP_VERSION` dans `turbo.json` → `tasks.build.env[]` (AC: #2)

### Volet B — CHANGELOG.md & parsing

- [x] Task 2 — Créer `apps/web/CHANGELOG.md` avec template initial (AC: #3)
  - [x] 2.1 — Fichier avec l'entrée v1.0.0 (première release avec ce système)

- [x] Task 3 — Créer le parser `apps/web/src/lib/changelog.ts` (AC: #4)
  - [x] 3.1 — Définir le type `ReleaseEntry` : `{ version: string, date: string, sections: { title: string, items: string[] }[] }`
  - [x] 3.2 — Importer et parser `CHANGELOG.md` (import raw string ou fs.readFileSync au build)
  - [x] 3.3 — Extraire uniquement l'entrée matching `NEXT_PUBLIC_APP_VERSION`
  - [x] 3.4 — Exporter `currentRelease: ReleaseEntry | null`

### Volet C — Composant ReleaseNotesDialog

- [x] Task 4 — Créer `apps/web/src/components/shared/release-notes-dialog.tsx` (AC: #5, #6)
  - [x] 4.1 — Dialog contrôlée avec `open` + `onOpenChange` props
  - [x] 4.2 — Afficher titre "Nouveautés — v{version}" dans `DialogHeader`
  - [x] 4.3 — Itérer sur `sections` : pour chaque section non vide, afficher le titre (h3) + liste (ul/li)
  - [x] 4.4 — Bouton "Compris" `size="lg"` dans `DialogFooter`
  - [x] 4.5 — `onOpenChange(false)` → écriture localStorage

- [x] Task 5 — Créer le hook `apps/web/src/hooks/use-release-notes.ts` (AC: #5, #6, #7)
  - [x] 5.1 — Lire `localStorage.getItem('ridenrest:last-seen-version')` avec guard SSR
  - [x] 5.2 — Comparer avec `process.env.NEXT_PUBLIC_APP_VERSION`
  - [x] 5.3 — Si pas de clé localStorage → initialiser à la version courante (première visite, AC: #7)
  - [x] 5.4 — Exposer `{ showReleaseNotes: boolean, dismissReleaseNotes: () => void }`

- [x] Task 6 — Intégrer dans `apps/web/src/app/(app)/layout.tsx` (AC: #5)
  - [x] 6.1 — Ajouter `<ReleaseNotesDialog />` après `<ReconnectionHandler />`
  - [x] 6.2 — Piloter via `useReleaseNotes()` hook

### Volet D — Section Settings

- [x] Task 7 — Ajouter section "À propos" dans `apps/web/src/app/(app)/settings/page.tsx` (AC: #8)
  - [x] 7.1 — Nouvelle section avec `Card` wrapping : version + bouton "Voir les notes de version"
  - [x] 7.2 — Le bouton ouvre la même `<ReleaseNotesDialog />` (state local `useState`)

### Tests

- [x] Task 8 — Tests `use-release-notes.ts`
  - [x] 8.1 — Test : première visite → pas de popin, localStorage initialisé
  - [x] 8.2 — Test : version différente → `showReleaseNotes = true`
  - [x] 8.3 — Test : même version → `showReleaseNotes = false`
  - [x] 8.4 — Test : `dismissReleaseNotes()` met à jour localStorage

- [x] Task 9 — Tests `release-notes-dialog.tsx`
  - [x] 9.1 — Test : affiche le titre avec la version
  - [x] 9.2 — Test : affiche les sections non vides, masque les vides
  - [x] 9.3 — Test : clic "Compris" appelle `onOpenChange(false)`

- [x] Task 10 — Test `changelog.ts` parser
  - [x] 10.1 — Test : parse correctement une entrée CHANGELOG valide
  - [x] 10.2 — Test : retourne `null` si la version n'existe pas dans le changelog

## Dev Notes

### Architecture de la solution

```
apps/web/
├── CHANGELOG.md                          ← NOUVEAU — source de vérité des release notes
├── next.config.ts                        ← MODIFIER — injecter NEXT_PUBLIC_APP_VERSION
├── src/
│   ├── lib/
│   │   └── changelog.ts                  ← NOUVEAU — parser CHANGELOG.md + type ReleaseEntry
│   ├── hooks/
│   │   └── use-release-notes.ts          ← NOUVEAU — logique localStorage + comparaison version
│   ├── components/shared/
│   │   └── release-notes-dialog.tsx       ← NOUVEAU — Dialog modale
│   └── app/(app)/
│       ├── layout.tsx                    ← MODIFIER — ajouter <ReleaseNotesDialog />
│       └── settings/page.tsx             ← MODIFIER — section "À propos"
turbo.json                                ← MODIFIER — ajouter env var
```

### Injection version dans next.config.ts

Le fichier actuel utilise `@ducanh2912/next-pwa` comme wrapper. Pattern d'injection :

```ts
// apps/web/next.config.ts
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  // ... reste de la config
}
```

**Ne PAS utiliser** `import pkg from './package.json'` — les imports JSON dans `next.config.ts` peuvent causer des problèmes de résolution de chemin en mode standalone.

### turbo.json — Variable d'environnement

Ajouter `NEXT_PUBLIC_APP_VERSION` dans l'array `env` existant du task `build` :

```json
"env": [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_PLAUSIBLE_DOMAIN",
  "NEXT_PUBLIC_APP_VERSION"
]
```

### Parser CHANGELOG.md

Le parser doit être **simple et fiable** — regex-based, pas besoin de remark/unified :

```ts
// apps/web/src/lib/changelog.ts
import changelogRaw from '../../CHANGELOG.md'

export interface ReleaseEntry {
  version: string
  date: string
  sections: { title: string; items: string[] }[]
}

export function parseChangelog(raw: string, targetVersion: string): ReleaseEntry | null {
  // Split par "## " pour isoler chaque version
  // Matcher la version cible
  // Extraire les "### Section" avec leurs bullet points
  // Filtrer les sections vides (items.length === 0)
}

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'
export const currentRelease = parseChangelog(changelogRaw, appVersion)
```

**Import du .md** : Next.js supporte l'import de fichiers `.md` comme raw string avec un webpack loader. Ajouter dans `next.config.ts` :

```ts
webpack: (config) => {
  config.module.rules.push({
    test: /CHANGELOG\.md$/,
    type: 'asset/source',
  })
  return config
}
```

Ou alternativement, lire le fichier avec `fs.readFileSync` au build time dans un fichier qui exporte la constante (puisque `lib/changelog.ts` est importé côté client, il faut que le contenu soit inliné au build).

**Approche recommandée** : `fs.readFileSync` dans une fonction appelée à la compilation via une constante exportée. Next.js tree-shake le `fs` pour le client bundle si le readFileSync est dans un scope qui résout à une constante au build.

**Alternative la plus simple** : écrire un script `scripts/generate-release-notes.ts` qui lit `CHANGELOG.md` et génère `src/lib/generated/release-notes.json` au moment du build (avant `next build`). Le JSON est importé statiquement. C'est le pattern le plus fiable et sans config webpack custom.

### localStorage — Pattern existant dans le projet

Namespace : `'ridenrest:last-seen-version'`

```ts
// apps/web/src/hooks/use-release-notes.ts
const STORAGE_KEY = 'ridenrest:last-seen-version'

export function useReleaseNotes() {
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'
  
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) {
      // Première visite → on initialise, pas de popin
      localStorage.setItem(STORAGE_KEY, appVersion)
    } else if (stored !== appVersion) {
      setShowReleaseNotes(true)
    }
  }, [appVersion])

  const dismissReleaseNotes = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, appVersion)
    setShowReleaseNotes(false)
  }, [appVersion])

  return { showReleaseNotes, dismissReleaseNotes }
}
```

**SSR safety** : le `useEffect` ne s'exécute que côté client → pas de `typeof window` nécessaire ici car `localStorage` est dans le `useEffect`. L'état initial `false` est SSR-safe (pas de hydration mismatch).

### Dialog — Pattern à suivre

Suivre le pattern de `feedback-modal.tsx` (Dialog contrôlée) :

```tsx
// apps/web/src/components/shared/release-notes-dialog.tsx
import { currentRelease } from '@/lib/changelog'

interface ReleaseNotesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

- Import Dialog/DialogContent/DialogHeader/DialogTitle/DialogFooter depuis `@/components/ui/dialog`
- Bouton "Compris" → `<Button size="lg">Compris</Button>` (WCAG touch target 44px dans DialogFooter)
- `DialogFooter` a déjà `[&_button]:min-h-[44px]` comme filet de sécurité
- `showCloseButton={true}` sur `DialogContent` (croix en haut à droite)

### Section Settings — Pattern existant

Les sections settings utilisent `Card` + `CardContent` (voir story 16.6). Ajouter **avant** la "Zone dangereuse" :

```tsx
<section>
  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
    À propos
  </h2>
  <Card>
    <CardContent className="flex items-center justify-between py-4">
      <span className="text-sm text-muted-foreground">
        Version {process.env.NEXT_PUBLIC_APP_VERSION}
      </span>
      <Button variant="ghost" size="sm" onClick={() => setShowReleaseNotes(true)}>
        Voir les notes de version
      </Button>
    </CardContent>
  </Card>
</section>
```

### Intégration dans (app)/layout.tsx

Le layout actuel (d'après l'analyse) :

```tsx
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AppHeader />
      {children}
      <Toaster />
      <PwaInstallBanner />
      <ReconnectionHandler />
      {/* AJOUTER ICI : */}
      <ReleaseNotesWrapper />
    </QueryProvider>
  )
}
```

`ReleaseNotesWrapper` est un composant client (`'use client'`) qui encapsule le hook + la dialog — nécessaire car `layout.tsx` est un Server Component.

### Versioning convention

Le `package.json` passe de `0.1.0` à `1.0.0` avec cette story (première version avec release notes = première release "officielle"). Bumps futurs :
- **Patch** (1.0.1) : bugfixes
- **Minor** (1.1.0) : nouvelles features (ex: stories 17.2→17.5)
- **Major** (2.0.0) : breaking changes UX majeurs

### Attention

- **Ne PAS utiliser `next/dynamic`** pour le dialog — il est léger et doit être disponible immédiatement au mount
- **Ne PAS stocker le changelog entier** dans le bundle — seule l'entrée de la version courante est nécessaire
- **Le hook `useReleaseNotes` doit être dans un composant `'use client'`** — `layout.tsx` est un Server Component
- **L'import du CHANGELOG.md** doit résoudre au build time, pas au runtime — vérifier que le contenu est inliné
- **Sections vides** : si une section "Corrections" n'a aucun item, elle ne doit pas être affichée dans la dialog
- **Test avec localStorage vide** (navigation privée) : vérifier que la popin ne s'affiche pas à la première visite

### References

- [Source: apps/web/next.config.ts] — config actuelle Next.js + PWA
- [Source: apps/web/package.json] — version actuelle `0.1.0`
- [Source: turbo.json] — env vars pour cache invalidation Turborepo
- [Source: apps/web/src/app/(app)/layout.tsx] — layout où intégrer la dialog
- [Source: apps/web/src/app/(app)/settings/page.tsx] — page settings (sections Card)
- [Source: apps/web/src/components/ui/dialog.tsx] — Dialog primitives (@base-ui/react)
- [Source: apps/web/src/components/shared/pwa-install-banner.tsx] — pattern localStorage + dismiss
- [Source: apps/web/src/components/shared/feedback-modal.tsx] — pattern Dialog contrôlée
- [Source: apps/web/src/hooks/use-live-mode.ts] — pattern localStorage avec SSR guard

## Review Findings

- [x] [Review][Decision] `AboutSection` ferme la dialog sans déclencher `dismissReleaseNotes` / `localStorage.setItem` — Résolu : **B** — comportement intentionnel, Settings est une consultation seule.
- [x] [Review][Patch] `ReleaseNotesDialog` render null quand `currentRelease` est null alors que `showReleaseNotes=true` — auto-dismiss via useEffect dans ReleaseNotesWrapper [release-notes-wrapper.tsx]
- [x] [Review][Patch] Pas de fallback si `NEXT_PUBLIC_APP_VERSION` vaut `""` (falsy non-null) — `?.trim() || '0.0.0'` [changelog.ts:43]
- [x] [Review][Patch] `readFileSync('./package.json')` sans try/catch — try/catch avec message d'erreur explicite [next.config.ts:3-5]
- [x] [Review][Patch] `localStorage.getItem/setItem` sans try/catch — try/catch silencieux [use-release-notes.ts:13-24]
- [x] [Review][Patch] Bouton "Voir les notes de version" dans `AboutSection` actif même si `currentRelease` null — `disabled={!currentRelease}` [about-section.tsx:21]
- [x] [Review][Patch] `Version {process.env.NEXT_PUBLIC_APP_VERSION}` sans `?? '0.0.0'` [about-section.tsx:18]
- [x] [Review][Patch] Deux sections `###` au même titre dans une version → clé React dupliquée — `key={\`\${section.title}-\${i}\`}` [release-notes-dialog.tsx:29]
- [x] [Review][Patch] Texte avant le premier `## ` inclus dans les versionBlocks — filtre `/^\d+\.\d+\.\d+/` [changelog.ts:11]
- [x] [Review][Defer] Règle webpack `CHANGELOG.md asset/source` non portée vers Turbopack — import cassé en mode dev Turbopack [next.config.ts:12-18] — deferred, pre-existing
- [x] [Review][Defer] Labels français codés en dur dans les composants — non actionnable sans i18n [release-notes-dialog.tsx, about-section.tsx] — deferred, pre-existing
- [x] [Review][Defer] Comportement multi-onglets : `localStorage` mis à jour dans un onglet, autre onglet garde `showReleaseNotes=true` — hors périmètre story [use-release-notes.ts] — deferred, pre-existing

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Vitest ne supporte pas l'import .md nativement → ajout `assetsInclude: ['**/*.md']` dans vitest.config.ts
- jsdom ne fournit pas localStorage complet → mock pattern existant (use-live-mode.test.ts)
- @base-ui/react Dialog duplique le contenu via portal dans les tests → utilisation de `getAllByText`

### Completion Notes List
- Version bumped de 0.1.0 → 1.0.0 dans package.json
- CHANGELOG.md créé avec contenu initial récapitulant les features MVP
- Parser regex-based sans dépendance externe, sections vides filtrées
- Webpack asset/source loader pour import CHANGELOG.md comme raw string
- Dialog modale avec titre versionné, sections dynamiques, bouton "Compris" WCAG 44px
- Hook useReleaseNotes : première visite silencieuse (AC#7), détection changement version, dismiss + localStorage
- ReleaseNotesWrapper client component pour intégration dans Server Component layout
- Section "À propos" dans Settings avec version + bouton "Voir les notes de version"
- 11 tests ajoutés : 4 hook, 3 dialog, 4 parser — tous passent
- 938 tests total, 0 régression, build OK, lint 0 erreur

### File List
- `apps/web/package.json` — MODIFIÉ (version 0.1.0 → 1.0.0)
- `apps/web/next.config.ts` — MODIFIÉ (env NEXT_PUBLIC_APP_VERSION + webpack CHANGELOG.md loader)
- `turbo.json` — MODIFIÉ (ajout NEXT_PUBLIC_APP_VERSION dans build.env)
- `apps/web/CHANGELOG.md` — NOUVEAU (changelog v1.0.0)
- `apps/web/src/types/changelog.d.ts` — NOUVEAU (déclaration TypeScript pour import .md)
- `apps/web/src/lib/changelog.ts` — NOUVEAU (parser + type ReleaseEntry + export currentRelease)
- `apps/web/src/hooks/use-release-notes.ts` — NOUVEAU (logique localStorage + comparaison version)
- `apps/web/src/components/shared/release-notes-dialog.tsx` — NOUVEAU (Dialog modale release notes)
- `apps/web/src/components/shared/release-notes-wrapper.tsx` — NOUVEAU (wrapper client pour layout)
- `apps/web/src/app/(app)/layout.tsx` — MODIFIÉ (ajout ReleaseNotesWrapper)
- `apps/web/src/app/(app)/settings/page.tsx` — MODIFIÉ (ajout section À propos)
- `apps/web/src/app/(app)/settings/_components/about-section.tsx` — NOUVEAU (composant client À propos)
- `apps/web/vitest.config.ts` — MODIFIÉ (ajout assetsInclude pour .md)
- `apps/web/src/lib/changelog.test.ts` — NOUVEAU (4 tests parser)
- `apps/web/src/hooks/use-release-notes.test.ts` — NOUVEAU (4 tests hook)
- `apps/web/src/components/shared/release-notes-dialog.test.tsx` — NOUVEAU (3 tests dialog)
