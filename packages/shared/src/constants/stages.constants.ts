// 8-color palette — cycle through on auto-assign
export const STAGE_COLORS = [
  '#f97316', // orange
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#ef4444', // red
  '#eab308', // yellow
  '#06b6d4', // cyan
  '#ec4899', // pink
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Génération automatique d'étapes (story 17.18)
// ─────────────────────────────────────────────────────────────────────────────

/** Pas de recul/avance quand un candidat de fin d'étape ne convient pas. */
export const STAGE_GEN_STEP_KM = 5

/**
 * Amplitude maximale d'exploration autour de la cible, dans les DEUX sens.
 *
 * Conséquence assumée : l'objectif km/jour est une cible à ±40 km, pas un plafond. Le D+ max,
 * lui, reste une contrainte dure dans les deux sens — sinon le réglage n'aurait plus d'effet
 * dès qu'un recul échoue.
 */
export const STAGE_GEN_MAX_OFFSET_KM = 40

/** Nombre d'hébergements à détecter autour d'un point pour y accepter une fin d'étape. */
export const STAGE_GEN_MIN_ACCOMMODATIONS = 3

/** Plafond d'étapes par appel — borne la durée d'une requête synchrone. */
export const MAX_GENERATED_STAGES_PER_CALL = 14

/** Objectif km/jour pré-rempli dans le formulaire. */
export const DEFAULT_TARGET_KM_PER_DAY = 80

/** Heure de départ pré-remplie dans le formulaire (08:00 locale). */
export const DEFAULT_DEPARTURE_HOUR = 8

/** Bornes du champ « km par jour ». */
export const MIN_TARGET_KM_PER_DAY = 10
export const MAX_TARGET_KM_PER_DAY = 300
