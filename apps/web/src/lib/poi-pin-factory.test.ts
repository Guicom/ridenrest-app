import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { registerPoiPinImages, poiPinImageKey, CATEGORY_PIN_FILE } from './poi-pin-factory'
import type maplibregl from 'maplibre-gl'

// ── Stubs jsdom : Image (pas de réseau) + canvas 2d (non implémenté par jsdom) ──

const originalImage = globalThis.Image
const originalCreateElement = document.createElement.bind(document)

class ImmediateImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  set src(_value: string) {
    // Résolution synchrone au prochain tick — pas de requête réseau en test
    queueMicrotask(() => this.onload?.())
  }
}

beforeEach(() => {
  globalThis.Image = ImmediateImage as unknown as typeof Image
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return originalCreateElement(tag)
    return {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        }),
      }),
    }
  }) as typeof document.createElement)
})

afterEach(() => {
  globalThis.Image = originalImage
  vi.restoreAllMocks()
})

function createMockMap(hasImage: boolean) {
  return {
    getPixelRatio: vi.fn().mockReturnValue(2),
    hasImage: vi.fn().mockReturnValue(hasImage),
    addImage: vi.fn(),
    triggerRepaint: vi.fn(),
  }
}

describe('registerPoiPinImages', () => {
  it('registers one image per category and requests a repaint', async () => {
    // A symbol layer that already rendered with a missing `icon-image` does not repaint on its
    // own once the image lands — the pins stay invisible until the next user interaction.
    const map = createMockMap(false)

    await registerPoiPinImages(map as unknown as maplibregl.Map)

    const categories = Object.keys(CATEGORY_PIN_FILE)
    expect(map.addImage).toHaveBeenCalledTimes(categories.length)
    expect(map.addImage).toHaveBeenCalledWith(
      poiPinImageKey('hotel'),
      expect.objectContaining({ width: 120, height: 150 }),  // 60×75 CSS px × pixelRatio 2
      { pixelRatio: 2 },
    )
    expect(map.triggerRepaint).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: no image added and NO repaint when everything is already registered', async () => {
    const map = createMockMap(true)

    await registerPoiPinImages(map as unknown as maplibregl.Map)

    expect(map.addImage).not.toHaveBeenCalled()
    expect(map.triggerRepaint).not.toHaveBeenCalled()
  })
})
