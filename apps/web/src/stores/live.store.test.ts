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
})
