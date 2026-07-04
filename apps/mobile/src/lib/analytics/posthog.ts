import PostHog from 'posthog-react-native';
import { setAnalyticsClient } from '@ridenrest/analytics';

// Bootstrap PostHog mobile (MOB-6.1 / T3, AC2 + AC4). Instancie le SDK
// `posthog-react-native` et **injecte le transport** sur la façade EXISTANTE
// `@ridenrest/analytics` (livrée par l'epic web posthog-2) — on NE recrée NI la
// taxonomie NI le package. Parité exacte avec `apps/web/src/instrumentation-client.ts`,
// **sans** le modèle de consentement web (décision autoritaire archi : mobile = zéro
// cookie → `distinct_id` AsyncStorage → pas de bandeau).
//
// **Key-gated (AC2)** : sans `EXPO_PUBLIC_POSTHOG_KEY`, on n'instancie pas et on n'appelle
// pas `setAnalyticsClient` → le client de la façade reste `null` → tous les helpers
// `track*` restent no-op (dev / test / CI sûrs, et `booking-links.tsx` continue son no-op).
//
// **RGPD / cadrage** :
//   - Cloud **EU** (`https://eu.i.posthog.com`), `distinct_id` en **AsyncStorage**
//     (défaut SDK RN, `persistence: 'file'`), **zéro cookie**, pas d'IDFA / cross-app → ATT non requis.
//   - **Pas d'autocapture** : `captureAppLifecycleEvents: false` + pas de `<PostHogProvider>`
//     (singleton seul) → AUCUN $screen/$autocapture → on n'émet QUE la taxonomie typée.
//   - **`defaultOptIn: true`** : capture active sans gate de consentement (mobile sans bandeau).
//   - **Session replay beta-only (AC4)** : `enableSessionReplay` activé UNIQUEMENT hors
//     production (`EXPO_PUBLIC_APP_ENV !== 'production'`). JAMAIS de replay en prod (→ MOB-6.6).
//     `maskAllTextInputs: true` ; le masquage de la carte MapLibre est porté par le
//     conteneur carte (`accessibilityLabel="ph-no-capture"` dans `map-canvas.tsx`).

/** Singleton PostHog — `null` tant que non bootstrapé (clé absente). */
let posthog: PostHog | null = null;

/** Instance courante (diagnostic / tests). `null` si non bootstrapé. */
export function getPostHog(): PostHog | null {
  return posthog;
}

/** Replay actif ? Beta-only : tout sauf le profil `production` (AC4). Pur, testable. */
export function isReplayEnabled(): boolean {
  const appEnv =
    process.env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? 'development' : 'production');
  return appEnv !== 'production';
}

/**
 * Instancie PostHog (une fois) et injecte le transport sur la façade. No-op si la clé est
 * absente (AC2) ou si déjà bootstrapé (idempotent). Appelé au boot après `initSentry()`
 * (cf. `src/lib/observability/boot.ts`).
 */
export function bootstrapAnalytics(): void {
  if (posthog) return; // idempotent
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return; // AC2 : pas de clé → pas d'instanciation → helpers no-op

  posthog = new PostHog(apiKey, {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    // Mobile = pas de bandeau (décision autoritaire) : capture active par défaut.
    defaultOptIn: true,
    // Pas d'autocapture lifecycle → on n'émet QUE la taxonomie typée (RGPD, anti-PII).
    captureAppLifecycleEvents: false,
    // Session replay : beta-only (AC4). JAMAIS en production.
    enableSessionReplay: isReplayEnabled(),
    sessionReplayConfig: {
      maskAllTextInputs: true,
      maskAllImages: false,
    },
  });

  // Injection du transport sur la façade (AC2). `capture()` est interne à la façade ;
  // l'adaptateur mobile ne fait que déléguer au SDK. Les helpers `track*` deviennent actifs.
  setAnalyticsClient({
    capture: (event, properties) => posthog?.capture(event, properties),
  });
}

/**
 * Rattache la session à l'utilisateur authentifié (AC2). `user.id` **UNIQUEMENT** —
 * jamais d'email / nom / PII (règle RGPD). No-op si non bootstrapé.
 */
export function identifyUser(userId: string): void {
  posthog?.identify(userId);
}

/**
 * Dissocie la session analytique (déconnexion / suppression de compte, AC2). No-op si non
 * bootstrapé. Appelé après `signOut()` (parité web `sign-out-button.tsx`).
 */
export function resetAnalytics(): void {
  posthog?.reset();
}
