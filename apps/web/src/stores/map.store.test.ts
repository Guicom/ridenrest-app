import { describe, it, expect, beforeEach } from 'vitest'
import { useMapStore } from './map.store'

describe('useMapStore', () => {
  beforeEach(() => {
    useMapStore.setState({
      activeLayer: null,
      visibleLayers: new Set(),
      zoom: 10,
      center: null,
      fromKm: 0,
      toKm: 30,
      densityColorEnabled: true,
    })
  })

  it('initializes with correct defaults', () => {
    const state = useMapStore.getState()
    expect(state.activeLayer).toBeNull()
    expect(state.visibleLayers.size).toBe(0)
    expect(state.zoom).toBe(10)
    expect(state.center).toBeNull()
    expect(state.fromKm).toBe(0)
    expect(state.toKm).toBe(30)
    expect(state.densityColorEnabled).toBe(true)
  })

  it('setActiveLayer updates activeLayer (AC #4)', () => {
    useMapStore.getState().setActiveLayer('accommodations')
    expect(useMapStore.getState().activeLayer).toBe('accommodations')
  })

  it('setActiveLayer accepts null to deselect', () => {
    useMapStore.getState().setActiveLayer('bike')
    useMapStore.getState().setActiveLayer(null)
    expect(useMapStore.getState().activeLayer).toBeNull()
  })

  it('toggleLayer adds a layer when not visible', () => {
    useMapStore.getState().toggleLayer('restaurants')
    expect(useMapStore.getState().visibleLayers.has('restaurants')).toBe(true)
  })

  it('toggleLayer removes a layer when already visible', () => {
    useMapStore.getState().toggleLayer('restaurants')
    useMapStore.getState().toggleLayer('restaurants')
    expect(useMapStore.getState().visibleLayers.has('restaurants')).toBe(false)
  })

  it('setViewport updates zoom and center', () => {
    useMapStore.getState().setViewport(14, [48.8566, 2.3522])
    const state = useMapStore.getState()
    expect(state.zoom).toBe(14)
    expect(state.center).toEqual([48.8566, 2.3522])
  })

  it('setSearchRange updates fromKm and toKm', () => {
    useMapStore.getState().setSearchRange(10, 40)
    const state = useMapStore.getState()
    expect(state.fromKm).toBe(10)
    expect(state.toKm).toBe(40)
  })

  it('densityColorEnabled defaults to true', () => {
    expect(useMapStore.getState().densityColorEnabled).toBe(true)
  })

  it('toggleDensityColor flips densityColorEnabled from true to false', () => {
    useMapStore.getState().toggleDensityColor()
    expect(useMapStore.getState().densityColorEnabled).toBe(false)
  })

  it('toggleDensityColor flips densityColorEnabled back to true', () => {
    useMapStore.getState().toggleDensityColor()
    useMapStore.getState().toggleDensityColor()
    expect(useMapStore.getState().densityColorEnabled).toBe(true)
  })
})
