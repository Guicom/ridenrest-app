import type maplibregl from 'maplibre-gl'
import type { PoiCategory } from '@ridenrest/shared'

/** Mapping PoiCategory → nom du fichier SVG dans /images/poi-icons/ */
export const CATEGORY_PIN_FILE: Record<PoiCategory, string> = {
  hotel:        'hotel',
  camp_site:    'camp-site',
  shelter:      'shelter',
  guesthouse:   'guesthouse',
  hostel:       'hostel',
  restaurant:   'restaurant',
  cafe_bar:     'cafe-bar',
  gas_station:  'gas-station',
  supermarket:  'supplies',
  convenience:  'supplies',
  bike_shop:    'bike',
  bike_repair:  'bike',
}

/** Clé d'image MapLibre pour une catégorie */
export function poiPinImageKey(category: PoiCategory): string {
  return `poi-pin-${category}`
}

// Target CSS display size for pins (device-independent)
const PIN_CSS_WIDTH = 60
const PIN_CSS_HEIGHT = 75

/**
 * Charge les SVGs de pins et les enregistre dans MapLibre.
 * À appeler après map.isStyleLoaded() — idempotent (vérifie hasImage).
 *
 * Utilise ImageData (canvas) plutôt que HTMLImageElement pour garantir des
 * dimensions bitmap exactes : physW × physH pixels à pixelRatio donné.
 * Résultat affiché : toujours PIN_CSS_WIDTH × PIN_CSS_HEIGHT CSS px,
 * peu importe le devicePixelRatio ou le mode PWA standalone.
 */
export async function registerPoiPinImages(map: maplibregl.Map): Promise<void> {
  const pixelRatio = map.getPixelRatio()
  const physW = Math.round(PIN_CSS_WIDTH * pixelRatio)
  const physH = Math.round(PIN_CSS_HEIGHT * pixelRatio)

  const categories = Object.keys(CATEGORY_PIN_FILE) as PoiCategory[]

  await Promise.allSettled(
    categories.map(async (category) => {
      const imageKey = poiPinImageKey(category)
      if (map.hasImage(imageKey)) return

      const file = CATEGORY_PIN_FILE[category]
      try {
        const imageData = await loadSvgAsImageData(`/images/poi-icons/${file}.svg`, physW, physH)
        if (!map.hasImage(imageKey)) {
          map.addImage(imageKey, imageData, { pixelRatio })
        }
      } catch {
        console.warn(`[poi-pin-factory] Failed to load pin SVG for ${category}`)
      }
    })
  )
}

/**
 * Charge un SVG et le rastérise sur un canvas aux dimensions physiques exactes.
 * Retourne un ImageData — dimensions non ambiguës pour map.addImage().
 */
function loadSvgAsImageData(src: string, physW: number, physH: number): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = physW
      canvas.height = physH
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No 2d context')); return }
      ctx.drawImage(img, 0, 0, physW, physH)
      resolve(ctx.getImageData(0, 0, physW, physH))
    }
    img.onerror = reject
    img.src = src
  })
}
