import { describe, it, expect, beforeEach } from 'vitest'
import { useMapStore } from './map.store'

describe('useMapStore', () => {
  beforeEach(() => {
    useMapStore.setState({
      activeLayer: null,
      visibleLayers: new Set(['accommodations']),
      zoom: 10,
      center: null,
      fromKm: 0,
      toKm: 30,
      searchRangeInteracted: false,
      searchCommitted: false,
      densityColorEnabled: true,
      weatherActive: false,
      weatherDimension: 'temperature',
      activeAccommodationTypes: new Set(['hotel']),
      selectedPoiId: null,
      selectedStageId: null,
    })
  })

  it('initializes with correct defaults', () => {
    const state = useMapStore.getState()
    expect(state.activeLayer).toBeNull()
    expect(state.visibleLayers.has('accommodations')).toBe(true)
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

  it('setSearchRange updates fromKm, toKm, searchRangeInteracted and resets searchCommitted', () => {
    useMapStore.setState({ searchCommitted: true })
    useMapStore.getState().setSearchRange(10, 40)
    const state = useMapStore.getState()
    expect(state.fromKm).toBe(10)
    expect(state.toKm).toBe(40)
    expect(state.searchRangeInteracted).toBe(true)
    expect(state.searchCommitted).toBe(false)
  })

  it('searchCommitted defaults to false', () => {
    useMapStore.setState({ searchCommitted: false })
    expect(useMapStore.getState().searchCommitted).toBe(false)
  })

  it('setSearchCommitted(true) sets searchCommitted and searchRangeInteracted to true', () => {
    useMapStore.setState({ searchCommitted: false, searchRangeInteracted: false })
    useMapStore.getState().setSearchCommitted(true)
    const state = useMapStore.getState()
    expect(state.searchCommitted).toBe(true)
    expect(state.searchRangeInteracted).toBe(true)
  })

  it('setSearchCommitted(false) sets searchCommitted to false', () => {
    useMapStore.setState({ searchCommitted: true })
    useMapStore.getState().setSearchCommitted(false)
    expect(useMapStore.getState().searchCommitted).toBe(false)
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

  it('weatherActive defaults to false', () => {
    expect(useMapStore.getState().weatherActive).toBe(false)
  })

  it('setWeatherActive sets weather layer active', () => {
    useMapStore.getState().setWeatherActive(true)
    expect(useMapStore.getState().weatherActive).toBe(true)
  })

  it('setWeatherActive deactivates weather layer', () => {
    useMapStore.getState().setWeatherActive(true)
    useMapStore.getState().setWeatherActive(false)
    expect(useMapStore.getState().weatherActive).toBe(false)
  })

  it('weatherDimension defaults to temperature', () => {
    expect(useMapStore.getState().weatherDimension).toBe('temperature')
  })

  it('setWeatherDimension updates the dimension', () => {
    useMapStore.getState().setWeatherDimension('wind')
    expect(useMapStore.getState().weatherDimension).toBe('wind')
  })

  it('setWeatherDimension can be set to precipitation', () => {
    useMapStore.getState().setWeatherDimension('precipitation')
    expect(useMapStore.getState().weatherDimension).toBe('precipitation')
  })
})
