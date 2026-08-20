import { Injectable, Logger } from '@nestjs/common'

/** Paliers de facturation Google Places utilisés dans ce projet. */
export type GoogleSku = 'text_search_ids_only' | 'text_search_pro' | 'place_details_pro'

/** `true` si le SKU est facturé. Seul le masque IDs Only est gratuit. */
export function isBillableSku(sku: GoogleSku): boolean {
  return sku !== 'text_search_ids_only'
}

/**
 * Résout le palier de facturation d'un appel Text Search à partir de son masque de champs.
 *
 * Google facture au SKU **le plus élevé** des champs demandés : un seul champ au-delà de
 * `places.id` fait basculer tout l'appel en Pro. La règle est donc « IDs Only, ou payant ».
 */
export function resolveTextSearchSku(mask: string): GoogleSku {
  const fields = mask
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && f !== 'nextPageToken')

  const idsOnly = fields.length > 0 && fields.every((f) => f === 'places.id')
  return idsOnly ? 'text_search_ids_only' : 'text_search_pro'
}

export interface BillingSnapshot {
  free: number
  billable: number
}

/**
 * Compteur d'appels Google par palier de facturation.
 *
 * ## Pourquoi ce service existe
 *
 * La génération d'étapes (story 17.18) doit émettre **zéro** appel facturable. Une consigne en
 * commentaire n'a pas suffi la première fois : le prefetch carte a demandé un masque Place
 * Details Pro pendant cinq mois pour des champs jamais lus. Le compteur rend l'invariant
 * *observable* — en test comme en production.
 *
 * Il est incrémenté au **seul** endroit où la facturation se décide (`textSearch`) et dans
 * `getPlaceDetails`. Tout nouveau chemin d'appel vers Google doit passer par l'un des deux.
 */
@Injectable()
export class GoogleBillingCounter {
  private readonly logger = new Logger(GoogleBillingCounter.name)
  private free = 0
  private billable = 0
  private readonly bySku = new Map<GoogleSku, number>()

  record(sku: GoogleSku): void {
    this.bySku.set(sku, (this.bySku.get(sku) ?? 0) + 1)
    if (isBillableSku(sku)) this.billable += 1
    else this.free += 1
  }

  snapshot(): BillingSnapshot {
    return { free: this.free, billable: this.billable }
  }

  /** Delta d'appels depuis un instantané — l'unité de mesure d'une garde d'invariant. */
  since(snapshot: BillingSnapshot): BillingSnapshot {
    return {
      free: this.free - snapshot.free,
      billable: this.billable - snapshot.billable,
    }
  }

  breakdown(): Record<string, number> {
    return Object.fromEntries(this.bySku)
  }

  /** Réinitialisation — réservée aux tests. */
  reset(): void {
    this.free = 0
    this.billable = 0
    this.bySku.clear()
    this.logger.debug('billing counters reset')
  }
}
