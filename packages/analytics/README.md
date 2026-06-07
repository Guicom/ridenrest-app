# @ridenrest/analytics

Façade analytics typée, **vendor-agnostic**, partagée web ↔ mobile.

## Règles d'architecture

1. **Zéro import vendor** dans ce package — le transport est injecté au bootstrap de chaque app via `setAnalyticsClient()`. Toute fuite `posthog-js` / `posthog-react-native` ici est un blocker de code review.
2. **RGPD** : jamais de coordonnée GPS, d'email ni de PII dans les props d'events. Les ids d'aventure passent par `hashAdventureId()` (hash 8 chars base36, non réversible en pratique).
3. Tout nouveau tracking dans le monorepo passe par ce package (règle d'import projet) — pas de `posthog.capture()` direct dans les apps pour les events métier.
4. Props **toujours stringifiées** (`Record<string, string>`) — contrat historique conservé.

## Injection du transport

```ts
// Web — apps/web/src/instrumentation-client.ts (posthog-js, story posthog-1/2)
import posthog from 'posthog-js'
import { setAnalyticsClient } from '@ridenrest/analytics'

setAnalyticsClient({ capture: (event, properties) => posthog.capture(event, properties) })

// Mobile — apps/mobile (posthog-react-native, à venir MOB-6.1)
import PostHog from 'posthog-react-native'
import { setAnalyticsClient } from '@ridenrest/analytics'

const posthog = new PostHog(API_KEY, { host: 'https://eu.i.posthog.com' })
setAnalyticsClient({ capture: (event, properties) => posthog.capture(event, properties) })
```

Sans client injecté, tous les helpers sont des **no-ops** (comportement dev historique).

## Taxonomie des events

| Event | Helper | Props | Écrans émetteurs (web) | Écrans émetteurs (mobile, à venir) |
|---|---|---|---|---|
| `booking_click` | `trackBookingClick` | `source: 'booking.com' \| 'airbnb'` · `poi_type: string` · `page: 'map' \| 'live'` · `user_tier: UserTier` | `search-on-dropdown.tsx` (Planning + Live) | MOB-4.5 deep links affiliés |
| `gpx_uploaded` | `trackGpxUploaded` | `segment_count` (stringifié) · `total_km` (arrondi, stringifié) | `adventure-detail.tsx` | MOB-3.2 upload GPX |
| `map_opened` | `trackMapOpened` | `adventure_id_hash` (via `hashAdventureId`) | `map-view.tsx` | MOB-4.1 carte |
| `poi_search_triggered` | `trackPoiSearchTriggered` | `mode: 'planning' \| 'live'` · `poi_categories` (join `,`) · `result_count` (stringifié) | `map-view.tsx` (planning), `live/[id]/page.tsx` (live) | MOB-4.3 / MOB-5.3 |
| `poi_detail_opened` | `trackPoiDetailOpened` | `poi_type: string` · `source: 'overpass' \| 'google'` | `poi-popup.tsx` | MOB-4.2 detail sheet |
| `live_mode_activated` | `trackLiveModeActivated` | `adventure_id_hash` **uniquement** — JAMAIS de GPS | `live/[id]/page.tsx` (après acceptation `<GeolocationConsent />`) | MOB-5.1 activation Live |

`UserTier = 'free' | 'pro' | 'team' | 'anonymous'`

## Funnel produit (référence posthog-4)

`gpx_uploaded` → `map_opened` → `poi_search_triggered` → `poi_detail_opened` → `booking_click`

## Tests

```bash
turbo run test --filter=@ridenrest/analytics   # ou: cd packages/analytics && pnpm test
```

Logique pure, environnement node (pas de DOM) — le client injecté est mocké.
