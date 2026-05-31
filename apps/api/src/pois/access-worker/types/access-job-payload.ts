/**
 * Payload d'un job `compute-access` de la queue `poi-access-calculation` (Story 4.1).
 *
 * ── Pivot 2026-05-30 (`nearest-trace` + retrait Live GPS) ──────────────────────────────
 *  - Plus de `stageId` : l'origine du pré-calcul est TOUJOURS `nearest-trace` (cf. bannière
 *    de tête de la story). Le `stageId` serait systématiquement `null` → champ retiré.
 *  - `routingProfile` = profil projet brut (`adventures.routing_profile`, ex. `gravel`),
 *    conservé pour l'OBSERVABILITÉ/les logs uniquement. Il n'est PAS repassé en
 *    `profileOverride` : le processor laisse `AccessCalculatorService.compute()` dériver le
 *    profil BRouter depuis la DB (mapping `PROFILE_MAP`), ce qui garantit un cache identique
 *    aux calculs lazy (même résolution de profil, même `engineVersion`).
 *
 * Déviation vs Task 3 du spec : le champ s'appelait `profile: BrouterProfile` + `stageId`.
 * Renommé/réduit ici pour rester honnête sur la sémantique (profil projet, pas profil BRouter)
 * et éviter de dupliquer le `PROFILE_MAP` privé d'`AccessCalculatorService`. Doc Sync : story 4.1.
 */
export interface AccessJobPayload {
  poiId: string
  adventureId: string
  routingProfile: string
  engineVersion: string
}

/** Payload stocké dans la dead-letter queue `poi-access-failures` (échec définitif). */
export interface AccessFailurePayload {
  payload: AccessJobPayload
  error: string
  failedAt: string
}
