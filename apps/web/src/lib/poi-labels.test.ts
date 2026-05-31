import { describe, it, expect } from 'vitest'
import { getAccessLabel } from './poi-labels'

describe('getAccessLabel', () => {
  it('maps hotel', () => {
    expect(getAccessLabel('hotel')).toBe("Itinéraire vers l'hôtel")
  })

  it('maps hostel', () => {
    expect(getAccessLabel('hostel')).toBe("Itinéraire vers l'auberge")
  })

  it('maps camp_site', () => {
    expect(getAccessLabel('camp_site')).toBe('Itinéraire vers le camping')
  })

  it('maps shelter', () => {
    expect(getAccessLabel('shelter')).toBe('Itinéraire vers le refuge')
  })

  it('maps guesthouse', () => {
    expect(getAccessLabel('guesthouse')).toBe("Itinéraire vers la chambre d'hôte")
  })

  it('falls back for a non-accommodation category', () => {
    expect(getAccessLabel('restaurant')).toBe("Itinéraire d'accès")
  })

  it('falls back for null', () => {
    expect(getAccessLabel(null)).toBe("Itinéraire d'accès")
  })

  it('falls back for undefined', () => {
    expect(getAccessLabel(undefined)).toBe("Itinéraire d'accès")
  })
})
