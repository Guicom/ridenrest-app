import { registerAs } from '@nestjs/config'
import { z } from 'zod'

const schema = z.object({
  BROUTER_BASE_URL: z.string().url().default('http://localhost:17777'),
  BROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  BROUTER_DEFAULT_PROFILE: z.string().min(1).default('trekking'),
  ACCESS_EAGER_THRESHOLD_M: z.coerce.number().int().positive().default(1500),
  ACCESS_TRACE_BUFFER_M: z.coerce.number().int().nonnegative().default(10),
  // Sélection profil-aware du point d'entrée sur la trace : on génère plusieurs candidats
  // (le point le plus proche de chaque « passage » de la trace dans ce rayon autour du POI),
  // on route chacun avec le profil, et on garde le meilleur temps réel. Le rayon définit
  // ce qui compte comme un passage ; le plafond borne le nombre d'appels BRouter (les N
  // passages les plus proches). Cf. closestPointsOnTrace / computeFresh.
  ACCESS_CANDIDATE_RADIUS_M: z.coerce.number().int().positive().default(10_000),
  ACCESS_MAX_CANDIDATES: z.coerce.number().int().positive().max(20).default(4),
  // Bump 2026-05-31 : sélection multi-candidats profil-aware du point d'accès (le point le
  // plus proche à vol d'oiseau n'est plus forcément retenu — on minimise le temps réel selon
  // le profil). Invalide les accès en cache calculés avec l'ancienne logique mono-point
  // (ST_ClosestPoint) → recalcul lazy au prochain accès.
  // Bump 2026-05-31 (b) : dédoublonnage des variantes sur les métriques AFFICHÉES (distance,
  // D+, D-) au lieu de `etaS` → fusionne les variantes au tracé identique (entrées distinctes,
  // même segment divergent) qui apparaissaient en double. Invalide les variantes en cache
  // (potentiellement dupliquées) → recalcul lazy au prochain accès.
  // Bump 2026-05-30 : nouveau mapping de profils (road→fastbike, gravel→gravel,
  // bikepacking→trekking) — invalidation précédente, conservée pour historique.
  ACCESS_ENGINE_VERSION: z.string().min(1).default('brouter-1.7.9+profiles-v2+multicand2'),
})

const accessConfig = registerAs('access', () => {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid access routing env vars:\n${issues}`)
  }
  return {
    brouterBaseUrl: parsed.data.BROUTER_BASE_URL,
    brouterTimeoutMs: parsed.data.BROUTER_TIMEOUT_MS,
    brouterDefaultProfile: parsed.data.BROUTER_DEFAULT_PROFILE,
    eagerThresholdM: parsed.data.ACCESS_EAGER_THRESHOLD_M,
    traceBufferM: parsed.data.ACCESS_TRACE_BUFFER_M,
    candidateRadiusM: parsed.data.ACCESS_CANDIDATE_RADIUS_M,
    maxCandidates: parsed.data.ACCESS_MAX_CANDIDATES,
    engineVersion: parsed.data.ACCESS_ENGINE_VERSION,
  }
})

export default accessConfig
