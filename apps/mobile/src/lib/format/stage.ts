// Formatage des étapes (ETA, départ) — affichage pur, jamais de recalcul (les valeurs
// `etaMinutes`/`departureTime` viennent du serveur). `Intl.DateTimeFormat` dispo sous
// Hermes (RN 0.85 / SDK 56).

/**
 * Durée en « 1h30 » / « 45 min » / « 2h ».
 *
 * ⚠️ C'est une DURÉE, pas une heure d'arrivée : `etaMinutes` compte le roulage plus la pause.
 * Le cartouche l'affichait sous le label « ETA », ce qui se lisait comme une heure d'horloge
 * (retour utilisateur 2026-08-20). L'arrivée passe par `formatArrival` ci-dessous.
 */
export function formatEta(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min} min`;
  if (min === 0) return `${h}h`;
  return `${h}h${String(min).padStart(2, '0')}`;
}

/** « jeu. 15 avr. · 07:30 » (séparateur localisé). `null` → chaîne vide. */
export function formatStageDeparture(iso: string | null, locale = 'fr'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return `${date} · ${time}`;
}

/** « 21:00 », ou « ven. 21 août · 01:00 » quand l'arrivée tombe le lendemain. */
export function formatArrival(iso: string, nextDay: boolean, locale = 'fr'): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  if (!nextDay) return time;
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
  return `${date} · ${time}`;
}
