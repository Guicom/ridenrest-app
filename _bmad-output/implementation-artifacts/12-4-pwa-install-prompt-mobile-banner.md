# Story 12.4: PWA Install Prompt — Mobile Banner

Status: done

## Story

As a **cyclist user browsing on mobile**,
I want to see a discreet banner explaining how to install the app on my home screen,
So that I can quickly install Ride'n'Rest and use it like a native app — without guessing the browser-specific steps.

## Acceptance Criteria

1. **Collapsed banner on mobile browser** — Given a user visits the app on a mobile browser (Chrome Android, Safari iOS, Firefox Mobile), when the page loads, then a collapsed banner appears at the bottom of the screen with the text "Pour une meilleure experience, installez Ride'n'Rest", a chevron to expand, and a close button (✕). The banner is NOT visible on desktop (viewport >= 1024px).

2. **Banner hidden when already installed as PWA** — Given a user has already installed the app and opens it in standalone mode (PWA), when the app loads, then the banner is NOT shown. Detection: `window.matchMedia('(display-mode: standalone)').matches` OR `(navigator as any).standalone === true` (iOS Safari).

3. **Expandable with both platform instructions** — Given the collapsed banner is visible, when the user taps the chevron, then the banner expands to show step-by-step install instructions for **both** iPhone/iPad (Safari) and Android (Chrome). A second tap on the chevron collapses the instructions.

4. **Dismissible with persistence** — Given the banner is shown (collapsed or expanded), when the user taps the close (✕) button, then the banner disappears and is NOT shown again for this browser (persisted via `localStorage` key `pwa-install-dismissed`).

5. **Non-intrusive positioning** — The banner is positioned at the bottom of the screen (`fixed bottom-0`), does not overlap critical UI (map controls, navigation), uses a subtle animation (slide up), and respects iOS safe areas (`env(safe-area-inset-bottom)`).

6. **Not visible on marketing pages** — The banner is only rendered within the `(app)/` route group (authenticated area), not on the landing page or other `(marketing)/` routes.

## Tasks / Subtasks

- [x] Task 1: Create `useIsPwaInstalled` hook (AC: #2)
  - [x] 1.1 — Create `apps/web/src/hooks/use-is-pwa-installed.ts`
  - [x] 1.2 — Detect standalone mode: `window.matchMedia('(display-mode: standalone)').matches` (Chrome/Firefox/Edge) OR `(navigator as any).standalone === true` (iOS Safari)
  - [x] 1.3 — Return `boolean` — `true` if running as installed PWA, `false` if in browser
  - [x] 1.4 — Handle SSR: return `false` during server render (check `typeof window !== 'undefined'`)

- [x] Task 2: Create `PwaInstallBanner` component (AC: #1, #3, #4, #5)
  - [x] 2.1 — Create `apps/web/src/components/shared/pwa-install-banner.tsx`
  - [x] 2.2 — Detect mobile: `window.innerWidth < 1024` (consistent with `PlanningMobileToast` pattern)
  - [x] 2.3 — Collapsed state: "Pour une meilleure experience, installez Ride'n'Rest" + chevron + close (✕)
  - [x] 2.4 — Expanded state on chevron click: step-by-step instructions for iPhone/iPad AND Android (both always visible)
  - [x] 2.5 — Check `localStorage.getItem('pwa-install-dismissed')` — if `'true'`, don't render
  - [x] 2.6 — On close button click: `localStorage.setItem('pwa-install-dismissed', 'true')` + hide banner
  - [x] 2.7 — Styling: `fixed bottom-0 left-0 right-0 z-50` + `pb-[env(safe-area-inset-bottom)]` + slide-up animation + backdrop blur + brand green accent

- [x] Task 3: Integrate in `(app)/` layout (AC: #6)
  - [x] 3.1 — Import and render `<PwaInstallBanner />` in `apps/web/src/app/(app)/layout.tsx`
  - [x] 3.2 — Render AFTER `<Toaster />` (so it doesn't interfere with toast z-index)
  - [x] 3.3 — The component itself handles all visibility logic (mobile + not PWA + not dismissed) — the layout just mounts it

- [x] Task 4: Tests (AC: all)
  - [x] 4.1 — Unit test `use-is-pwa-installed.test.ts`: mock `matchMedia` and `navigator.standalone`
  - [x] 4.2 — Unit test `pwa-install-banner.test.tsx`: renders on mobile browser, hidden on desktop, hidden in PWA, hidden after dismiss, platform-specific messages

## Dev Notes

### PWA Standalone Detection

Two complementary checks needed:

```typescript
function isPwaInstalled(): boolean {
  if (typeof window === 'undefined') return false
  // Chrome, Edge, Firefox on Android
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari
  if ((navigator as any).standalone === true) return true
  return false
}
```

**Important:** Do NOT use `beforeinstallprompt` event for this story. That event is Chrome-only and is for intercepting the native install prompt — this story is about showing a CUSTOM informational banner, not hijacking the browser's install flow. The native browser prompt can still fire independently.

### Two-State Banner Design (Collapsed / Expanded)

The banner has two states controlled by a `expanded` boolean:

- **Collapsed** (default): "Pour une meilleure experience, installez Ride'n'Rest" + chevron (▲) + close (✕)
- **Expanded** (on chevron click): shows both platform instructions (iPhone/iPad + Android) — no UA detection needed since both are always visible

Instructions finales (textes validés par Guillaume) :
- **iPhone / iPad** : Partager → Voir plus → Sur l'écran d'accueil → Ajouter
- **Android** : Menu ⋮ (trois points en haut) → Ajouter à l'écran d'accueil → Ajouter

`getInstallPlatform()` in `pwa-utils.ts` is no longer used by this component (kept for potential future use).

### z-index Consideration

The banner is `z-50` — above everything in the map area (max z-40 for POI popup) and above the `Toaster`. Since it's `fixed`, it's outside the map's stacking context. It should not conflict with map controls.

### Existing Pattern Reference

`PlanningMobileToast` (`apps/web/src/app/(app)/map/[id]/_components/planning-mobile-toast.tsx`) uses `window.innerWidth < 1024` for mobile detection — follow the same breakpoint.

### Do NOT Use

- `beforeinstallprompt` event interception (Chrome-only, not the goal here)
- Tailwind dynamic classes on DOM elements (ref: feedback memory `feedback_tailwind_dynamic_dom`)
- `useMediaQuery` hook — not present in the codebase, `window.innerWidth` check is the established pattern

### Dismissed State

Use `localStorage` key `pwa-install-dismissed` (string `'true'`). No expiration — once dismissed, never shown again. If we want to re-prompt after updates, a future story can version the key (e.g. `pwa-install-dismissed-v2`).

### Project Structure Notes

- `apps/web/src/hooks/use-is-pwa-installed.ts` — new hook (first file in `hooks/` — create dir if needed)
- `apps/web/src/components/shared/pwa-install-banner.tsx` — new component in existing `shared/` dir
- `apps/web/src/app/(app)/layout.tsx` — modify: add `<PwaInstallBanner />`
- Tests co-located: `use-is-pwa-installed.test.ts`, `pwa-install-banner.test.tsx`

### References

- Epic 12 PWA stories: `_bmad-output/planning-artifacts/epics.md#Epic-12`
- Story 12.1 (PWA manifest): `_bmad-output/implementation-artifacts/12-1-pwa-manifest-app-install.md`
- FR-070: "L'application peut etre installee sur l'ecran d'accueil via le mecanisme PWA natif"
- FR-083: pattern mobile toast — `apps/web/src/app/(app)/map/[id]/_components/planning-mobile-toast.tsx`
- z-index stack: `_bmad-output/project-context.md#z-index-Stack`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation, no debugging required.

### Completion Notes List

- ✅ Task 1: `useIsPwaInstalled` hook — detects standalone mode via `matchMedia` (Chrome/Firefox/Edge) and `navigator.standalone` (iOS Safari). SSR-safe with `typeof window` check. 4 unit tests.
- ✅ Task 2: `PwaInstallBanner` component — two-state design (collapsed/expanded). Collapsed: "Pour une meilleure experience, installez Ride'n'Rest" + chevron + close. Expanded: step-by-step install instructions for both iPhone/iPad and Android (always both visible, no UA detection). Mobile-only (`innerWidth < 1024`), dismissible with `localStorage` persistence, `z-50` fixed bottom with safe-area padding and slide-up animation. Helper `isMobileViewport` in `lib/pwa-utils.ts`. Textes finaux validés par Guillaume. 9 unit tests.
- ✅ Task 3: Banner integrated in `(app)/layout.tsx` after `<Toaster />`. Only rendered within authenticated routes.
- ✅ Task 4: 13 total tests (4 hook + 9 component), all passing.

### Code Review Fixes (Adversarial Review — 2026-04-06)

- **H1 FIXED**: Removed dead code `getInstallPlatform()` + `InstallPlatform` type from `pwa-utils.ts` (YAGNI)
- **M1 FIXED**: Added `aria-expanded` attribute on chevron toggle button for accessibility
- **M2 FIXED**: Renamed misleading test "returns false during SSR" → "returns false when neither standalone detection matches"
- **M3 FIXED**: Added `resize` event listener so banner hides/shows when viewport crosses 1024px breakpoint + new test
- **POST-REVIEW**: Entire collapsed header row is now clickable to expand/collapse (not just the chevron icon). Close button remains independent.

### File List

- `apps/web/src/hooks/use-is-pwa-installed.ts` — NEW
- `apps/web/src/hooks/use-is-pwa-installed.test.ts` — NEW
- `apps/web/src/lib/pwa-utils.ts` — NEW
- `apps/web/src/components/shared/pwa-install-banner.tsx` — NEW
- `apps/web/src/components/shared/pwa-install-banner.test.tsx` — NEW
- `apps/web/src/app/(app)/layout.tsx` — MODIFIED (added PwaInstallBanner import + render)
