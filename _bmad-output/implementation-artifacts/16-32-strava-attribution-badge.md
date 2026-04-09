# Story 16.32: Attribution Strava — Conformité Brand Guidelines + Badge + Deauthorize + Bouton OAuth + Feature Flag

Status: review

> **Ajouté 2026-04-09** — Conformité Strava Brand Guidelines + API Agreement. Cinq volets : (A) attribution visuelle avec assets officiels, (B) bouton OAuth officiel, (C) revoke token à la déconnexion, (D) privacy policy, (E) feature flag `STRAVA_ENABLED` pour désactiver Strava tant que l'app n'est pas vérifiée. Mis à jour après analyse des Strava API Terms (Section 2.2.5, 5, 9.1) et Brand Guidelines.

## Story

As a **cyclist who imports routes from Strava**,
I want the app to fully comply with Strava API Agreement and Brand Guidelines,
So that the app can pass Strava's verification review, display proper attribution, and correctly handle user disconnection.

## Acceptance Criteria

### A — Attribution visuelle

1. **Given** la carte Planning est affichée (`map-canvas.tsx`) et au moins un segment a `source === 'strava'`,
   **When** la carte est rendue,
   **Then** le badge **"Powered by Strava"** (logo + texte) est affiché en **bas à gauche** de la carte, avec le logo officiel couleur `#FC5200`.

2. **Given** la carte Live est affichée (`live-map-canvas.tsx`) et au moins un segment a `source === 'strava'`,
   **When** la carte est rendue,
   **Then** le badge **"Powered by Strava"** est affiché en **haut à droite**, positionné avant les boutons layers/zoom/recentre.

3. **Given** la liste des aventures (`adventure-card.tsx`),
   **When** une aventure possède au moins un segment avec `source = 'strava'`,
   **Then** le badge Strava avec le texte **"Powered by Strava"** est affiché sous le kilométrage et le D+ en `text-xs text-muted-foreground`.

4. **Given** aucun segment n'a `source === 'strava'` dans une aventure ou sur la carte,
   **When** les composants sont rendus,
   **Then** aucun logo/badge Strava n'est visible.

5. **Given** un segment card dans la page aventure detail (`segment-card.tsx`),
   **When** le segment a `source === 'strava'`,
   **Then** le texte "Via Strava" est remplacé par le badge officiel **"Powered by Strava"** (`/public/powered-by-strava.svg`).

6. **Given** tous les endroits affichant le badge Strava (cartes, adventure card, segment card),
   **When** l'implémentation est faite,
   **Then** le SVG officiel `/public/powered-by-strava.svg` est utilisé à la place de l'ancien `/public/strava-logo.svg` + texte manuel. L'ancien `strava-logo.svg` (couleur `#FC4C02` incorrecte) est supprimé.

### B — Bouton OAuth officiel "Connect with Strava"

7. **Given** la page Settings (`strava-connection-card.tsx`) et l'utilisateur n'est pas connecté à Strava,
   **When** le bouton "Connecter Strava" est affiché,
   **Then** le bouton shadcn actuel (SVG inline maison) est remplacé par le **bouton officiel** "Connect with Strava" (`/public/btn_strava_connect_with_white.svg`), rendu comme `<img>` cliquable, en respectant la taille minimum de 48px de hauteur.

8. **Given** l'utilisateur est déjà connecté à Strava,
   **When** la page Settings est affichée,
   **Then** le bouton "Déconnecter" reste un bouton shadcn standard (pas de changement — Strava ne fournit pas de bouton disconnect officiel).

### C — Deauthorize token à la déconnexion

9. **Given** un utilisateur connecté à Strava clique sur "Déconnecter" dans les paramètres,
   **When** `disconnectStrava()` est exécuté,
   **Then** l'app appelle `POST https://www.strava.com/oauth/deauthorize` avec le `Bearer` token **avant** de supprimer le row en DB. Si l'appel échoue (token déjà expiré, réseau), on continue la suppression locale (best-effort, pas bloquant).

10. **Given** un utilisateur supprime son compte (`deleteAccount`),
    **When** le compte est supprimé,
    **Then** si un compte Strava est lié, le token est révoqué côté Strava avant la suppression (même logique best-effort).

### D — Privacy policy

11. **Given** la page `/mentions-legales`,
    **When** un utilisateur ou le reviewer Strava consulte la page,
    **Then** une section **"Données Strava"** est présente, couvrant :
    - Types de données collectées : "Routes GPS (tracés GPX) importées depuis votre compte Strava"
    - Méthode : "Via OAuth 2.0, scope read-only (`read,read_all`), à votre initiative uniquement"
    - Déconnexion : "Paramètres > Déconnecter Strava — supprime le token et révoque l'accès auprès de Strava"
    - Conservation : "Les routes importées restent dans vos aventures. Le token OAuth est supprimé et révoqué à la déconnexion."
    - Pas de partage : "Vos données Strava ne sont jamais partagées avec des tiers"

### E — Feature flag `STRAVA_ENABLED` (quota athlètes non vérifiés)

12. **Given** la variable d'environnement `NEXT_PUBLIC_STRAVA_ENABLED` est absente ou vaut `false`,
    **When** un utilisateur non connecté à Strava visite la page Settings,
    **Then** le bouton "Connect with Strava" est grisé (`opacity-50 cursor-not-allowed`) avec un tooltip : "L'intégration Strava est temporairement indisponible. L'import GPX manuel reste disponible."

13. **Given** `NEXT_PUBLIC_STRAVA_ENABLED=false`,
    **When** un utilisateur visite la page aventure detail et n'a pas de compte Strava lié,
    **Then** le bouton "Ajouter depuis Strava" est grisé avec le même message tooltip.

14. **Given** `NEXT_PUBLIC_STRAVA_ENABLED=false` mais l'utilisateur a **déjà** un compte Strava connecté (lié avant la désactivation),
    **When** il visite la page Settings ou adventure detail,
    **Then** les fonctions Strava existantes restent actives (import, déconnexion). Le flag n'affecte que les **nouvelles connexions**.

15. **Given** `NEXT_PUBLIC_STRAVA_ENABLED=true`,
    **When** les composants Strava sont rendus,
    **Then** tout fonctionne normalement — aucun bouton grisé, aucun tooltip.

## Tasks / Subtasks

### Volet A — Attribution visuelle

- [x] Task 1 — Backend : ajouter `hasStravaSegment` à `AdventureResponse` (AC: #3)
  - [x] 1.1 — Ajouter `hasStravaSegment: boolean` au type `AdventureResponse` dans `packages/shared/src/types/adventure.types.ts`
  - [x] 1.2 — Ajouter `findAdventureIdsWithStravaSegments()` dans `apps/api/src/adventures/adventures.repository.ts`
  - [x] 1.3 — Propager le champ dans `AdventuresService.toResponse()` dans `apps/api/src/adventures/adventures.service.ts`
  - [x] 1.4 — Ajouter le test unitaire dans `adventures.service.test.ts`

- [x] Task 2 — Shared types : ajouter `source` à `MapSegmentData` (AC: #1, #2)
  - [x] 2.1 — Ajouter `source: string | null` au type `MapSegmentData` dans `packages/shared/src/types/adventure.types.ts`
  - [x] 2.2 — Propager dans `AdventuresRepository.getAdventureMapData()`

- [x] Task 3 — Adventure card : badge Strava (AC: #3, #4)
  - [x] 3.1 — Modifier `adventure-card.tsx` pour afficher le badge Strava sous km/D+
  - [x] 3.2 — ⚠️ **Mettre à jour** le texte de "Via Strava" → **"Powered by Strava"**

- [x] Task 4 — Carte Planning : badge Strava bas gauche (AC: #1, #4)
  - [x] 4.1 — Overlay conditionnel `absolute bottom-5 left-2`
  - [x] 4.2 — Condition : `segments.some(s => s.source === 'strava')`
  - [x] 4.3 — Afficher **"Powered by Strava"** (logo + texte), pas juste le logo seul

- [x] Task 5 — Carte Live : badge Strava haut droite (AC: #2, #4)
  - [x] 5.1 — Logo + texte "Powered by Strava" dans `live-map-canvas.tsx`
  - [x] 5.2 — Conditionné par `segments.some(s => s.source === 'strava')`

- [x] Task 6 — Remplacer par les assets officiels Strava (AC: #5, #6)
  - [x] 6.1 — **Supprimer** `/public/strava-logo.svg` (ancien logo maison, couleur incorrecte `#FC4C02`)
  - [x] 6.2 — Remplacer toutes les `<img src="/strava-logo.svg">` par `<img src="/powered-by-strava.svg">` dans : `segment-card.tsx`, `adventure-card.tsx`, `map-canvas.tsx`, `live-map-canvas.tsx`
  - [x] 6.3 — Supprimer le texte "Via Strava" / "Powered by Strava" en dur — le SVG officiel contient déjà le texte
  - [x] 6.4 — Ajuster la taille de l'image : `h-4` ou `h-5` pour le badge (le SVG officiel est horizontal logo+texte)
  - [x] 6.5 — Dans `strava-connection-card.tsx` : supprimer le SVG inline maison et utiliser `<img src="/powered-by-strava.svg">` pour le label "Strava" à côté du statut de connexion

### Volet B — Bouton OAuth officiel

- [x] Task 7 — Remplacer le bouton "Connecter Strava" par le bouton officiel (AC: #7, #8)
  - [x] 7.1 — Dans `strava-connection-card.tsx` : remplacer le `<Button>Connecter Strava</Button>` par `<img src="/btn_strava_connect_with_white.svg" alt="Connect with Strava" className="h-12 cursor-pointer" />` wrappé dans un élément cliquable qui déclenche `authClient.oauth2.link()`
  - [x] 7.2 — Garder le bouton "Déconnecter" en `<Button variant="outline">` shadcn (pas de bouton officiel Strava pour disconnect)
  - [x] 7.3 — Respecter la taille minimum : 48px de hauteur (`h-12`)

### Volet C — Deauthorize token

- [x] Task 8 — Révoquer le token Strava à la déconnexion (AC: #9)
  - [x] 8.1 — Dans `apps/web/src/app/(app)/settings/actions.ts`, modifier `disconnectStrava()` :
    - Avant le `delete` dans la transaction, récupérer le `accessToken` du compte Strava
    - Appeler `POST https://www.strava.com/oauth/deauthorize` avec `Authorization: Bearer {token}`
    - Best-effort : si l'appel échoue (réseau, token expiré), logger un warning et continuer la suppression locale
  - [x] 8.2 — Test : mocker fetch et vérifier que deauthorize est appelé avant le delete

- [x] Task 9 — Révoquer le token Strava à la suppression de compte (AC: #10)
  - [x] 9.1 — Dans `deleteAccount()` ou dans le hook `databaseHooks.user.delete` de Better Auth, vérifier si un compte Strava existe et révoquer le token avant suppression
  - [x] 9.2 — Même logique best-effort que Task 8

### Volet D — Privacy policy

- [x] Task 10 — Ajouter section Strava à la privacy policy (AC: #11)
  - [x] 10.1 — Identifier le fichier de la page `/mentions-legales` et ajouter une section "Données Strava" avec les 5 points listés dans l'AC #11

### Volet E — Feature flag `STRAVA_ENABLED`

- [x] Task 14 — Ajouter `NEXT_PUBLIC_STRAVA_ENABLED` env var (AC: #12-15)
  - [x] 14.1 — Ajouter `NEXT_PUBLIC_STRAVA_ENABLED=false` dans `.env.example` et `.env` de prod (VPS). Préfixe `NEXT_PUBLIC_` obligatoire car lu côté client.
  - [x] 14.2 — Créer un helper `isStravaEnabled()` dans `apps/web/src/lib/strava-config.ts` : `export const isStravaEnabled = () => process.env.NEXT_PUBLIC_STRAVA_ENABLED === 'true'`

- [x] Task 15 — Griser le bouton "Connect with Strava" dans Settings (AC: #12, #14)
  - [x] 15.1 — Dans `strava-connection-card.tsx` : si `!isStravaEnabled() && !isConnected`, afficher le bouton officiel avec `opacity-50 cursor-not-allowed pointer-events-none`
  - [x] 15.2 — Ajouter un message sous le bouton : "L'intégration Strava est temporairement indisponible. L'import GPX manuel reste disponible." en `text-xs text-muted-foreground`
  - [x] 15.3 — Si l'user est **déjà connecté** (`isConnected === true`), ne pas griser — le bouton "Déconnecter" et les fonctions d'import restent actifs

- [x] Task 16 — Griser le bouton "Ajouter depuis Strava" dans adventure detail (AC: #13, #14)
  - [x] 16.1 — Identifier le bouton/lien "Ajouter depuis Strava" dans `adventure-detail.tsx` ou `strava-import-modal.tsx`
  - [x] 16.2 — Si `!isStravaEnabled()` ET l'user n'a pas de compte Strava lié → griser avec même message
  - [x] 16.3 — Si l'user a déjà un compte Strava lié → fonctionnement normal (import reste actif)

### Tests

- [x] Task 11 — Tests attribution (AC: #1-5)
  - [x] 11.1 — Test `adventure-card` : badge présent/absent
  - [x] 11.2 — Test `map-canvas` : logo conditionnel
- [x] Task 12 — Tests deauthorize (AC: #9-10)
  - [x] 12.1 — Test `disconnectStrava` : mock fetch, vérifier appel deauthorize
  - [x] 12.2 — Test : si deauthorize échoue, la déconnexion locale se fait quand même
- [x] Task 13 — Mettre à jour tests existants (AC: #5, #6, #7)
  - [x] 13.1 — Mettre à jour les tests adventure-card et map-canvas pour vérifier la nouvelle image `powered-by-strava.svg` au lieu de `strava-logo.svg`
- [x] Task 17 — Tests feature flag (AC: #12-15)
  - [x] 17.1 — Test `strava-connection-card` : bouton grisé quand `NEXT_PUBLIC_STRAVA_ENABLED=false` et non connecté
  - [x] 17.2 — Test `strava-connection-card` : bouton actif quand `NEXT_PUBLIC_STRAVA_ENABLED=false` mais déjà connecté
  - [x] 17.3 — Test : tout actif quand `NEXT_PUBLIC_STRAVA_ENABLED=true`

## Dev Notes

### Assets officiels Strava (déjà en place dans `/public/`)

| Fichier | Usage | Taille recommandée |
|---------|-------|-------------------|
| `/public/powered-by-strava.svg` | Badge attribution partout (cartes, cards, segment) | `h-4` à `h-5` (16-20px) |
| `/public/btn_strava_connect_with_white.svg` | Bouton OAuth dans Settings | `h-12` min (48px — requis par Strava) |
| `/public/strava-logo.svg` | ❌ **À SUPPRIMER** — ancien logo maison, couleur incorrecte | — |

### Badge "Powered by Strava"

Le SVG officiel `powered-by-strava.svg` contient déjà le logo + le texte "Powered by Strava" — **ne pas ajouter de texte manuellement**. Utiliser simplement :
```tsx
<img src="/powered-by-strava.svg" alt="Powered by Strava" className="h-4" />
```

### Bouton "Connect with Strava"

Le SVG officiel `btn_strava_connect_with_white.svg` est un bouton complet. Remplacer le `<Button>` shadcn par :
```tsx
<button type="button" onClick={handleConnect} disabled={isPending} className="cursor-pointer disabled:opacity-70">
  <img src="/btn_strava_connect_with_white.svg" alt="Connect with Strava" className="h-12" />
</button>
```

### Feature flag `NEXT_PUBLIC_STRAVA_ENABLED`

Variable d'environnement côté client (préfixe `NEXT_PUBLIC_` requis par Next.js pour exposition au browser).

```ts
// apps/web/src/lib/strava-config.ts
export const isStravaEnabled = () => process.env.NEXT_PUBLIC_STRAVA_ENABLED === 'true'
```

**Comportement par défaut** : si la variable est absente → Strava désactivé (sécurité). Il faut explicitement `=true` pour activer.

**Logique clé** : le flag désactive uniquement les **nouvelles connexions**. Un user déjà connecté (`isConnected === true`) garde accès à l'import et à la déconnexion. Cela évite de casser l'expérience des users existants.

**Composants impactés** :
- `strava-connection-card.tsx` — bouton Connect grisé si `!isStravaEnabled() && !isConnected`
- `adventure-detail.tsx` ou le trigger d'ouverture du `strava-import-modal.tsx` — bouton "Ajouter depuis Strava" grisé si `!isStravaEnabled()` et pas de compte Strava lié

**Activation** : quand Strava approuve la vérification de l'app → `NEXT_PUBLIC_STRAVA_ENABLED=true` dans `.env` de prod → `pm2 restart web`

### Deauthorize endpoint Strava

```
POST https://www.strava.com/oauth/deauthorize
Authorization: Bearer {access_token}
```

Retourne `200` si OK. Si le token est déjà expiré/révoqué, retourne `401` — on doit ignorer cette erreur et continuer.

### Lien "View on Strava"

Les Brand Guidelines recommandent un lien "View on Strava" quand on affiche des données Strava. **Actuellement impossible** car on ne stocke pas le `stravaRouteId` dans `adventure_segments` (seulement `source = 'strava'`). Deux options :
- **Post-MVP** : ajouter une colonne `source_ref` au schéma pour stocker l'ID de la route Strava
- **Maintenant** : ne pas afficher de lien — le badge "Powered by Strava" suffit pour la conformité minimale

**Décision** : reporter le lien "View on Strava" post-MVP.

### Fichiers à modifier

| Fichier | Changement |
|---------|-----------|
| `packages/shared/src/types/adventure.types.ts` | ✅ Déjà fait — `hasStravaSegment` + `source` sur `MapSegmentData` |
| `apps/api/src/adventures/adventures.repository.ts` | ✅ Déjà fait |
| `apps/api/src/adventures/adventures.service.ts` | ✅ Déjà fait |
| `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx` | Remplacer logo+texte maison → `powered-by-strava.svg` |
| `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` | Remplacer logo+texte maison → `powered-by-strava.svg` |
| `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` | Remplacer logo+texte maison → `powered-by-strava.svg` |
| `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx` | Remplacer `strava-logo.svg` + "Via Strava" → `powered-by-strava.svg` |
| `apps/web/src/app/(app)/settings/_components/strava-connection-card.tsx` | Remplacer SVG inline + `<Button>` → `btn_strava_connect_with_white.svg` + `powered-by-strava.svg` pour le label |
| `apps/web/public/strava-logo.svg` | ❌ **SUPPRIMER** (remplacé par assets officiels) |
| `apps/web/src/app/(app)/settings/actions.ts` | Ajouter deauthorize avant delete |
| Page `/mentions-legales` | Ajouter section "Données Strava" |
| `apps/web/src/lib/strava-config.ts` | **NOUVEAU** — helper `isStravaEnabled()` |
| `apps/web/.env.example` | Ajouter `NEXT_PUBLIC_STRAVA_ENABLED=false` |
| `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` | Griser bouton Strava si `!isStravaEnabled()` et pas de compte lié |

### Attention

- **Assets officiels déjà en place** : `powered-by-strava.svg` et `btn_strava_connect_with_white.svg` dans `/public/` — NE PAS recréer de SVG maison
- Ne PAS ajouter de texte "Powered by Strava" manuellement — le SVG officiel contient déjà le texte intégré
- Le `disconnectStrava` doit lire le token AVANT de le supprimer — attention à l'ordre des opérations dans la transaction
- Le deauthorize est **best-effort** : ne jamais bloquer la déconnexion locale si l'appel Strava échoue
- La suppression de compte via Better Auth cascade-delete les accounts — il faut hook le deauthorize AVANT la cascade

### References

- [Source: packages/shared/src/types/adventure.types.ts] — types AdventureResponse + MapSegmentData
- [Source: apps/api/src/adventures/adventures.repository.ts] — findAllByUserId + getAdventureMapData
- [Source: apps/api/src/adventures/adventures.service.ts:85-101] — toResponse()
- [Source: apps/web/src/app/(app)/settings/actions.ts:44-70] — disconnectStrava() actuel (sans deauthorize)
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx:183-187] — badge actuel "Via Strava"
- [Source: apps/web/src/components/shared/osm-attribution.tsx] — pattern overlay carte
- [Source: apps/web/public/strava-logo.svg] — SVG actuel avec couleur incorrecte #FC4C02
- [Source: Strava API Agreement] — https://www.strava.com/legal/api (Section 2.2.5, 5, 7, 9.1)
- [Source: Strava Brand Guidelines] — https://developers.strava.com/guidelines/

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References

### Completion Notes List
- ✅ Task 1: Ajouté `hasStravaSegment: boolean` à `AdventureResponse`. Approche choisie : méthode dédiée `findAdventureIdsWithStravaSegments()` dans le repository (selectDistinct + inArray) au lieu d'une subquery EXISTS — évite de changer le type de retour de `findAllByUserId`. Service passe le booléen à `toResponse()`. Tests unitaires ajoutés (19 tests passent).
- ✅ Task 2: Ajouté `source: string | null` à `MapSegmentData` + propagation dans `getAdventureMapData()`. Aucune régression (922 tests web + 271 tests API passent).
- ✅ Task 3: Badge "Via Strava" dans `adventure-card.tsx` — affiché sous km/D+ quand `hasStravaSegment === true`, même pattern que `segment-card.tsx`. ⚠️ À mettre à jour → "Powered by Strava"
- ✅ Task 4: Logo Strava overlay `bottom-5 left-2` dans `map-canvas.tsx` — conditionnel `segments.some(s => s.source === 'strava')`, style identique à `OsmAttribution`. ⚠️ À mettre à jour → ajouter texte "Powered by Strava"
- ✅ Task 5: Logo Strava overlay `top-2 right-2` dans `live-map-canvas.tsx` — même condition et style. ⚠️ À mettre à jour → ajouter texte "Powered by Strava"
- ✅ Task 11: Tests ajoutés — adventure-card (badge présent/absent), map-canvas (logo conditionnel). Tous les tests passent sans régression.
- ✅ Task 6: Remplacé `strava-logo.svg` par `powered-by-strava.svg` dans tous les composants (adventure-card, map-canvas, live-map-canvas, segment-card, strava-connection-card). Supprimé l'ancien SVG maison. Supprimé les textes "Via Strava" en dur — le SVG officiel contient déjà le texte. Taille `h-4` partout sauf settings (`h-5`).
- ✅ Task 7: Remplacé le `<Button>Connecter Strava</Button>` shadcn par le bouton officiel `btn_strava_connect_with_white.svg` (48px hauteur). Le bouton Déconnecter reste en shadcn `<Button variant="outline">`.
- ✅ Task 8: Ajouté deauthorize best-effort dans `disconnectStrava()` — récupère le token AVANT la transaction, appelle `POST /oauth/deauthorize`, continue la suppression locale si l'appel échoue.
- ✅ Task 9: Ajouté hook `databaseHooks.user.delete.before` dans Better Auth (`auth.ts`) — revoke Strava token avant cascade-delete du compte. Même logique best-effort.
- ✅ Task 10: Ajouté section "8. Données Strava" à la page `/mentions-legales` avec les 5 points requis (types de données, méthode OAuth, déconnexion, conservation, pas de partage).
- ✅ Task 12: Ajouté 2 tests deauthorize dans `actions.test.ts` — vérifie que fetch est appelé avec le bon token et que la déconnexion locale continue si deauthorize échoue.
- ✅ Task 13: Mis à jour les tests adventure-card, map-canvas et segment-card pour vérifier `powered-by-strava.svg` et `alt="Powered by Strava"`. Mis à jour les tests strava-connection-card pour le bouton officiel.
- ✅ Task 14: Créé helper `isStravaEnabled()` dans `apps/web/src/lib/strava-config.ts`. Par défaut Strava désactivé si `NEXT_PUBLIC_STRAVA_ENABLED` absent ou `false`.
- ✅ Task 15: Bouton "Connect with Strava" grisé (`opacity-50 cursor-not-allowed disabled`) quand `!isStravaEnabled() && !isConnected`. Message "temporairement indisponible" affiché en dessous. Users déjà connectés gardent accès au bouton Déconnecter.
- ✅ Task 16: Bouton "Importer depuis Strava" grisé dans adventure-detail.tsx quand `!isStravaEnabled() && !stravaConnected`. Tooltip au hover expliquant l'indisponibilité. Users déjà connectés gardent l'import actif.
- ✅ Task 17: 3 tests feature flag ajoutés — bouton grisé quand disabled+non connecté, actif quand disabled+déjà connecté, actif quand enabled.

### File List
- `packages/shared/src/types/adventure.types.ts` — ajouté `hasStravaSegment` à `AdventureResponse`, `source` à `MapSegmentData`
- `apps/api/src/adventures/adventures.repository.ts` — ajouté `findAdventureIdsWithStravaSegments()`, `source` dans `getAdventureMapData()`
- `apps/api/src/adventures/adventures.service.ts` — `toResponse()` accepte `hasStravaSegment`, toutes les méthodes publiques le passent
- `apps/api/src/adventures/adventures.service.test.ts` — ajouté mock `findAdventureIdsWithStravaSegments`, test `hasStravaSegment`
- `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx` — badge `powered-by-strava.svg` sous km/D+
- `apps/web/src/app/(app)/adventures/_components/adventure-card.test.tsx` — tests badge Strava officiel (présent/absent)
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — overlay `powered-by-strava.svg` bas gauche
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx` — tests badge Strava officiel conditionnel
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` — overlay `powered-by-strava.svg` haut droite
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx` — remplacé `strava-logo.svg` + "Via Strava" → `powered-by-strava.svg`
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx` — tests badge officiel segment
- `apps/web/src/app/(app)/settings/_components/strava-connection-card.tsx` — SVG inline → `powered-by-strava.svg` + bouton OAuth officiel
- `apps/web/src/app/(app)/settings/_components/strava-connection-card.test.tsx` — tests bouton officiel "Connect with Strava"
- `apps/web/src/app/(app)/settings/actions.ts` — deauthorize Strava avant suppression locale
- `apps/web/src/app/(app)/settings/actions.test.ts` — tests deauthorize (appel fetch + best-effort)
- `apps/web/src/lib/auth/auth.ts` — hook `user.delete.before` pour deauthorize Strava à la suppression de compte
- `apps/web/src/app/(marketing)/mentions-legales/page.tsx` — section "Données Strava" ajoutée
- `apps/web/public/strava-logo.svg` — ❌ SUPPRIMÉ (remplacé par assets officiels)
- `apps/web/src/lib/strava-config.ts` — helper `isStravaEnabled()` (feature flag `NEXT_PUBLIC_STRAVA_ENABLED`)
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — bouton "Importer depuis Strava" grisé si flag désactivé
- `apps/web/src/app/(app)/live/[id]/page.tsx` — badge Strava déplacé à côté du bouton retour
