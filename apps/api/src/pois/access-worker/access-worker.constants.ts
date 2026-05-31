/** Constantes du module Access Worker (Story 4.1). */

/** Queue principale du pré-calcul d'accès POI. */
export const ACCESS_QUEUE = 'poi-access-calculation'

/** Dead-letter queue : jobs en échec définitif (⚠️Discovery #4). */
export const ACCESS_DLQ = 'poi-access-failures'

/** Nom du job de calcul d'accès sur la queue principale. */
export const COMPUTE_ACCESS_JOB = 'compute-access'

/** Nom du job déposé dans la DLQ après épuisement des retries. */
export const FAILED_ACCESS_JOB = 'failed-access'
