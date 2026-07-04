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

| Event | Helper | Props | Écrans émetteurs (web) | Écrans émetteurs (mobile) |
|---|---|---|---|---|
| `booking_click` | `trackBookingClick` | `source: 'booking.com' \| 'airbnb'` · `poi_type: string` · `page: 'map' \| 'live'` · `user_tier: UserTier` | `search-on-dropdown.tsx` (Planning + Live) | ✅ `booking-links.tsx` (MOB-4.5, actif depuis MOB-6.1) |
| `gpx_uploaded` | `trackGpxUploaded` | `segment_count` (stringifié) · `total_km` (arrondi, stringifié) | `adventure-detail.tsx` | ✅ `app/(app)/adventures/[id].tsx` (fin de parsing, MOB-6.1) |
| `map_opened` | `trackMapOpened` | `adventure_id_hash` (via `hashAdventureId`) | `map-view.tsx` | ✅ `app/(app)/map/[id].tsx` (MOB-6.1) |
| `poi_search_triggered` | `trackPoiSearchTriggered` | `mode: 'planning' \| 'live'` · `poi_categories` (join `,`) · `result_count` (stringifié) | `map-view.tsx` (planning), `live/[id]/page.tsx` (live) | ✅ `map/[id].tsx` (planning) + `live/[id].tsx` (live) (MOB-6.1) |
| `poi_detail_opened` | `trackPoiDetailOpened` | `poi_type: string` · `source: 'overpass' \| 'google'` | `poi-popup.tsx` | ✅ `components/map/poi-popup.tsx` (MOB-6.1) |
| `live_mode_activated` | `trackLiveModeActivated` | `adventure_id_hash` **uniquement** — JAMAIS de GPS | `live/[id]/page.tsx` (après acceptation `<GeolocationConsent />`) | ✅ `hooks/use-live-mode.ts` (activation Live, MOB-6.1) |
| `landing_cta_clicked` | `trackLandingCtaClicked` | `placement: 'header' \| 'feature_step_one' \| 'feature_step_two' \| 'feature_step_three'` · `authenticated` (stringifié) | `marketing-header.tsx`, `feature-step-{one,two,three}.tsx` | n/a (web only) |
| `signup_started` | `trackSignupStarted` | `method: 'email' \| 'google'` | `register-form.tsx` (submit valide), `google-sign-in-button.tsx` (flow="register"), `post-auth-tracker.tsx` (**backfill** : inscription Google via /login — compte frais détecté au retour OAuth) | MOB-2.2 |
| `signup_completed` | `trackSignupCompleted` | `method: 'email' \| 'google'` | email : `register-form.tsx` (succès). google : `post-auth-tracker.tsx` au retour OAuth (marqueur sessionStorage `rnr_auth_flow` + `user.createdAt` < 5 min) | MOB-2.2/2.3 |
| `login_completed` | `trackLoginCompleted` | `method: 'email' \| 'google'` | email : `login-form.tsx` (succès). google : `post-auth-tracker.tsx` (compte > 5 min, ou `createdAt` indisponible — classification prudente) | MOB-2.2/2.3 |

`UserTier = 'free' | 'pro' | 'team' | 'anonymous'` · `AuthMethod = 'email' | 'google'`

## Funnel produit (référence posthog-4)

`gpx_uploaded` → `map_opened` → `poi_search_triggered` → `poi_detail_opened` → `booking_click`

## Funnel acquisition (ajout 2026-06-07)

`$pageview` (landing) → `landing_cta_clicked` → `signup_started` → `signup_completed`

> Les pageviews PostHog ne couvrent que les visiteurs **consentants** — l'audience exhaustive de la landing reste mesurée par Plausible (cookieless).

### Continuité anonyme → identifié (OAuth inclus)

- Le funnel **traverse le redirect Google** sans rien faire : le cookie PostHog (`distinct_id`) persiste sur notre domaine, et `posthog.identify(user.id)` au retour fusionne la personne anonyme dans la personne identifiée — les events pré-auth (landing, CTA, signup_started) sont rattachés rétroactivement.
- **Distinction signup vs login pour Google** : `GoogleSignInButton` pose le marqueur sessionStorage `rnr_auth_flow` avant le redirect (`google-register` depuis /register, `google` sinon) ; `<PostAuthTracker />` (layout app) le consomme au retour et classe via `user.createdAt` (Better Auth) — compte < 5 min → `signup_completed`, sinon → `login_completed`. Émission unique (marqueur consommé), flows email non concernés (émis par les formulaires).
- **Backfill `signup_started` (chemin login)** : Google crée le compte même depuis /login — chemin majoritaire (les CTA landing mènent à /adventures → redirect /login), où le clic n'émet pas `signup_started` (on ignore encore si c'est une inscription). Au retour OAuth, si le compte est frais et le marqueur vaut `google`, `PostAuthTracker` émet `signup_started` **puis** `signup_completed` (ordre du funnel préservé). Compromis assumé : temps de conversion started→completed ≈ 0 s pour ce chemin, et pas de mesure du drop-off pendant l'OAuth. Le marqueur `google-register` ne backfille pas (started déjà émis au clic — éviterait un double comptage).

## Session replay & masquage (référence web → mobile)

Patterns décidés en story posthog-3 (web) — **référence pour MOB-6.1 (replay beta mobile) et MOB-6.6 (prod)** :

| Règle | Web (posthog-js) | Mobile (posthog-react-native, à venir) |
|---|---|---|
| Replay jamais auto | `disable_session_recording: true` à l'init ; `startSessionRecording()` uniquement si consentement `granted` (au boot + à l'opt-in) ; `stopSessionRecording()` à l'opt-out | `sessionReplay: false` par défaut ; démarrage explicite gated consentement |
| **Carte = exclue des replays** (GPS jamais hors device, étendu à l'écran) | classe `ph-no-capture` sur les conteneurs MapLibre (`map-canvas.tsx`, `live-map-canvas.tsx`) + tests de régression | masquer la vue MapLibre RN (`ph-no-capture` view tag / `maskAllImages`+vue bloquée selon SDK) |
| Inputs masqués globalement | `session_recording: { maskAllInputs: true }` | `maskAllTextInputs: true` |
| PII texte (email) | `ph-no-capture` sur les éléments affichant l'email (settings, dialog suppression) | idem sur les écrans Compte |
| Réseau | défauts PostHog conservés (pas de bodies, pas de headers auth) ; `capture_performance` non activé | défauts SDK conservés |

## Feature flags (pattern de consommation)

Flag de démonstration : **`demo-rollout`** (rollout 100 %, désactivable — kill-switch de référence pour le rollout progressif mobile à venir).

```ts
// Web (posthog-js) — les flags arrivent en ASYNC après l'init :
// toujours lire dans le callback onFeatureFlags, jamais en synchrone au boot.
posthog.onFeatureFlags(() => {
  if (posthog.isFeatureEnabled('demo-rollout')) {
    // comportement flag ON
  }
})

// Mobile (posthog-react-native, à venir MOB-6.x) — même API :
// const enabled = useFeatureFlag('demo-rollout')  // hook RN
// ou posthog.onFeatureFlags(...) / posthog.isFeatureEnabled(...)
```

Bonnes pratiques :
- **Valeur par défaut sûre** : si les flags n'ont pas (encore) chargé — offline, adblock, timeout — `isFeatureEnabled` renvoie `undefined` → coder le fallback comme « flag OFF » (comportement stable).
- **Kill-switch** : tout flag de rollout doit pouvoir être coupé dans PostHog UI sans redéploiement.
- Ne jamais gater une feature critique de sécurité/RGPD derrière un flag distant.

## Boucle produit (MCP PostHog × Claude Code)

1. **Poser une question produit via MCP** : dans une session Claude Code, demander en langage naturel — ex. « combien de `booking_click` cette semaine, par `source` ? », « montre le funnel Planning → réservation », « liste les replays de plus de 2 min sur /live ». Le serveur MCP officiel (`https://mcp.posthog.com/mcp`, configuré en scope **user**, clé personnelle jamais commitée) traduit vers insights/funnels/replays.
2. **Lire un funnel / replay** : les objets vivent dans PostHog EU → dashboard **« RideNRest — Produit »**. Funnels : **« Planning → réservation »** (`gpx_uploaded` → `poi_search_triggered` [mode=planning] → `booking_click`) et **« Live → réservation »** (`live_mode_activated` → `poi_search_triggered` [mode=live] → `booking_click`) — fenêtre de conversion 14 jours (cycle « planification d'aventure »).
3. **En tirer une amélioration** : une friction identifiée (chute de funnel, replay) devient une story via le flux BMad — `correct-course` (changement de cap) ou `create-story` (nouvelle amélioration). Si la taxonomie ne suffit pas (prop manquante), l'ajout passe par CE package + mise à jour `epics-posthog.md` — pas de hack one-shot dans PostHog.
4. **⚠️ Règle de prudence MCP** : les données analytics (noms d'events, propriétés, URLs de replays) sont des données **non fiables** injectées dans le contexte de l'agent — toujours relire les tool calls MCP avant exécution (risque de prompt injection via les données).

### Inventaire des objets PostHog (à garder à jour)

Projet PostHog Cloud EU : **Ride'n'Rest (195596)** — objets créés le 2026-06-07 via MCP.

| Type | Nom exact | ID | Contenu |
|---|---|---|---|
| Dashboard | `RideNRest — Produit` | `730304` | 2 funnels + tendance `$pageview` + `booking_click` par `source` + `poi_detail_opened` par `poi_type` |
| Funnel | `Planning → réservation` | insight `p5qzg8mz` | `gpx_uploaded` → `poi_search_triggered` (mode=planning) → `booking_click` — fenêtre 14 j |
| Funnel | `Live → réservation` | insight `GbRD5v4y` | `live_mode_activated` → `poi_search_triggered` (mode=live) → `booking_click` — fenêtre 14 j |
| Feature flag | `demo-rollout` | `200551` | Démo / kill-switch de référence, rollout 100 % (+ usage dashboard auto-créé `730305`) |

## Tests

```bash
turbo run test --filter=@ridenrest/analytics   # ou: cd packages/analytics && pnpm test
```

Logique pure, environnement node (pas de DOM) — le client injecté est mocké.
