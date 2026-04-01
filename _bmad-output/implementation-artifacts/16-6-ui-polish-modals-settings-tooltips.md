# Story 16.6: UI Polish — Modals, Settings & Contextual Tooltips

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user of the application**,
I want a more polished and informative UI,
So that interactions feel comfortable on mobile and the interface communicates its mode clearly.

## Acceptance Criteria

1. **Modal sizing — WCAG touch targets** — All modals/dialogs in the app have min-width 360px on mobile and 480px on desktop. All primary CTA buttons inside dialogs (submit, confirm, import) have min-height 44px (WCAG 2.5.5 touch target size).

2. **Settings page — Card design language** — The Settings page (`/settings`) is redesigned to use the same card-list visual language as the adventures list (rounded-xl, border, consistent padding, section headers with labels). A shadcn-style `Card`/`CardContent`/`CardHeader` component is created if it doesn't already exist.

3. **Planning sidebar — Contextual tooltips** — The four Planning mode sidebar section headers ("Recherche de POIs", "Étapes", "Météo", "Densité") each have a tooltip. On desktop: tooltip appears on hover. On mobile: tooltip appears on long-press (≥500ms). Each tooltip contains a 1–2 sentence explanation of the section and how to use it.

4. **Mode badge** — In Planning mode, a small "Planning" badge (blue) is displayed next to the adventure name in the app header. In Live mode (where the header is hidden), a "Live" badge (green) is displayed in the top-left overlay area of the full-screen live page, near the back-to-adventures button.

## Tasks / Subtasks

- [x] **Task 1 — Modal sizing: update `DialogContent` defaults** (AC: #1)
  - [x] 1.1 — In `apps/web/src/components/ui/dialog.tsx`, update `DialogContent` default className: change `sm:max-w-sm` → `sm:min-w-[480px] sm:max-w-lg`; keep `w-full max-w-[calc(100%-2rem)]` for mobile (full-width on small screens)
  - [x] 1.2 — For button touch targets: in `DialogFooter` in `dialog.tsx`, ensure primary action buttons rendered inside dialogs get `min-h-[44px]`. Add `[&_button[type='submit']]:min-h-[44px]` CSS rule to DialogFooter OR document below which dialogs need explicit `size="lg"` on their CTA buttons
  - [x] 1.3 — Update each dialog's CTA buttons to `size="lg"` (which has `h-11` = 44px in the existing button component): `CreateAdventureDialog`, `DeleteAccountDialog`, `DensityCategoryDialog`, `StravaImportModal` (the "Importer X segment(s)" button), `SidebarStagesSection` dialogs (create/rename/delete stage). Rename dialog in `segment-card.tsx`.

- [x] **Task 2 — Create `Card` UI component** (AC: #2)
  - [x] 2.1 — Create `apps/web/src/components/ui/card.tsx` with minimal shadcn/ui Card pattern:
    - `Card`: `<div className="rounded-xl border border-[--border] bg-background">` + `cn` override support
    - `CardHeader`: `<div className="px-4 pt-4 pb-2">` with optional `<h3>` label slot
    - `CardContent`: `<div className="px-4 pb-4">`
    - All components forward `className` prop via `cn()`
  - [x] 2.2 — Update `apps/web/src/app/(app)/settings/page.tsx`:
    - Wrap each `<section>` block content with `<Card><CardContent>...</CardContent></Card>`
    - Each section header `<h2>` stays outside the card as a label above it
    - Remove the existing `className="rounded-lg border p-4"` divs in favor of `<Card>` + `<CardContent>`
    - The "Zone dangereuse" section keeps its `border-destructive` styling — pass `className="border-destructive"` to `Card`
  - [x] 2.3 — **`StravaConnectionCard` has its own `<div className="rounded-lg border p-4 space-y-3">` wrapper** (verified at `settings/_components/strava-connection-card.tsx:44`). Remove this outer div inside `StravaConnectionCard` (replace with just `<div className="space-y-3">`) so that the parent `<Card><CardContent>` in `settings/page.tsx` provides the border/rounded/padding styling without double-nesting.

- [x] **Task 3 — Sidebar section tooltips** (AC: #3)
  - [x] 3.1 — Create `apps/web/src/components/shared/section-tooltip.tsx` (see Dev Notes for full implementation — always-controlled pattern with `e.pointerType` detection for touch long-press, `onMouseEnter/Leave` for desktop hover). No `asChild` prop — base-ui Trigger doesn't support it.
  - [x] 3.2 — Update `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx`:
    - Locate the expand/collapse header div (contains `Search` icon + "Recherche de POIs" title)
    - Wrap the title+icon portion in `<SectionTooltip content="Définissez une plage kilométrique sur la trace. Cliquez 'Rechercher' pour afficher les hébergements, restaurants et autres POIs dans ce corridor.">`
  - [x] 3.3 — Update `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx`:
    - Locate the expand/collapse section header (contains icon + "Étapes" title)
    - Wrap the title+icon portion in `<SectionTooltip content="Créez des étapes journalières sur votre trace. Cliquez sur la trace ou utilisez le profil d'élévation pour placer la fin de chaque étape.">`
  - [x] 3.4 — Update `apps/web/src/app/(app)/map/[id]/_components/sidebar-weather-section.tsx`:
    - Locate the header (`data-testid="weather-section-header"`) — contains `CloudRain` icon + "Météo" title
    - Wrap the title+icon portion in `<SectionTooltip content="Prévisions météo calées sur votre allure estimée. Saisissez une heure de départ et une vitesse pour des prévisions personnalisées.">`
  - [x] 3.5 — Update `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.tsx`:
    - Locate the header (`data-testid="density-section-header"`) — contains `LayoutGrid` icon + "Densité" title
    - Wrap the title+icon portion in `<SectionTooltip content="Analyse la disponibilité des hébergements sur toute la trace. Les tronçons rouges indiquent les zones sans hébergement.">`

- [x] **Task 4 — Mode badge** (AC: #4)
  - [x] 4.1 — Update `apps/web/src/components/layout/app-header.tsx`:
    - In the `isMapPage` center section, add a "Planning" badge next to the adventure name
    - Import `Badge` from `@/components/ui/badge`
    - Layout: `<div className="flex items-center gap-2">` wrapping `<span>adventure.name</span>` + `<Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">Planning</Badge>`
    - Badge only renders when `adventure?.name` is non-null (already inside the name branch)
  - [x] 4.2 — Update `apps/web/src/app/(app)/live/[id]/page.tsx`:
    - Identify the back button / quit button area (top-left: `<Button>` with `Undo2` icon → `handleQuitRequest`)
    - Add a `<Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">Live</Badge>` in the same row as the back button or immediately adjacent to it
    - Must be visible over the map (z-index ≥ 10, positioned absolute in the top-left area)

- [x] **Task 5 — Tests** (AC: all)
  - [x] 5.1 — `app-header.test.tsx`: add test asserting "Planning" badge is rendered when on a `/map/[id]` route and adventure data is loaded
  - [x] 5.2 — `apps/web/src/app/(app)/settings/page.tsx` does not have a test file currently (server component). Skip server component test; verify manually.
  - [x] 5.3 — Create `section-tooltip.test.tsx` co-located at `apps/web/src/components/shared/section-tooltip.test.tsx` with 3 tests:
    - renders children without crash
    - tooltip content is accessible in DOM after user interaction simulation
    - long-press fires `setOpen(true)` after 500ms (fake timers)
  - [x] 5.4 — Verify existing dialog tests still pass after `DialogContent` size change (no functional change, only visual — tests shouldn't break unless they assert on className)

## Dev Notes

### DialogContent sizing — implementation detail

Current `DialogContent` className in `dialog.tsx:56`:
```
"fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-background p-4 text-sm ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
```

Change **only** `sm:max-w-sm` → `sm:min-w-[480px] sm:max-w-lg`:
- `sm:max-w-sm` = 384px — too narrow, fails AC #1 desktop requirement (480px)
- `sm:min-w-[480px]` — ensures at least 480px on desktop (≥640px viewport)
- `sm:max-w-lg` = 512px — reasonable upper bound; prevents very wide modals
- Mobile: `w-full max-w-[calc(100%-2rem)]` stays — on 375px screen = 343px width (WCAG 44px target applies to buttons, not modal width)

### Button height — CTA in dialogs

⚠️ **Ce projet a un `Button` component custom** — `size="lg"` valait initialement `h-9` (36px), pas `h-11` (44px) comme en shadcn standard. Corrigé dans cette story : `size="lg"` → `h-11 px-4` dans `button.tsx`.

`Button` avec `size="lg"` = `h-11` (44px). Utiliser pour tous les boutons CTA primaires ET secondaires (Annuler inclus) dans les footers de dialogs. Ne jamais laisser `size="default"` (h-8 = 32px) dans un dialog.

`DialogFooter` a maintenant `[&_button]:min-h-[44px]` comme filet de sécurité automatique.

Dialogs to update (Task 1.3):
| File | Button to update |
|------|-----------------|
| `adventures/_components/create-adventure-dialog.tsx` | `<Button type="submit">Créer</Button>` → `size="lg"` |
| `settings/_components/delete-account-dialog.tsx` | Delete confirm button → `size="lg"` |
| `adventures/[id]/_components/density-category-dialog.tsx` | "Lancer l'analyse" button → `size="lg"` |
| `adventures/[id]/_components/strava-import-modal.tsx` | "Importer X segment(s)" button → already has custom height? Check. |
| `map/[id]/_components/sidebar-stages-section.tsx` | "Créer l'étape" / "Sauvegarder" buttons in dialogs → `size="lg"` |
| `adventures/[id]/_components/segment-card.tsx` | Rename save button → `size="lg"` |

### Card component — minimal implementation

No `card.tsx` exists in `apps/web/src/components/ui/` (verified by glob). Create one matching existing design tokens:

```tsx
// apps/web/src/components/ui/card.tsx
import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-[--border] bg-background", className)} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-4 pt-4 pb-2", className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-4 pb-4", className)} {...props} />
}

export { Card, CardHeader, CardContent }
```

Intentionally minimal — no `CardFooter` or `CardTitle` (not needed for settings page).

### Settings page — target structure

```tsx
// settings/page.tsx — target layout (after Task 2)
<div className="container max-w-2xl pt-10 pb-8 space-y-8">
  <h1 className="text-2xl font-bold">Paramètres</h1>

  <section className="space-y-3">
    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">Intégrations</h2>
    <Card><CardContent className="pt-4"><StravaConnectionCard isConnected={isStravaConnected} /></CardContent></Card>
  </section>

  <section className="space-y-3">
    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">Recherche de points d'intérêt</h2>
    <Card><CardContent className="pt-4"><OverpassToggle initialEnabled={overpassEnabled} /></CardContent></Card>
  </section>

  <section className="space-y-3">
    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">Session</h2>
    <Card>
      <CardContent className="pt-4 flex items-center justify-between">
        <div>
          <p className="font-medium">Compte</p>
          <p className="text-sm text-muted-foreground">{session.user.email}</p>
        </div>
        <SignOutButton />
      </CardContent>
    </Card>
  </section>

  <section className="space-y-3">
    <h2 className="text-sm font-semibold text-destructive uppercase tracking-wide px-1">Zone dangereuse</h2>
    <Card className="border-destructive">
      <CardContent className="pt-4 flex items-center justify-between">
        <div>
          <p className="font-medium">Supprimer mon compte</p>
          <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
        </div>
        <DeleteAccountDialog userEmail={session.user.email} />
      </CardContent>
    </Card>
  </section>
</div>
```

Note: `StravaConnectionCard` currently renders its own styled div internally — check if it wraps itself or if it's a bare content component. If it has its own border/rounded styling, remove outer wrapper or pass a `flat` prop.

### Sidebar tooltip — `SectionTooltip` implementation

The existing `@/components/ui/tooltip` uses `@base-ui/react/tooltip`. The `<Tooltip>` (`TooltipPrimitive.Root`) accepts `open?: boolean` and `onOpenChange?: (open: boolean) => void` for controlled mode.

**Important**: base-ui `Tooltip.Trigger` does NOT support `asChild` prop (unlike Radix UI). It uses `render` prop for polymorphic rendering. Do NOT use `asChild` on `TooltipTrigger`. Wrap children inside the trigger element directly.

**`useLongPress` hook is NOT needed** — use `e.pointerType` detection directly in `SectionTooltip` to distinguish touch from mouse/pen. Simpler and avoids an extra file.

**Pattern — always controlled, handles both hover and long-press:**
```tsx
'use client'
import { useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface SectionTooltipProps {
  content: string
  children: React.ReactNode
}

export function SectionTooltip({ content, children }: SectionTooltipProps) {
  const [open, setOpen] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') {
              longPressTimer.current = setTimeout(() => setOpen(true), 500)
            }
          }}
          onPointerUp={clearTimer}
          onPointerCancel={clearTimer}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-center">{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

**Why `e.pointerType === 'touch'`**: avoids double-triggering on desktop (both `onMouseEnter` and `onPointerDown` would fire on mouse — pointerType check gates long-press to touch only).

**Why always controlled (`open={open}`)**: avoids React warning from switching between controlled (`open={true}`) and uncontrolled (`open={undefined}`). The `onMouseEnter/Leave` fully replaces base-ui's internal hover delay logic.

**Sidebar section header wrapping pattern** (same for all 4 sections):
```tsx
// In section header div — wrap just the title + icon span, not the chevron
<SectionTooltip content="...">
  <div className="flex items-center gap-2">
    <Icon className="h-5 w-5" aria-hidden="true" />
    <span className="text-sm font-medium">Section Title</span>
  </div>
</SectionTooltip>
```

The `cursor-pointer select-none` stays on the outer `div` (which handles the expand/collapse click). `<SectionTooltip>` wraps only the title portion, not the entire clickable header row — so the chevron remains a click-only target without tooltip interference.

**Task 3.1 (`use-long-press.ts`) is NOT needed** — remove it from the file list. `SectionTooltip` handles long-press internally with `pointerType` detection.

### Mode badge in header

**Planning mode** (`app-header.tsx`):
```tsx
// In the isMapPage center section, replace current span with:
<div className="flex items-center gap-2">
  <span className="text-sm font-medium text-text-primary truncate max-w-xs">
    {adventure.name}
  </span>
  <Badge
    variant="outline"
    className="shrink-0 bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs font-medium"
  >
    Planning
  </Badge>
</div>
```

**Live mode** (`live/[id]/page.tsx`):
The AppHeader returns null on `/live/` routes (`pathname.startsWith('/live/')`). The live page is full-screen. Locate the back button / quit button at the top-left of the page (the button with `Undo2` icon calling `handleQuitRequest()`). Add the badge in the same absolute-positioned row:

```tsx
// Find the back button area — likely in the top-left absolute overlay
// Add Badge import and render next to or below quit button
<Badge
  variant="outline"
  className="bg-green-500/10 text-green-600 border-green-500/20 text-xs font-medium"
>
  Live
</Badge>
```

Position with `absolute top-4 left-4 z-10 flex items-center gap-2` — adjust to not clash with existing live controls.

### Project Structure Notes

| File | Action |
|------|--------|
| `apps/web/src/components/ui/dialog.tsx` | Update `DialogContent` default: `sm:max-w-sm` → `sm:min-w-[480px] sm:max-w-lg` |
| `apps/web/src/components/ui/card.tsx` | **New** — minimal Card/CardHeader/CardContent |
| `apps/web/src/hooks/use-long-press.ts` | **New** — long-press hook (pointer events, 500ms delay) |
| `apps/web/src/components/shared/section-tooltip.tsx` | **New** — SectionTooltip component |
| `apps/web/src/app/(app)/settings/page.tsx` | Use Card components, consistent layout |
| `apps/web/src/components/layout/app-header.tsx` | Add "Planning" Badge next to adventure name |
| `apps/web/src/app/(app)/live/[id]/page.tsx` | Add "Live" Badge near back button |
| `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` | Wrap section header in SectionTooltip |
| `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` | Wrap section header in SectionTooltip |
| `apps/web/src/app/(app)/map/[id]/_components/sidebar-weather-section.tsx` | Wrap section header in SectionTooltip |
| `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.tsx` | Wrap section header in SectionTooltip |
| Various dialog files | Update CTA buttons to `size="lg"` |

### References

- Epic 16 story 16.6 requirements: `_bmad-output/planning-artifacts/epics.md#Story-16.6`
- Dialog component: `apps/web/src/components/ui/dialog.tsx`
- Tooltip component (base-ui): `apps/web/src/components/ui/tooltip.tsx`
- Badge component: `apps/web/src/components/ui/badge.tsx`
- AppHeader: `apps/web/src/components/layout/app-header.tsx`
- Live page: `apps/web/src/app/(app)/live/[id]/page.tsx`
- Settings page: `apps/web/src/app/(app)/settings/page.tsx`
- Story 16.5 completion notes (test count 875, checkbox native component pattern): `16-5-strava-import-enhancements.md`
- Tailwind JIT rule: never dynamic class generation [project-context.md]
- Button sizes: `size="lg"` → `h-11` (44px) — matches WCAG 2.5.5

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Task 1: Updated `DialogContent` default: `sm:max-w-sm` → `sm:min-w-[480px] sm:max-w-lg`. Tous les boutons CTA dialog mis à `size="lg"` + "Annuler" inclus dans tous les dialogs. `segment-card.tsx` uses inline editing (pas de dialog button à mettre à jour).
  - **Correction post-review** : `size="lg"` dans ce projet = `h-9` (36px), pas `h-11` (44px) — corrigé en mettant à jour `button.tsx` : `size="lg"` → `h-11 px-4`.
  - **Correction post-review** : `DensityCategoryDialog` avait `rounded-full px-6 py-6` qui créait des boutons pill incohérents — supprimé, utilise désormais `size="lg"` standard.
  - **Correction post-review** : `DialogFooter` reçoit `[&_button]:min-h-[44px]` comme filet de sécurité pour tous les futurs dialogs.
  - **Correction post-review** : boutons "Annuler" manquants ajoutés à `size="lg"` dans `CreateAdventureDialog`, `DeleteAccountDialog`, `StravaImportModal`, `SidebarStagesSection`.
- Task 2: Created minimal `card.tsx` (Card/CardHeader/CardContent). Settings page redesigned with card-list layout — section headers as labels above cards, danger zone keeps `border-destructive`.
  - **Correction post-review** : `StravaConnectionCard` avait sa propre `rounded-lg border p-4` → double border supprimée.
  - **Correction post-review** : `OverpassToggle` avait `rounded-lg border p-4` interne → supprimée (la `Card` parente fournit le style).
  - **Correction post-review** : centrage settings page corrigé (`container` → `max-w-2xl mx-auto px-4`) pour matcher la liste aventures.
- Task 3: Created `SectionTooltip` avec pattern always-controlled — `onMouseEnter/Leave` desktop, `pointerType === 'touch'` + 500ms long-press mobile. Applied to all 4 sidebar sections.
  - **Correction post-review** : ajout d'un `Info` icon (lucide, `h-3.5 w-3.5`, muted) dans `SectionTooltip` pour indiquer visuellement qu'une tooltip existe.
- Task 4: Planning badge (bleu) inline avec le nom de l'aventure dans le header. Live badge (vert) dans le même row que le bouton quit (top-left z-40).
- Task 5: 670 tests pass (64 files). Added 5 tests: 2 in app-header (Planning badge), 3 in section-tooltip (render, hover, long-press).
- **Code review fixes (2026-04-01)**:
  - [H1] `DeleteAccountDialog` modal width: `max-w-sm` → `max-w-[calc(100%-2rem)] sm:min-w-[480px] sm:max-w-lg` (AC #1 desktop 480px).
  - [H2+M1] `AlertDialogFooter`: ajout `[&_button]:min-h-[44px]` safety net. `segment-card.tsx` + `sidebar-stages-section.tsx` AlertDialog buttons → `size="lg"`.
  - [M2+L1] `SectionTooltip`: delayed mouseLeave close (150ms) pour permettre mouvement souris trigger→contenu. `useEffect` cleanup des timers au unmount.
  - [L3] `card.tsx`: `React.ComponentProps` → `ComponentProps` avec import explicite depuis `react`.
  - [L4] `section-tooltip.test.tsx`: sélecteur `[data-slot="tooltip-trigger"]` → `getByRole('button')`.

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] AC #3 nomme la section "Recherche de POIs" mais `search-range-control.tsx:145` affiche "Recherche". Décider si le titre doit être mis à jour (UX) ou si l'AC est à jour.

### File List

- `apps/web/src/components/ui/button.tsx` — `size="lg"`: `h-9 px-2.5` → `h-11 px-4` (44px WCAG)
- `apps/web/src/components/ui/dialog.tsx` — DialogContent: `sm:max-w-sm` → `sm:min-w-[480px] sm:max-w-lg`; DialogFooter: `[&_button]:min-h-[44px]`
- `apps/web/src/components/ui/card.tsx` — NEW: Card/CardHeader/CardContent
- `apps/web/src/components/shared/section-tooltip.tsx` — NEW: SectionTooltip avec Info icon
- `apps/web/src/components/shared/section-tooltip.test.tsx` — NEW: 3 tests
- `apps/web/src/components/layout/app-header.tsx` — Planning badge ajouté
- `apps/web/src/components/layout/app-header.test.tsx` — 2 tests Planning badge
- `apps/web/src/app/(app)/settings/page.tsx` — Card layout, centrage `max-w-2xl mx-auto px-4`
- `apps/web/src/app/(app)/settings/_components/strava-connection-card.tsx` — outer border/rounded supprimé
- `apps/web/src/app/(app)/settings/_components/overpass-toggle.tsx` — inner border/rounded supprimé
- `apps/web/src/app/(app)/settings/_components/delete-account-dialog.tsx` — tous les boutons → `size="lg"`; modal width → `sm:min-w-[480px] sm:max-w-lg`
- `apps/web/src/app/(app)/adventures/_components/create-adventure-dialog.tsx` — tous les boutons → `size="lg"`
- `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx` — `rounded-full px-6 py-6` supprimé, `size="lg"` standard
- `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.tsx` — tous les boutons → `size="lg"`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — tous les boutons dialog + AlertDialog → `size="lg"`, SectionTooltip ajouté
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx` — AlertDialog buttons → `size="lg"`
- `apps/web/src/components/ui/alert-dialog.tsx` — `AlertDialogFooter`: `[&_button]:min-h-[44px]` ajouté
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-weather-section.tsx` — SectionTooltip ajouté
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.tsx` — SectionTooltip ajouté
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — SectionTooltip ajouté
- `apps/web/src/app/(app)/live/[id]/page.tsx` — Live badge ajouté
