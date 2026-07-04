import { useEffect } from 'react';

import { useSession } from '@/lib/auth/client';
import { identifyUser } from '@/lib/analytics/posthog';

// Identify PostHog (MOB-6.1 / T4, AC2) — miroir de `apps/web/.../analytics-identity.tsx`,
// **sans** le gate de consentement (mobile = pas de bandeau, décision autoritaire archi).
//
// - `identify(user.id)` dès qu'une session existe — `user.id` **UNIQUEMENT**, jamais
//   d'email / nom / PII (règle RGPD).
// - No-op si PostHog n'est pas bootstrapé (clé absente) : `identifyUser` est key-gated.
// - Monté **sous le guard centralisé** `(app)/_layout` (session garantie) — jamais par écran.
// - Le `reset()` au logout / suppression de compte est fait dans `use-account.ts`.
export function AnalyticsIdentity() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  // `session?.session?.id` change à chaque nouvelle session (même userId) → re-identify
  // après un logout/re-login sur le même compte, même si le composant ne s'est pas démonté.
  const sessionId = session?.session?.id;

  useEffect(() => {
    if (!userId) return;
    identifyUser(userId);
  }, [userId, sessionId]);

  return null;
}
