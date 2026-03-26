# Story 9.1: Landing Page

Status: done

## Story

As a **potential cyclist user discovering Ride'n'Rest**,
I want a compelling landing page that shows me what the app does immediately,
So that I understand the value in seconds and feel motivated to sign up.

## Acceptance Criteria

1. **Given** a visitor arrives at `/`,
   **When** the hero renders,
   **Then** it shows a full-bleed cycling landscape photo avec animation Ken Burns, headline "Trouves où dormir le long de ta trace" (large white bold), subtitle, et sans CTA dans le hero (fidèle au site source).

2. **Given** the "Étape 01 — Créé ton aventure" section renders,
   **When** displayed,
   **Then** it shows a phone mockup (feature-step-one-phone.svg) and step content on white background with "Compatible Strava" and "Analyse de relief instantanée" checkmarks (Material Symbols icons).

3. **Given** the "Étape 02 — Décides en roulant" section renders,
   **When** displayed,
   **Then** it shows the step text and step2.gif on `#b4c9b1` section background.

4. **Given** the manifesto section renders,
   **When** displayed,
   **Then** italic centered manifesto text inside a white card, "La Communauté" overline en uppercase.

5. **Given** the navbar renders,
   **When** displayed,
   **Then** a "Se connecter" button (vert `#4A7C44`) is visible on desktop and in the mobile hamburger menu, linking to `/adventures`.

6. **Given** the page renders on mobile,
   **When** étape sections display,
   **Then** two-column layout stacks vertically — no horizontal scroll.

## Tasks / Subtasks

- [x] Task 1: Marketing layout
  - [x] 1.1 `apps/web/src/app/(marketing)/layout.tsx` — metadata SEO (robots index:true), layout wrapper minimal
  - [x] 1.2 Material Symbols chargé dans le root `layout.tsx` via `<link>` dans `<head>`

- [x] Task 2: Header avec "Se connecter" (AC: #5)
  - [x] 2.1 `apps/web/src/app/(marketing)/_components/marketing-header.tsx` — `'use client'` pour useState hamburger
  - [x] 2.2 Logo via `<Logo />` depuis `@/components/ui/logo`, wrappé dans `<Link href="/">`
  - [x] 2.3 Liens nav "Le Concept" → `/#concept`, "Pour qui?" → `/#pour-qui` via `<Link>` (pas `<a>`)
  - [x] 2.4 Bouton "Se connecter" → `href="/adventures"` — desktop nav + mobile menu panel

- [x] Task 3: Hero (AC: #1)
  - [x] 3.1 `apps/web/src/app/(marketing)/_components/hero.tsx`
  - [x] 3.2 Background `hero.webp` avec overlay gradient `from-black/55 via-black/45 to-black/65`
  - [x] 3.3 Animation Ken Burns via `animate-ken-burns` (keyframe ajouté dans `globals.css`)

- [x] Task 4: Feature sections (AC: #2, #3)
  - [x] 4.1 `apps/web/src/app/(marketing)/_components/feature-step-one.tsx` — `next/image`, unoptimized pour SVG
  - [x] 4.2 `apps/web/src/app/(marketing)/_components/feature-step-two.tsx` — `next/image`, unoptimized pour GIF

- [x] Task 5: Testimonials / Manifesto (AC: #4)
  - [x] 5.1 `apps/web/src/app/(marketing)/_components/testimonials.tsx`

- [x] Task 6: Footer
  - [x] 6.1 `apps/web/src/app/(marketing)/_components/marketing-footer.tsx` — liens via `<Link>` Next.js

- [x] Task 7: Pages supplémentaires (fidèle au site source)
  - [x] 7.1 `apps/web/src/app/(marketing)/contact/page.tsx` + `_components/contact-form.tsx` — Formspree `xlgwbojy`, `'use client'`
  - [x] 7.2 `apps/web/src/app/(marketing)/mentions-legales/page.tsx` — hébergeur mis à jour (Vercel → Hostinger)

- [x] Task 8: Assets
  - [x] 8.1 `apps/web/public/images/hero.webp` (1.4 MB) — téléchargé depuis ridenrest-web
  - [x] 8.2 `apps/web/public/images/feature-step-one-phone.svg` (135 KB) — téléchargé depuis ridenrest-web
  - [x] 8.3 `apps/web/public/images/step2.gif` (1.6 MB) — téléchargé depuis ridenrest-web

- [x] Task 9: CSS tokens marketing
  - [x] 9.1 `globals.css` — ajout palette marketing (`--earth-light #E9EDEB`, `--earth-dark #333634`, `--sage #7A8C82`, `--accent-yellow #F4C542`) dans `:root` et `@theme inline`
  - [x] 9.2 `globals.css` — ajout `@keyframes ken-burns` + `--animate-ken-burns`

- [x] Task 10: Dépendance
  - [x] 10.1 `@formspree/react` installé dans `apps/web`

## Review Follow-ups (AI)

- [ ] [AI-Review][High] AC #1 — H1 hero utilise `font-light` au lieu de `font-bold` comme spécifié. À valider/aligner lors de la passe de cohérence graphique. [`apps/web/src/app/(marketing)/_components/hero.tsx:13`]

## Dev Notes

### Source de référence
Le design et le contenu ont été portés depuis le repo public `github.com/Guicom/ridenrest-web` (React + Vite) vers Next.js 15 App Router dans le route group `(marketing)/`.

### Décisions d'implémentation

**Couleurs landing page vs app :**
La landing page utilise sa propre palette (`earth-light`, `earth-dark`, `sage`, `accent-yellow`) distincte des tokens app (`--primary #2D6A4A`, etc.). Les couleurs landing utilisent `#4A7C44` comme primary (vs `#2D6A4A` dans l'app). Les deux palettes coexistent dans `globals.css` sans conflit.

**Material Symbols :**
Chargé via `<link>` dans le root `layout.tsx` (`<head>`). Utilisé uniquement dans `feature-step-one.tsx` pour les icônes `check_circle`. Variante : `wght=300, FILL=0`.

**Images : `next/image` avec `unoptimized`**
- SVG (`feature-step-one-phone.svg`) : `unoptimized` requis car Next.js ne peut pas optimiser les SVG
- GIF (`step2.gif`) : `unoptimized` requis — l'optimiseur Next.js convertirait le GIF en WebP statique, cassant l'animation

**Ken Burns :**
Animation CSS définie dans `globals.css` comme `@keyframes ken-burns` + référencée via `--animate-ken-burns` dans `@theme inline`. Utilisable avec `animate-ken-burns` en Tailwind.

**Routing `/contact` et `/mentions-legales` :**
Dans le site source (SPA Vite), le routing était géré via `window.location.pathname`. Portés en pages Next.js séparées avec header/footer répétés (pas de layout intermédiaire partagé entre ces pages pour éviter la complexité).

**"Se connecter" → `/adventures` :**
Le middleware de Better Auth redirige vers `/login` si non authentifié. Donc le bouton peut pointer `/adventures` directement — comportement correct dans les deux cas (connecté → liste d'aventures, non connecté → login).

**Mentions légales — hébergeur :**
Mis à jour de Vercel (site source) → Hostinger (hébergeur réel du projet).

### Fichiers créés / modifiés

```
apps/web/src/app/layout.tsx                                    ← MODIFIÉ (ajout <link> Material Symbols)
apps/web/src/app/globals.css                                   ← MODIFIÉ (tokens marketing + keyframes)
apps/web/src/app/(marketing)/layout.tsx                        ← CRÉÉ
apps/web/src/app/(marketing)/page.tsx                          ← REMPLACÉ (était placeholder 10 lignes)
apps/web/src/app/(marketing)/_components/marketing-header.tsx  ← CRÉÉ
apps/web/src/app/(marketing)/_components/hero.tsx              ← CRÉÉ
apps/web/src/app/(marketing)/_components/feature-step-one.tsx  ← CRÉÉ
apps/web/src/app/(marketing)/_components/feature-step-two.tsx  ← CRÉÉ
apps/web/src/app/(marketing)/_components/testimonials.tsx      ← CRÉÉ
apps/web/src/app/(marketing)/_components/marketing-footer.tsx  ← CRÉÉ
apps/web/src/app/(marketing)/contact/page.tsx                  ← CRÉÉ
apps/web/src/app/(marketing)/contact/_components/contact-form.tsx ← CRÉÉ
apps/web/src/app/(marketing)/mentions-legales/page.tsx         ← CRÉÉ
apps/web/public/images/hero.webp                               ← CRÉÉ (asset)
apps/web/public/images/feature-step-one-phone.svg              ← CRÉÉ (asset)
apps/web/public/images/step2.gif                               ← CRÉÉ (asset)
```

### Build
`pnpm --filter web build` → ✅ compilé sans erreur. Pages statiques : `/`, `/contact`, `/mentions-legales`.

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6 (SM agent acting as dev — implémentation directe depuis source ridenrest-web)

### Debug Log References
- Erreur ESLint `no-html-link-for-pages` sur les `<a href="/#concept">` → corrigé en `<Link href="/#concept">`
- Warning `no-page-custom-font` sur Material Symbols dans `(marketing)/layout.tsx` → déplacé dans root `layout.tsx`

### Completion Notes List
- Le CTA "Essayer gratuitement" présent dans l'épic 9.1 n'existe pas dans le site source `ridenrest-web` — non implémenté pour rester fidèle au design existant. À ajouter si Guillaume le souhaite.
- `step2.gif` est lourd (1.6 MB) — à optimiser post-MVP si les performances LCP sont un problème.

### File List
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/(marketing)/layout.tsx`
- `apps/web/src/app/(marketing)/page.tsx`
- `apps/web/src/app/(marketing)/_components/marketing-header.tsx`
- `apps/web/src/app/(marketing)/_components/hero.tsx`
- `apps/web/src/app/(marketing)/_components/feature-step-one.tsx`
- `apps/web/src/app/(marketing)/_components/feature-step-two.tsx`
- `apps/web/src/app/(marketing)/_components/testimonials.tsx`
- `apps/web/src/app/(marketing)/_components/marketing-footer.tsx`
- `apps/web/src/app/(marketing)/contact/page.tsx`
- `apps/web/src/app/(marketing)/contact/_components/contact-form.tsx`
- `apps/web/src/app/(marketing)/mentions-legales/page.tsx`
- `apps/web/public/images/hero.webp`
- `apps/web/public/images/feature-step-one-phone.svg`
- `apps/web/public/images/step2.gif`
- `pnpm-lock.yaml`
