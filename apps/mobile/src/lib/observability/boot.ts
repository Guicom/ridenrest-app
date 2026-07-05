// Boot observabilité (MOB-6.1) — importé à effet de bord **en tout premier** dans le root
// layout (`src/app/_layout.tsx`), AVANT l'import de `@/lib/live/location-task`.
//
// Pourquoi un module dédié : en ESM, **tous** les `import` d'un fichier sont hoistés au-dessus
// des instructions. Pour garantir l'AC1 (« `Sentry.init()` s'exécute en tout premier, avant
// même l'import side-effect de location-task »), l'ordre d'EXÉCUTION doit être dicté par
// l'ordre des IMPORTS du root layout. Ce module, importé en 1er, exécute son corps (init
// Sentry puis bootstrap PostHog) avant que l'import suivant (location-task → `defineTask`)
// ne soit évalué.
//
// `initSentry` / `bootstrapAnalytics` sont key-gated → no-op total sans DSN/clé.
import { initSentry } from '@/lib/observability/sentry';
import { bootstrapAnalytics } from '@/lib/analytics/posthog';

// 1) Sentry EN PREMIER (AC1) — capture les erreurs du reste du boot (dont location-task).
initSentry();
// 2) PostHog APRÈS Sentry (T3) — injecte le transport sur la façade @ridenrest/analytics.
bootstrapAnalytics();
