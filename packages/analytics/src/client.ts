import type { AnalyticsClient, AnalyticsEvent } from './types'

/**
 * Transport injecté — null par défaut : tous les helpers sont des no-ops
 * tant qu'aucun client n'est branché (comportement historique : no-op en dev
 * sans script analytics chargé).
 */
let analyticsClient: AnalyticsClient | null = null

/** Branche (ou débranche avec null) le transport vendor — appelé une fois au bootstrap de l'app. */
export function setAnalyticsClient(client: AnalyticsClient | null): void {
  analyticsClient = client
}

/** Émission interne utilisée par les helpers d'events. */
export function capture(event: AnalyticsEvent, properties?: Record<string, string>): void {
  analyticsClient?.capture(event, properties)
}
