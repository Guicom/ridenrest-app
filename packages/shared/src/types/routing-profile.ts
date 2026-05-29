/**
 * Profil de routage cyclable d'une aventure (Story POI-Access 2.6).
 *
 * Pilote le calcul des itinéraires d'accès aux POI (Epic 2) selon le style de
 * conduite / type de vélo. Persisté dans `adventures.routing_profile`
 * (default DB `gravel`, Story 1.3).
 */
export type RoutingProfile = 'road' | 'gravel' | 'bikepacking'

/** Valeurs valides, source de vérité pour itération UI + validation backend. */
export const ROUTING_PROFILE_VALUES: readonly RoutingProfile[] = ['road', 'gravel', 'bikepacking'] as const

/** Libellés affichés dans le `<Select>` — `gravel` est le défaut. */
export const ROUTING_PROFILE_LABELS: Record<RoutingProfile, string> = {
  road: 'Route',
  gravel: 'Gravel (par défaut)',
  bikepacking: 'Bikepacking',
}

/** Explication courte par profil (tooltip `?`). */
export const ROUTING_PROFILE_TOOLTIPS: Record<RoutingProfile, string> = {
  road: "Route privilégie l'asphalte.",
  gravel: 'Gravel mixe route et chemins blancs.',
  bikepacking: 'Bikepacking minimise le trafic routier.',
}
