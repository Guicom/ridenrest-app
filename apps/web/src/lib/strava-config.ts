// Kill-switch Strava — flip à false pour griser les CTA en cas d'incident API/quota Strava.
export const isStravaEnabled = () => process.env.NEXT_PUBLIC_STRAVA_ENABLED === 'true'
