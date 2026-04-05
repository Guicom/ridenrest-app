import { describe, it, expect } from 'vitest'
import manifest from './manifest'

describe('PWA manifest', () => {
  const m = manifest()

  it('has correct app name', () => {
    expect(m.name).toBe("Ride'n'Rest")
    expect(m.short_name).toBe("Ride'n'Rest")
  })

  it('has display: standalone', () => {
    expect(m.display).toBe('standalone')
  })

  it('has correct brand theme_color', () => {
    expect(m.theme_color).toBe('#2D6A4A')
  })

  it('has correct background_color', () => {
    expect(m.background_color).toBe('#FFFFFF')
  })

  it('has portrait orientation', () => {
    expect(m.orientation).toBe('portrait')
  })

  it('has start_url set to /adventures (PWA opens on dashboard)', () => {
    expect(m.start_url).toBe('/adventures')
  })

  it('has id set to / (stable PWA identity)', () => {
    expect(m.id).toBe('/')
  })

  it('does NOT have explicit scope property (default / for auth flow)', () => {
    expect(m).not.toHaveProperty('scope')
  })

  it('includes at least 2 icons (192 and 512)', () => {
    expect(m.icons).toBeDefined()
    expect(m.icons!.length).toBeGreaterThanOrEqual(2)
  })

  it('includes a 192x192 icon with purpose any', () => {
    const icon192 = m.icons!.find((i) => i.sizes === '192x192')
    expect(icon192).toBeDefined()
    expect(icon192!.src).toBe('/icons/icon-192.png')
    expect(icon192!.type).toBe('image/png')
    expect(icon192!.purpose).toBe('any')
  })

  it('includes a maskable 512x512 icon', () => {
    const maskable = m.icons!.find((i) => i.purpose === 'maskable')
    expect(maskable).toBeDefined()
    expect(maskable!.sizes).toBe('512x512')
    expect(maskable!.src).toBe('/icons/icon-512-maskable.png')
  })

  it('includes a standard 512x512 icon', () => {
    const icon512 = m.icons!.find(
      (i) => i.sizes === '512x512' && i.purpose === 'any'
    )
    expect(icon512).toBeDefined()
    expect(icon512!.src).toBe('/icons/icon-512.png')
  })
})
