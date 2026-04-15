# Story 17.9: Redirect proxy Booking — fix deep links mobile

Status: done

## Story

As a **cyclist using the app on mobile**,
I want Booking.com links to open in the mobile browser with my search parameters intact,
So that I see the correct search results instead of my last Booking.com session from the native app.

## Context & Probleme

Sur mobile, quand l'app native Booking.com est installee, iOS (Universal Links) et Android (App Links) interceptent les URLs `booking.com` et ouvrent l'app native. L'app Booking **ignore les parametres de recherche** (`?ss=`, `?latitude=`, `?longitude=`) et restaure la derniere session utilisateur — l'utilisateur ne voit pas les resultats attendus.

**Solution** : passer par un endpoint intermediaire sur `api.ridenrest.app` qui fait un `302 redirect` vers l'URL Booking finale. Comme l'URL initiale n'est pas `booking.com`, l'OS ne l'intercepte pas → le navigateur mobile s'ouvre avec les bons parametres.

## Acceptance Criteria

1. **Given** l'API NestJS,
   **When** un `GET /api/go/booking?url=<encoded_booking_url>` est recu,
   **Then** l'API repond avec un `302 Found` et le header `Location: <decoded_booking_url>`.

2. **Given** l'URL passee dans `?url=`,
   **When** elle ne commence pas par `https://www.booking.com/`,
   **Then** l'API repond `400 Bad Request` — seuls les liens Booking sont acceptes (securite : pas d'open redirect).

3. **Given** l'endpoint `/api/go/booking`,
   **When** il est appele,
   **Then** il est **public** (pas de `JwtAuthGuard`) — les liens doivent fonctionner meme si le token a expire ou en navigation anonyme.

4. **Given** le composant `SearchOnDropdown`,
   **When** un lien Booking est genere (via `buildBookingSearchUrl` ou `buildBookingCoordUrl`),
   **Then** l'URL affichee dans le `<a href>` passe par le proxy : `https://api.ridenrest.app/api/go/booking?url=<encoded_original_url>`.

5. **Given** un lien Booking dans la popup POI (poi detail sheet),
   **When** il est genere,
   **Then** il passe egalement par le proxy redirect.

6. **Given** le frontend genere une URL proxy,
   **When** l'URL est construite,
   **Then** une helper `wrapBookingUrl(originalUrl: string): string` dans `booking-url.ts` encapsule la logique — les composants appellent `wrapBookingUrl(buildBookingSearchUrl(...))`.

7. **Given** l'endpoint proxy est appele,
   **When** la reponse est envoyee,
   **Then** les headers anti-cache sont presents (`Cache-Control: no-store`) pour eviter que le navigateur cache la redirection.

8. **Given** les liens Airbnb dans `SearchOnDropdown`,
   **When** ils sont generes,
   **Then** ils restent inchanges (lien direct) — seuls les liens Booking passent par le proxy.

9. **Given** les tests existants,
   **When** la story est implementee,
   **Then** tous les tests existants passent + nouveaux tests ajoutent couvrent le controller et la helper `wrapBookingUrl`.

## Tasks / Subtasks

### Phase 1 — API (NestJS) : endpoint redirect

- [x] Task 1 — Creer le module `go` (AC: #1, #2, #3, #7)
  - [x] 1.1 — Creer `apps/api/src/go/go.module.ts` : module minimal, importe rien
  - [x] 1.2 — Creer `apps/api/src/go/go.controller.ts` :
    - `@Controller('go')` + `@Public()` (pas d'auth)
    - `@Get('booking')` avec `@Query('url') url: string`
    - Valider que `url` commence par `https://www.booking.com/` → sinon `BadRequestException`
    - Repondre `302` avec `res.redirect(302, decodedUrl)` + header `Cache-Control: no-store`
  - [x] 1.3 — Enregistrer `GoModule` dans `app.module.ts` (imports array)

- [x] Task 2 — Tests API (AC: #9)
  - [x] 2.1 — Creer `apps/api/src/go/go.controller.test.ts` :
    - Test redirect 302 avec URL Booking valide
    - Test 400 avec URL non-Booking (ex: `https://evil.com/...`)
    - Test 400 sans parametre `url`
    - Test header `Cache-Control: no-store` present

### Phase 2 — Frontend : wrapper URL

- [x] Task 3 — Helper `wrapBookingUrl` (AC: #6)
  - [x] 3.1 — `apps/web/src/lib/booking-url.ts` : ajouter `wrapBookingUrl(url: string): string` qui retourne `${process.env.NEXT_PUBLIC_API_URL}/go/booking?url=${encodeURIComponent(url)}`
  - [x] 3.2 — `apps/web/src/lib/booking-url.test.ts` : test unitaire pour `wrapBookingUrl`

- [x] Task 4 — Mettre a jour `SearchOnDropdown` (AC: #4, #8)
  - [x] 4.1 — `apps/web/src/components/shared/search-on-dropdown.tsx` : wrapper `bookingUrl` avec `wrapBookingUrl()` avant de le passer au `<a href>`. Ne PAS toucher a `airbnbUrl`.

- [x] Task 5 — Mettre a jour la popup POI (AC: #5)
  - [x] 5.1 — Chercher les autres endroits ou `buildBookingSearchUrl` / `buildBookingCoordUrl` sont appeles et appliquer `wrapBookingUrl`

### Phase 3 — Tests & validation

- [x] Task 6 — Verification complete (AC: #9)
  - [x] 6.1 — `pnpm turbo test` : tous les tests passent
  - [ ] 6.2 — Verifier manuellement sur mobile (ou simuler) que le lien proxy ouvre le navigateur et non l'app Booking

### Review Findings

- [x] [Review][Patch] Ajouter test subdomain bypass dans go.controller.test.ts — vérifier que `https://www.booking.com.evil.com/phishing` retourne 400 [apps/api/src/go/go.controller.test.ts]
- [x] [Review][Patch] Corriger dev note spec: `NEXT_PUBLIC_API_URL` n'inclut PAS `/api` (prod: `https://api.ridenrest.app`, dev: `http://localhost:3010`). Le code est correct (`/api/go/booking`), la note est trompeuse. [17-9-booking-redirect-proxy-mobile-deep-link-fix.md:101]
- [x] [Review][Defer] Rate limiting endpoint public `/api/go/booking` — pré-existant, aucun rate limiting dans toute l'app

## Dev Notes

### Architecture & patterns existants

- **NestJS feature module pattern** : chaque feature a son `module.ts` + `controller.ts` + `service.ts`. Ici, pas besoin de service ni repository — le controller fait le redirect directement. C'est acceptable pour un endpoint aussi simple.
- **`@Public()` decorator** : importer depuis `apps/api/src/common/decorators/public.decorator.ts` — deja utilise par `HealthController`.
- **ResponseInterceptor** : le controller NE DOIT PAS utiliser le `ResponseInterceptor` standard car on retourne un redirect 302, pas du JSON. Utiliser `@Res()` de NestJS avec `res.redirect()` pour bypasser l'interceptor.
- **API base URL** : les endpoints NestJS sont montes sur `/api/*` via le prefix global. Le path final sera `/api/go/booking`.
- **`NEXT_PUBLIC_API_URL`** : deja utilise partout dans le frontend (TanStack Query). Valeur prod : `https://api.ridenrest.app` (sans `/api`). Dev : `http://localhost:3010`. Le code ajoute `/api/go/booking` dans le path, donc l'URL finale est `${NEXT_PUBLIC_API_URL}/api/go/booking?url=...`.

### Securite : prevention d'open redirect

**CRITIQUE** : l'endpoint DOIT valider que l'URL de destination commence par `https://www.booking.com/`. Sans cette validation, l'endpoint serait un **open redirect** exploitable pour du phishing. Utiliser un check strict :
```typescript
if (!url || !url.startsWith('https://www.booking.com/')) {
  throw new BadRequestException('Invalid booking URL')
}
```

### NestJS redirect avec bypass interceptor

Pour faire un redirect 302 sans que le `ResponseInterceptor` ne wrape la reponse :
```typescript
import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common'
import type { Response } from 'express'

@Get('booking')
redirectBooking(@Query('url') url: string, @Res() res: Response) {
  // validation...
  res.set('Cache-Control', 'no-store')
  res.redirect(302, url)
}
```

Le `@Res()` decorator dit a NestJS que le controller gere la reponse lui-meme — le `ResponseInterceptor` ne s'applique pas.

### Endroits utilisant les liens Booking (exhaustif)

1. **`apps/web/src/components/shared/search-on-dropdown.tsx`** — composant dropdown "Rechercher sur Booking.com / Airbnb" utilise dans planning sidebar + live controls
2. **Popup POI** — verifier si des liens Booking directs existent dans les composants de detail POI (poi-card, poi-popup)

Chercher avec : `grep -r "booking.com" apps/web/src/` pour identifier tous les usages.

### Tracking analytics

Le tracking Plausible (`trackBookingClick`) reste **cote client** dans le `onClick` du lien — il n'est PAS deplace cote serveur. Le redirect proxy sert uniquement a contourner l'interception Universal Links/App Links. Le tracking client fonctionne car le `onClick` se declenche avant la navigation.

### Variable d'environnement

`NEXT_PUBLIC_API_URL` est deja definie dans tous les environnements :
- Dev : `http://localhost:3010/api`
- Prod : `https://api.ridenrest.app/api`

Pas besoin d'ajouter de nouvelle variable.

### Project Structure Notes

Nouveau dossier : `apps/api/src/go/` — module minimaliste (2 fichiers : module + controller + 1 test).
Pattern identique a `health/` : controller public, pas de service, pas de repository.

```
apps/api/src/go/
  go.module.ts
  go.controller.ts
  go.controller.test.ts
```

### References

- [Source: apps/web/src/lib/booking-url.ts] — `buildBookingSearchUrl`, `buildBookingCoordUrl`, `buildAirbnbSearchUrl`
- [Source: apps/web/src/components/shared/search-on-dropdown.tsx] — Composant dropdown liens Booking/Airbnb
- [Source: apps/api/src/common/decorators/public.decorator.ts] — Decorator `@Public()` pour endpoints sans auth
- [Source: apps/api/src/health/health.controller.ts] — Pattern controller public existant
- [Source: apps/api/src/app.module.ts] — Registre des modules
- [Source: apps/web/src/lib/analytics.ts] — Tracking Plausible `booking_click`
- [Source: Story 16.16] — City-based Booking URLs (derniere evolution des liens Booking)
- [Source: Story 16.31] — Region/country enrichment dans `?ss=` Booking

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Aucun debug necessaire — implementation directe.

### Completion Notes List

- **Task 1** : Module `go` cree — `GoController` avec `@Public()`, `@Res()` pour bypass ResponseInterceptor, validation strict `startsWith('https://www.booking.com/')`, redirect 302 + `Cache-Control: no-store`. Enregistre dans `AppModule`.
- **Task 2** : 7 tests unitaires couvrant : redirect valide, header Cache-Control, URLs non-Booking (400), URL manquante (400), chaine vide (400), HTTP non-HTTPS (400), URL avec query params complexes.
- **Task 3** : Helper `wrapBookingUrl()` ajoute dans `booking-url.ts` — utilise `NEXT_PUBLIC_API_URL` + `/go/booking?url=` + `encodeURIComponent()`. 3 tests Vitest ajoutés.
- **Task 4** : `SearchOnDropdown` mis a jour — `bookingUrl` passe par `wrapBookingUrl()`. Les tests existants adaptes pour verifier les params Booking a travers l'URL proxy encodee. `airbnbUrl` inchange (AC #8).
- **Task 5** : Grep exhaustif confirme qu'aucun lien Booking direct n'existe dans les composants POI popup — seul `SearchOnDropdown` utilise les liens Booking. No-op.
- **Task 6** : 297 tests API + 1001 tests web + lint = tout vert. Zero regressions. 6.2 (test mobile manuel) reste a faire apres deploy.

### Change Log

- 2026-04-15 : Implementation complete story 17.9 — redirect proxy Booking + wrapBookingUrl frontend

### File List

- `apps/api/src/go/go.module.ts` (NEW)
- `apps/api/src/go/go.controller.ts` (NEW)
- `apps/api/src/go/go.controller.test.ts` (NEW)
- `apps/api/src/app.module.ts` (MODIFIED — ajout GoModule)
- `apps/web/src/lib/booking-url.ts` (MODIFIED — ajout wrapBookingUrl)
- `apps/web/src/lib/booking-url.test.ts` (MODIFIED — ajout tests wrapBookingUrl)
- `apps/web/src/components/shared/search-on-dropdown.tsx` (MODIFIED — wrap bookingUrl via proxy)
- `apps/web/src/components/shared/search-on-dropdown.test.tsx` (MODIFIED — adaptation tests proxy URL)
