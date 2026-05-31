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
  // Profil BRouter utilisé pour TOUT calcul d'accès, indépendamment du style de l'aventure
  // (décision 2026-05-31 : suppression du choix de profil). `trekking` = chemin le plus court
  // raisonnable, nationales AUTORISÉES (comportement « vélo » de Google Maps) — `fastbike`
  // évitait les nationales et produisait de longs détours par pistes. Le danger éventuel
  // (passage par une nationale) est signalé séparément via `usesMainRoad`.
  ACCESS_ROUTING_PROFILE: z.string().min(1).default('trekking'),
})

/**
 * Version du moteur de calcul d'accès — CONSTANTE DE CODE (pas une variable d'env).
 *
 * Sert de clé d'invalidation du cache `accommodations_cache.access_*` : toute ligne dont
 * `access_engine_version` diffère est recalculée (lazy) au prochain accès. La rendre constante
 * (et non surchargeable par `.env`) garantit une invalidation DÉTERMINISTE à chaque déploiement,
 * partout — un override d'env figé avait neutralisé les bumps et servait des variantes périmées
 * (sans `usesMainRoad`), provoquant des échecs de parse côté front (2026-05-31).
 *
 * Historique des bumps :
 *  - access-trekking-v3 (2026-05-31) : profil d'accès unique `trekking` (nationales autorisées)
 *    + détection nationale (`usesMainRoad`) + dédoublonnage par métriques affichées.
 *  - profiles-v2+multicand2 / +multicand (2026-05-31) : multi-candidats + dédoublonnage initial.
 *  - profiles-v2 (2026-05-30) : mapping de profils road/gravel/bikepacking.
 *  À INCRÉMENTER à chaque changement de logique de calcul affectant le résultat servi.
 */
export const ACCESS_ENGINE_VERSION = 'brouter-1.7.9+access-trekking-v3'

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
    accessRoutingProfile: parsed.data.ACCESS_ROUTING_PROFILE,
    engineVersion: ACCESS_ENGINE_VERSION,
  }
})

export default accessConfig
