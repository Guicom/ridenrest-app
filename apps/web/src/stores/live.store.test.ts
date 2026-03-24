import { describe, it, expect, beforeEach } from 'vitest'
import { useLiveStore } from './live.store'

describe('useLiveStore', () => {
  beforeEach(() => {
    useLiveStore.setState({
      isLiveModeActive: false,
      geolocationConsented: false,
      currentPosition: null,
      currentKmOnRoute: null,
      speedKmh: 15,
      targetAheadKm: 30,
      searchRadiusKm: 3,
      weatherDepartureTime: null,
    })
  })

  it('initializes with correct defaults', () => {
    const state = useLiveStore.getState()
    expect(state.isLiveModeActive).toBe(false)
    expect(state.geolocationConsented).toBe(false)
    expect(state.currentPosition).toBeNull()
    expect(state.speedKmh).toBe(15)
    expect(state.targetAheadKm).toBe(30)
  })

  it('activateLiveMode sets isLiveModeActive to true', () => {
    useLiveStore.getState().activateLiveMode()
    expect(useLiveStore.getState().isLiveModeActive).toBe(true)
  })

  it('deactivateLiveMode clears live state', () => {
    useLiveStore.setState({ isLiveModeActive: true, currentPosition: { lat: 1, lng: 2 }, currentKmOnRoute: 15 })
    useLiveStore.getState().deactivateLiveMode()
    const state = useLiveStore.getState()
    expect(state.isLiveModeActive).toBe(false)
    expect(state.currentPosition).toBeNull()
    expect(state.currentKmOnRoute).toBeNull()
  })

  it('updateGpsPosition stores position client-side only (RGPD)', () => {
    useLiveStore.getState().updateGpsPosition({ lat: 43.2965, lng: 5.3698 })
    expect(useLiveStore.getState().currentPosition).toEqual({ lat: 43.2965, lng: 5.3698 })
  })

  it('setGeolocationConsent updates consent flag', () => {
    useLiveStore.getState().setGeolocationConsent(true)
    expect(useLiveStore.getState().geolocationConsented).toBe(true)
  })

  it('setCurrentKm updates currentKmOnRoute', () => {
    useLiveStore.getState().setCurrentKm(42.5)
    expect(useLiveStore.getState().currentKmOnRoute).toBe(42.5)
  })

  it('setSpeedKmh updates speedKmh', () => {
    useLiveStore.getState().setSpeedKmh(20)
    expect(useLiveStore.getState().speedKmh).toBe(20)
  })

  it('setTargetAheadKm updates targetAheadKm', () => {
    useLiveStore.getState().setTargetAheadKm(15)
    expect(useLiveStore.getState().targetAheadKm).toBe(15)
  })

  it('searchRadiusKm defaults to 3', () => {
    expect(useLiveStore.getState().searchRadiusKm).toBe(3)
  })

  it('setSearchRadius updates searchRadiusKm', () => {
    useLiveStore.getState().setSearchRadius(5)
    expect(useLiveStore.getState().searchRadiusKm).toBe(5)
  })

  it('weatherDepartureTime defaults to null', () => {
    expect(useLiveStore.getState().weatherDepartureTime).toBeNull()
  })

  it('setWeatherDepartureTime updates weatherDepartureTime', () => {
    useLiveStore.getState().setWeatherDepartureTime('2026-03-24T08:00')
    expect(useLiveStore.getState().weatherDepartureTime).toBe('2026-03-24T08:00')
  })

  it('setWeatherDepartureTime accepts null to clear', () => {
    useLiveStore.setState({ weatherDepartureTime: '2026-03-24T08:00' })
    useLiveStore.getState().setWeatherDepartureTime(null)
    expect(useLiveStore.getState().weatherDepartureTime).toBeNull()
  })
})
