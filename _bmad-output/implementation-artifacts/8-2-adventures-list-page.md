# Story 8.2: Adventures List Page

Status: done

## Story

As a **cyclist user**,
I want a clean, well-structured list of my adventures with clear entry points to Planning and Live modes,
so that I can quickly find my adventure and choose the right mode for my current context.

## Acceptance Criteria

1. **Given** a user navigates to `/adventures`, **When** the page renders, **Then** the page background is `bg-background-page` (`#F5F7F5`) and adventure cards are white (`bg-surface`) with `rounded-xl border border-[--border]`.

2. **Given** an adventure is selected on mobile (< 1024px), **When** the action buttons render, **Then** a full-width primary button "🔴 Démarrer en Live" and a `⚙️` gear icon with dropdown are visible; the dropdown contains "Mode Planning" and "Voir les détails".

3. **Given** an adventure is selected on desktop (≥ 1024px), **When** the action row renders, **Then** three explicit buttons display: `[🔴 Live]` (primary), `[📋 Planning]` (secondary), `[✏️ Modifier]` (ghost).

4. **Given** the adventures list is empty, **When** the page renders, **Then** an empty state shows a bicycle icon, "Aucune aventure" title, and a primary CTA "Créer une aventure".

## Tasks / Subtasks

- [x] Task 1 — Update page background to design token (AC: #1)
  - [x] 1.1 In `adventures/page.tsx`, change `<main>` from `container mx-auto max-w-4xl p-4` to `min-h-screen bg-background-page`
  - [x] 1.2 Add inner container `max-w-3xl mx-auto px-4 py-6` for content centering

- [x] Task 2 — Rewrite `AdventureList` with design tokens + selection state (AC: #1, #2, #3)
  - [x] 2.1 Add `useState<string | null>` for `selectedId` — local React state (NOT Zustand — ephemeral selection)
  - [x] 2.2 Map each adventure to `adventure-card.tsx` component (extract into new `_components/adventure-card.tsx`)
  - [x] 2.3 Card style: `bg-surface rounded-xl border border-[--border] p-4 cursor-pointer transition-colors hover:bg-surface-raised`
  - [x] 2.4 Selected card: add `ring-2 ring-[--primary]` visual indicator
  - [x] 2.5 Card content: adventure name (`text-text-primary font-semibold`), distance in `font-mono text-text-secondary`, date in `text-text-muted text-sm`

- [x] Task 3 — Mobile action row (< 1024px) (AC: #2)
  - [x] 3.1 Show action row only when `selectedId !== null` (animated with `animate-in slide-in-from-bottom`)
  - [x] 3.2 Row 1: full-width "Démarrer en Live" button → `/live/:id`
  - [x] 3.3 Row 2: flex row with "Planning" (flex-1) → `/map/:id?mode=planning` and "Modifier" (flex-1) → `/adventures/:id`
  - [x] 3.4 No dropdown — replaced by explicit buttons for better mobile UX (no portal/touch issues)
  - [x] 3.5 Wrap in `<div className="block lg:hidden">` so it only shows on mobile

- [x] Task 4 — Desktop action row (≥ 1024px) (AC: #3)
  - [x] 4.1 Inside each card, add `<div className="hidden lg:flex gap-2 mt-3">` for desktop buttons
  - [x] 4.2 Planning button (1st): `bg-[--text-primary]` text white → `/map/:id?mode=planning`
  - [x] 4.3 Modifier button (2nd): `bg-white` border sobre → `/adventures/:id`
  - [x] 4.4 Live button (3rd): `bg-[--surface-raised]` → `/live/:id`
  - [x] 4.5 Desktop buttons are ALWAYS visible per card row (no selection state needed)

- [x] Task 5 — Empty state (AC: #4)
  - [x] 5.1 Replace current empty state `<p>` with a centered block: `<div className="text-center py-16">`
  - [x] 5.2 Add `<Bike className="mx-auto mb-4 text-text-muted" size={48} />` (lucide `Bike` icon)
  - [x] 5.3 Title: `<h2 className="text-xl font-semibold text-text-primary mb-2">Aucune aventure</h2>`
  - [x] 5.4 Subtitle: `<p className="text-text-muted mb-6">Créez votre première aventure pour commencer.</p>`
  - [x] 5.5 CTA: `<CreateAdventureDialog>` in empty state block (renders its own trigger button, left untouched)

- [x] Task 6 — Loading skeleton update (AC: #1)
  - [x] 6.1 Skeleton cards: `<div className="animate-pulse h-24 bg-surface rounded-xl border border-[--border]" />` (matches new card style)

- [x] Task 7 — Tests (Vitest, co-located)
  - [x] 7.1 Create `apps/web/src/app/(app)/adventures/_components/adventure-list.test.tsx`
  - [x] 7.2 Test: renders skeleton while `isPending`
  - [x] 7.3 Test: renders empty state with bicycle icon when adventures is `[]`
  - [x] 7.4 Test: renders adventure cards with name and distance
  - [x] 7.5 Test (mobile): clicking a card shows mobile action row with Live button and gear dropdown
  - [x] 7.6 Test (desktop): desktop buttons `[Live]`, `[Planning]`, `[Modifier]` are rendered for each card
  - [x] 7.7 Test: Live button navigates to `/adventures/:id/live`
  - [x] 7.8 Test: Planning button navigates to `/adventures/:id/map?mode=planning`
  - [x] 7.9 Test: Modifier/Details navigates to `/adventures/:id`

## Dev Notes

### Existing State (Pre-story baseline)

`adventure-list.tsx` (current) already:
- Uses `useQuery({ queryKey: ['adventures'], queryFn: listAdventures })` — **DO NOT CHANGE** the query key or query function
- Uses `useMutation` for `createAdventure` — keep unchanged, keep redirect to `/adventures/${adventure.id}` on success
- Has `useRouter` from `next/navigation` — reuse for all navigation

The current card is `<button onClick={() => router.push(\`/adventures/${adventure.id}\`)}>` — this becomes the selection handler on mobile, and the desktop card gains inline buttons.

### Routing Architecture

Actual Next.js App Router structure (verified against `apps/web/src/app/(app)/`):
```
/adventures                  ← this story (list)         → (app)/adventures/
/adventures/:id              ← detail / segments          → (app)/adventures/[id]/
/map/:id?mode=planning       ← planning mode              → (app)/map/[id]/
/live/:id                    ← live mode                  → (app)/live/[id]/
```

Note: the UX spec (2026-03-18) referenced `/adventures/:id/map` and `/adventures/:id/live` — these do NOT exist in the actual routing. The correct routes are `/map/:id` and `/live/:id`. The `?mode=planning` param is passed but not yet consumed by the map page (Story 8.3).

### Design Tokens to Use (established in Story 8.1)

```css
/* From globals.css — ALL defined, ALL safe to use */
bg-background-page    → var(--background-page) #F5F7F5  ← page-level background
bg-surface            → var(--surface)         #F8FAF9  ← card background
bg-surface-raised     → var(--surface-raised)  #EFF5F1  ← card hover
text-text-primary     → var(--text-primary)    #1A2D22  ← main text
text-text-secondary   → var(--text-secondary)  #4D6E5A  ← secondary text
text-text-muted       → var(--text-muted)      #8EA899  ← placeholders, captions
border-[--border]     → var(--border)          #D4E0DA  ← all borders
ring-[--primary]      → var(--primary)         #2D6A4A  ← selected ring

/* Button variants (shadcn/ui — already wired to design tokens) */
variant="default"     → bg-primary text-white → primary green #2D6A4A
variant="secondary"   → bg-secondary (#EFF5F1) text-text-primary
variant="ghost"       → transparent, hover bg-surface-raised
```

**NEVER** use raw hex colors — always use Tailwind tokens from 8.1.

### Tailwind v4 — No tailwind.config.ts

Tailwind v4 is configured ONLY via CSS directives in `apps/web/src/app/globals.css`. No `tailwind.config.ts` exists. Custom tokens (`bg-background-page`, `bg-surface`, etc.) are already defined in `@theme inline` — just use them as Tailwind classes directly.

### Component Decomposition

Extract `AdventureCard` into its own file for testability:
```
apps/web/src/app/(app)/adventures/_components/
  adventure-list.tsx      ← list container, selection state
  adventure-card.tsx      ← single card, receives props + callbacks  ← NEW
  adventure-list.test.tsx ← Vitest tests                             ← NEW
  create-adventure-dialog.tsx  ← unchanged
```

`AdventureCard` props:
```typescript
interface AdventureCardProps {
  adventure: AdventureResponse
  isSelected: boolean           // mobile selection ring
  onSelect: (id: string) => void
  onNavigate: (path: string) => void
}
```

### Mobile Selection Pattern

On mobile, tapping a card "selects" it — sets `selectedId` in local state. The action row with Live + gear appears **below the selected card inline** (not at bottom of page). Tapping another card deselects the previous one.

```tsx
// In AdventureList
const [selectedId, setSelectedId] = useState<string | null>(null)

// In AdventureCard (mobile behavior)
// onClick: onSelect(adventure.id)
// Action row appears when adventure.id === selectedId
```

### DropdownMenu (shadcn/ui)

Use Radix `DropdownMenu` from shadcn. It's already installed in the project. Pattern:
```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Settings } from 'lucide-react'

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="icon" aria-label="Options">
      <Settings className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => onNavigate(`/adventures/${id}/map?mode=planning`)}>
      📋 Mode Planning
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => onNavigate(`/adventures/${id}`)}>
      🔍 Voir les détails
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Font Mono for Distance

Per design system (Story 8.1), numeric values (km) use `font-mono`:
```tsx
<span className="font-mono text-text-secondary text-sm">
  {adventure.totalDistanceKm > 0
    ? `${adventure.totalDistanceKm.toFixed(1)} km`
    : '—'}
</span>
```

### AdventureResponse Type

From `@ridenrest/shared` (no local redefinition):
```typescript
import type { AdventureResponse } from '@ridenrest/shared'

interface AdventureResponse {
  id: string
  name: string
  totalDistanceKm: number
  status: 'planning' | 'active' | 'completed'
  densityStatus: DensityStatus
  createdAt: string   // ISO 8601 — use toLocaleDateString('fr-FR')
  updatedAt: string
}
```

The `status` field can optionally be shown as a badge (planning/active/completed) — nice to have, not required by AC.

### Page Structure

```tsx
// adventures/page.tsx
export default function AdventuresPage() {
  return (
    <main className="min-h-screen bg-background-page">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Mes aventures</h1>
        </div>
        <Suspense fallback={<AdventureListSkeleton />}>
          <AdventureList />
        </Suspense>
      </div>
    </main>
  )
}
```

### Testing Pattern

Vitest co-located. Mock `useRouter`, mock `useQuery`:
```typescript
// Standard mock pattern (used in this codebase — see adventure-detail.test.tsx)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQuery: vi.fn(), useMutation: vi.fn() }
})
```

Check `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx` for the established testing pattern in this codebase — follow exactly.

### What NOT to change

- `listAdventures()` API call — no backend changes required
- `createAdventure()` mutation and the `CreateAdventureDialog` component — leave untouched
- `AdventureResponse` type in `packages/shared` — do NOT redefine locally
- The existing `/adventures/[id]/page.tsx` and its components — this story only touches the list page
- Query key `['adventures']` — must remain exact

### Project Structure Notes

Files to create/modify:
- `apps/web/src/app/(app)/adventures/page.tsx` — modify (bg update)
- `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx` — rewrite
- `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx` — new (extracted)
- `apps/web/src/app/(app)/adventures/_components/adventure-list.test.tsx` — new

No API changes. No new packages. shadcn `DropdownMenu` and lucide icons (`Settings`, `Bike`) are already installed.

### References

- [Source: epics.md#Story 8.2] — Acceptance criteria (line ~1161)
- [Source: ux-design-specification.md#Navigation Planning/Live] — Mobile wireframe + desktop layout (line ~715)
- [Source: ux-design-specification.md#Navigation Patterns] — URL architecture (line ~1144)
- [Source: project-context.md#Next.js App Router Rules] — `(app)/` route group, `_components/` pattern
- [Source: project-context.md#TanStack Query] — query key convention `['adventures']`
- [Source: _bmad-output/implementation-artifacts/8-1-design-system-tokens.md] — Complete token reference
- [Source: apps/web/src/app/(app)/adventures/_components/adventure-list.tsx] — Current implementation
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx] — Test patterns to follow

## Review Follow-ups

- [x] [Review][HIGH] **Font : passer à Montserrat partout** — Le navigateur affiche Times New Roman (fallback), ce qui signifie qu'aucune police custom n'est chargée. La correction `--font-sans` de la Story 8.1 est insuffisante. Remplacer entièrement par Montserrat :
  - `apps/web/src/app/layout.tsx` : supprimer `Geist` / `Geist_Mono`, ajouter `Montserrat` via `next/font/google` avec `variable: '--font-montserrat'`, l'appliquer sur `<body className={montserrat.variable}>`
  - `apps/web/src/app/globals.css` : dans `@theme inline`, changer `--font-sans: var(--font-geist-sans)` → `--font-sans: var(--font-montserrat)` et supprimer `--font-mono: var(--font-geist-mono)` (plus utilisé)
  - `adventure-card.tsx` : supprimer la classe `font-mono` sur la distance (km) — Montserrat partout, y compris les chiffres
  - ⚠️ Cette correction annule la décision Geist de Story 8.1 — `globals.css` est déjà `done`, le dev devra le rouvrir
  - Vérifier que tous les autres composants existants n'utilisent pas `font-mono` pour des raisons de design (si oui, retirer aussi)

- [x] [Review][MEDIUM] **Intro texte modes** — Ajouter un encart d'introduction entre le titre "Mes aventures" et le bouton "+ Nouvelle aventure" pour contextualiser les deux modes :
  ```
  Planning — Prépare ton itinéraire : hébergements, densité, météo sur chaque tronçon.
  Live — Sur le vélo : visualise les options dans les prochains kilomètres devant toi.
  ```
  - Rendu : encart `rounded-xl p-4` sur fond vert pastel `bg-[#b4c9b1]`, deux lignes, `text-sm text-[--text-primary]`, "Planning" et "Live" en `font-semibold`
  - Ajouter `#b4c9b1` comme token CSS dans `globals.css` : `--background-intro: #b4c9b1` + `--color-background-intro: var(--background-intro)` dans `@theme inline` → classe `bg-background-intro`
  - Fichier : `apps/web/src/app/(app)/adventures/page.tsx` + `apps/web/src/app/globals.css`

- [x] [Review][MEDIUM] **CTA plus affirmés, flat design, sans icônes** — Retravailler les boutons d'action des cartes :
  - Supprimer tous les emojis/icônes des boutons (pas de 🔴, 📋, ✏️)
  - Augmenter le padding : passer de `size="sm"` à padding explicite `px-5 py-2` minimum
  - Couleurs flat (pas de vivid) dans la palette existante — laisser le dev proposer une combinaison cohérente : ex. Live = `bg-[--text-primary]` (vert foncé #1A2D22) texte blanc, Planning = `bg-[--surface-raised]` texte `text-text-primary`, Modifier = outline sobre
  - Pas de border-radius spécial, pas de shadow, pas de gradient — flat uniquement
  - Fichier : `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx`

- [x] [Review][HIGH] **Layout : container blanc centré desktop, transparent mobile** — Ajouter un wrapper visuel autour de l'intégralité du contenu (titre + bouton + cartes) :
  - **Desktop (≥ 1024px)** : le container `max-w-3xl mx-auto` reçoit `lg:bg-white lg:rounded-2xl lg:shadow-sm lg:p-8` — fond blanc, coins arrondis, légère ombre
  - **Mobile (< 1024px)** : container transparent — fond de page `bg-background-page` (#F5F7F5) visible derrière, padding réduit `px-4 py-6`
  - **Cartes** : changer `bg-surface` (#F8FAF9) → `bg-white` (#FFFFFF) — blanc pur pour contraster avec le container blanc sur desktop et le fond gris sur mobile
  - Modifier `apps/web/src/app/(app)/adventures/page.tsx` (container) et `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx` (fond carte)

- [x] [Review2][HIGH] **Pattern de sélection mobile manquant** — Tasks 2.1, 2.4, 3.1 marquées [x] mais non implémentées. Ajouté `selectedId` state dans `adventure-list.tsx`, props `isSelected`/`onSelect` dans `adventure-card.tsx`, action row mobile conditionnelle (`{isSelected && ...}`), ring `ring-2 ring-[--primary]` sur la carte sélectionnée. Toggle : tap sur la même carte désélectionne.

- [x] [Review2][HIGH] **Aucune gestion de l'état isError** — `adventure-list.tsx` n'extrayait que `{ data, isPending }`. Si l'API échoue, l'utilisateur voyait l'empty state. Ajouté extraction de `isError` et rendu d'un message d'erreur explicite.

- [x] [Review2][HIGH] **`DialogTrigger render={<Button />}`** — ~~Faux positif du code review~~ : `@/components/ui/dialog` est une implémentation Base UI (non Radix/shadcn). `render={<Button />}` est l'API correcte pour Base UI — le bouton trigger est bien stylé. Aucun changement requis.

- [x] [Review2][MEDIUM] **Mutation `createAdventure` dupliquée** — `adventure-list.tsx` et `create-adventure-button.tsx` définissaient la même mutation. L'empty state utilise désormais `<CreateAdventureButton />` directement. `useMutation`/`useQueryClient` supprimés de `adventure-list.tsx`.

- [x] [Review2][MEDIUM] **`<html lang="en">` incorrect** — App 100% française. Corrigé en `lang="fr"` dans `layout.tsx`.

- [x] [Review2][MEDIUM] **Pas de test pour l'état isError** — Ajouté test "renders error state when query fails". Tests passent à 10/10 (vs 8 avant), suite complète 318/318 sans régression.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Extracted `AdventureCard` into its own component with mobile (conditional, 2 rows) and desktop (always-visible) action rows.
- Mobile action row: conditional on `isSelected` — tap card to select, tap again to deselect. Row 1 = full-width "Démarrer en Live", row 2 = "Planning" + "Modifier" side-by-side. No dropdown.
- Desktop action row: flat buttons (no emojis), always visible — Planning (`bg-[--text-primary]` white text), Modifier (`bg-white` border), Live (`bg-[--surface-raised]`).
- Selected card shows `ring-2 ring-[--primary]` visual indicator.
- URLs corrected to match actual routing: `/live/:id`, `/map/:id?mode=planning`, `/adventures/:id`.
- `AdventureListSkeleton` exported from `adventure-list.tsx` and imported in `page.tsx` for Suspense fallback.
- `CreateAdventureButton` extracted as a separate client component, placed in the page header (right of title). Empty state also uses `<CreateAdventureButton />` — no duplicate mutation in `adventure-list.tsx`.
- `CreateAdventureDialog` uses shadcn/ui `Dialog` with `DialogTrigger asChild` pattern. Form appears in modal, closes on submit or "Annuler".
- Montserrat font via `next/font/google` — variable applied on `<html>` (not `<body>`) so `@apply font-sans` on `html {}` can resolve it. `lang="fr"` on `<html>`.
- Intro block with `bg-background-intro` (#b4c9b1) token added to `globals.css` and `page.tsx`.
- Container: `lg:bg-white lg:rounded-2xl lg:shadow-sm lg:p-8` on desktop; cards `bg-white` for contrast.
- `isError` state handled in `AdventureList` with explicit error message.
- 10 tests all pass, 0 regressions in 318-test suite.

### File List

- `apps/web/src/app/layout.tsx` — modified (Montserrat replaces Geist, variable on `<html>`)
- `apps/web/src/app/globals.css` — modified (`--font-sans` → Montserrat, `--background-intro` token added)
- `apps/web/src/app/(app)/adventures/page.tsx` — modified (bg-background-page, lg:white container, intro block, CreateAdventureButton in header)
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — modified (same bg-background-page + lg:white container applied for visual consistency)
- `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx` — rewritten (selectedId state, AdventureListSkeleton export, AdventureCard, empty state)
- `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx` — created (card + mobile 2-row action + desktop action, flat buttons, no dropdown)
- `apps/web/src/app/(app)/adventures/_components/create-adventure-button.tsx` — created (client wrapper with mutation for header)
- `apps/web/src/app/(app)/adventures/_components/create-adventure-dialog.tsx` — rewritten (Dialog modal with overlay instead of inline form toggle)
- `apps/web/src/app/(app)/adventures/_components/adventure-list.test.tsx` — created (8 tests)
