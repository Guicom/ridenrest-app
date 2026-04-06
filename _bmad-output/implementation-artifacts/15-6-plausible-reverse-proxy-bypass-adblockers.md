# Story 15.6: Plausible Reverse Proxy — Bypass Ad Blockers

Status: done

## Story

As a **product owner wanting accurate analytics data**,
I want the Plausible tracking script and event endpoint proxied through the main domain `ridenrest.app`,
So that ad blockers (uBlock Origin, Brave Shield, Bitdefender SSL inspection) cannot block analytics requests, recovering an estimated 30-40% of lost desktop data.

## Problem

Les ad blockers bloquent les requetes vers `stats.ridenrest.app` car le pattern `stats.*` figure dans leurs listes de filtrage (EasyPrivacy, uBlock filters). Resultat : perte significative de donnees analytics sur les utilisateurs desktop equipes de bloqueurs.

## Solution

Proxyer le script Plausible et l'endpoint d'events via le domaine principal `ridenrest.app`, rendant le tracking invisible aux ad blockers (meme origine = pas de blocage). Approche recommandee par la documentation officielle Plausible.

## Acceptance Criteria (BDD)

1. **Given** Caddy est configure avec les regles de reverse proxy,
   **When** un navigateur requete `GET https://ridenrest.app/js/script.js`,
   **Then** Caddy proxie la requete vers `plausible:8000` avec le header `Host: stats.ridenrest.app` et retourne le script Plausible.

2. **Given** le script Plausible est charge depuis `/js/script.js` (meme origine),
   **When** un pageview ou custom event est declenche,
   **Then** le POST est envoye vers `https://ridenrest.app/api/event` (meme origine) et Caddy le proxie vers `plausible:8000`.

3. **Given** la config next-plausible est mise a jour (customDomain vide ou `ridenrest.app`),
   **When** la page se charge,
   **Then** le tag `<script>` pointe vers `/js/script.js` au lieu de `stats.ridenrest.app/js/script.js`.

4. **Given** uBlock Origin est actif dans le navigateur,
   **When** un utilisateur visite n'importe quelle page de l'app,
   **Then** les events Plausible sont enregistres avec succes (verifiable dans le dashboard `stats.ridenrest.app`).

5. **Given** Bitdefender avec SSL inspection est actif,
   **When** un utilisateur visite l'app,
   **Then** les events Plausible passent sans etre bloques.

6. **Given** le sous-domaine `stats.ridenrest.app` existe toujours,
   **When** un admin accede au dashboard Plausible,
   **Then** l'UI dashboard reste accessible normalement via `stats.ridenrest.app` — seul le tracking client est proxie.

## Tasks

- [x] Task 1: Caddy — Ajouter les regles reverse proxy
- [x] Task 2: Next.js — Modifier la config next-plausible
- [ ] Task 3: Verification avec ad blockers (tests manuels — a faire par Guillaume apres deploy)

### Task 1: Caddy — Ajouter les regles reverse proxy

**Fichier**: `Caddyfile` (bloc `ridenrest.app`)

Ajouter 2 regles `handle` dans le bloc du domaine principal :

```caddy
ridenrest.app {
    # Plausible reverse proxy (bypass ad blockers)
    handle /js/script.js {
        reverse_proxy plausible:8000 {
            header_up Host stats.ridenrest.app
            transport http {
                versions 1.1
            }
        }
    }

    handle /api/event {
        reverse_proxy plausible:8000 {
            header_up Host stats.ridenrest.app
            transport http {
                versions 1.1
            }
        }
    }

    # ... existing Next.js reverse proxy
}
```

**Points d'attention** :
- Les regles Plausible doivent etre **avant** le catch-all Next.js (`handle` est first-match)
- Conserver `transport http { versions 1.1 }` (fix HTTP/1.1 existant de la story 15.1)
- Le `header_up Host` est necessaire car Plausible valide le domaine d'origine

### Task 2: Next.js — Modifier la config next-plausible

**Fichier**: `apps/web/src/app/layout.tsx` (ou l'endroit ou `<PlausibleProvider>` est configure)

Modifier la prop `customDomain` :

```tsx
// Avant (story 15.1)
<PlausibleProvider
  domain="ridenrest.app"
  customDomain="https://stats.ridenrest.app"
  selfHosted={true}
/>

// Apres (proxy via meme origine)
<PlausibleProvider
  domain="ridenrest.app"
  selfHosted={true}
/>
```

**Explication** : En supprimant `customDomain`, next-plausible charge le script depuis l'origine courante (`/js/script.js`), ce qui est exactement ce que Caddy proxie.

### Task 3: Verification avec ad blockers

**Tests manuels** :
1. Desactiver les ad blockers → verifier que les events passent (baseline)
2. Activer uBlock Origin → verifier que les events passent toujours
3. Activer Brave Shield → verifier que les events passent
4. (Si disponible) Activer Bitdefender SSL inspection → verifier
5. Verifier dans le dashboard Plausible que les pageviews et custom events sont enregistres

**Verification DevTools** :
- Network tab : `/js/script.js` doit retourner 200 (pas bloque)
- Network tab : `POST /api/event` doit retourner 202 (pas bloque)
- Console : pas d'erreur de chargement de script

## Hors scope

- Le sous-domaine `stats.ridenrest.app` reste actif pour le dashboard Plausible admin
- Pas de renommage des paths (on utilise les paths standard Plausible `/js/script.js` et `/api/event`)
- Pas de modification des custom events existants (stories 15.2 et 15.3)

## Dependencies

- **15.1** (done) : Plausible CE installe et fonctionnel sur le VPS
- **15.2** (done) : Click tracking enrichi (events existants)
- **15.3** (done) : Funnel tracking complet (events existants)

## Reference

- Documentation officielle Plausible : https://plausible.io/docs/proxy/guides/caddy

## Dev Notes

- Risque faible : 2 regles Caddy + suppression d'une prop React
- Rollback simple : remettre `customDomain` et supprimer les regles Caddy
- Impact estime : +30-40% de donnees analytics recuperees sur desktop

## Dev Agent Record

### Implementation Notes

- **Task 1 (Caddy)**: Added two `handle` blocks in the `ridenrest.app` server block — `/js/script*` and `/api/event` — both proxy to `plausible:8000` with `Host: stats.ridenrest.app` header and HTTP/1.1 transport. Used `/js/script*` wildcard instead of `/js/script.js` because the actual script filename includes extensions (`script.outbound-links.pageview-props.tagged-events.js`). The `handle` blocks are placed before the bare `reverse_proxy` to Next.js, ensuring Caddy matches them first.
- **Task 2 (Next.js)**: Replaced absolute URLs (`${NEXT_PUBLIC_PLAUSIBLE_HOST}/js/...` and `.../api/event`) with relative same-origin paths (`/js/script.outbound-links.pageview-props.tagged-events.js` and `/api/event`). Removed `NEXT_PUBLIC_PLAUSIBLE_HOST` env var dependency entirely. Updated existing tests to verify same-origin paths instead of `stats.ridenrest.app` URLs.
- **Task 3 (Verification)**: Manual testing — requires deploy to VPS and testing with ad blockers enabled. Cannot be automated.

### Debug Log

No issues encountered during implementation.

## File List

- `Caddyfile` — added Plausible reverse proxy rules (`/js/script*`, `/api/event`)
- `apps/web/src/app/layout.tsx` — changed PlausibleProvider to use same-origin relative paths
- `apps/web/src/app/layout.test.ts` — updated tests to verify same-origin proxied paths

## Change Log

- **2026-04-06**: Implemented Plausible reverse proxy via Caddy + same-origin script/endpoint in Next.js to bypass ad blockers (tasks 1 & 2). Task 3 (manual ad blocker verification) pending deploy.
