import * as Sentry from '@sentry/react-native';
import type { ErrorEvent } from '@sentry/react-native';

// Crash reporting Sentry (MOB-6.1 / T2, AC1 + AC3). Erreurs JS **et** crashes natifs
// remontés avec source maps Metro (symbolication via le plugin `@sentry/react-native/expo`
// + l'upload des phases de build EAS). `initSentry()` est appelé **en tout premier** au
// boot (cf. `src/lib/observability/boot.ts`, importé avant tout le reste dans le root
// layout), puis l'export du root layout est wrappé par `Sentry.wrap()`.
//
// **Key-gated (AC1)** : sans `EXPO_PUBLIC_SENTRY_DSN`, on n'appelle PAS `Sentry.init` →
// no-op total (sûr en dev / test / CI, où le DSN est absent).
//
// **RGPD (AC3 + règle projet « GPS jamais hors device »)** : `beforeSend` /
// `beforeBreadcrumb` scrubbent défensivement toute coordonnée GPS des contexts / extra /
// breadcrumbs avant envoi. Décision de la story (non spécifiée par les docs Sentry).

/** Clés à supprimer (insensible à la casse) — toute fuite de coordonnée GPS. */
const GPS_KEYS = new Set([
  'latitude',
  'longitude',
  'lat',
  'lng',
  'lon',
  'coords',
  'coordinate',
  'coordinates',
  'position',
]);

/**
 * Supprime récursivement toute clé GPS d'un objet (mutation en place, profondeur bornée
 * pour éviter les cycles / payloads pathologiques). Pur et exporté → testable isolément.
 */
export function scrubGpsDeep(value: unknown, depth = 0): void {
  if (depth > 6 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) scrubGpsDeep(item, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (GPS_KEYS.has(key.toLowerCase())) {
      delete record[key];
      continue;
    }
    scrubGpsDeep(record[key], depth + 1);
  }
}

/**
 * `beforeSend` : scrub GPS des `contexts` / `extra` de l'event + des `data` de chaque
 * breadcrumb. Pur (prend/retourne l'event) → testable sans Sentry.
 */
export function scrubGpsFromEvent(event: ErrorEvent): ErrorEvent {
  if (!event) return event;
  scrubGpsDeep(event.contexts);
  scrubGpsDeep(event.extra);
  scrubGpsDeep(event.user);
  scrubGpsDeep(event.request);
  if (Array.isArray(event.breadcrumbs)) {
    for (const breadcrumb of event.breadcrumbs) scrubGpsDeep(breadcrumb?.data);
  }
  return event;
}

/**
 * Initialise Sentry. No-op si `EXPO_PUBLIC_SENTRY_DSN` est absent (AC1). Idempotence non
 * requise (appelé une seule fois au boot), mais le key-gate la garantit en dev/test.
 */
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  // AC1 : pas de DSN → on n'initialise PAS Sentry (dev / test / CI sûrs).
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      process.env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? 'development' : 'production'),
    // N'émet rien en dev (même avec un DSN) : Sentry actif seulement en build release.
    enabled: !__DEV__,
    // Sampling prudent sous le quota free 5k events/mois (archi-mobile.md:435).
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    // RGPD : ne jamais attacher d'IP / d'identifiants par défaut.
    sendDefaultPii: false,
    // RGPD : scrub GPS défensif avant tout envoi (décision de la story).
    beforeSend: (event: ErrorEvent) => scrubGpsFromEvent(event),
    beforeBreadcrumb: (breadcrumb) => {
      scrubGpsDeep(breadcrumb?.data);
      return breadcrumb;
    },
  });
}
