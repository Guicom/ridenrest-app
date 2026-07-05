import { useLiveStore } from '@/lib/stores/live.store';

// Store Live (Zustand) — port verbatim du web (MOB-5.1). Couvre les defaults, le nettoyage
// RGPD de `deactivateLiveMode` (position + km nullés) et les actions de la fondation.
// État global → snapshot init + restore entre tests.

const initial = useLiveStore.getState();

beforeEach(() => {
  useLiveStore.setState({ ...initial }, true);
});

describe('useLiveStore', () => {
  it('defaults (parité web)', () => {
    const s = useLiveStore.getState();
    expect(s.isLiveModeActive).toBe(false);
    expect(s.geolocationConsented).toBe(false);
    expect(s.currentPosition).toBeNull();
    expect(s.currentKmOnRoute).toBeNull();
    expect(s.speedKmh).toBe(15);
    expect(s.targetAheadKm).toBe(30);
    expect(s.searchRadiusKm).toBe(5);
    expect(s.weatherDepartureTime).toBeNull();
    expect(s.stageLayerActive).toBe(false);
    expect(s.gpsTrackingActive).toBe(true);
  });

  it('activateLiveMode active le mode', () => {
    useLiveStore.getState().activateLiveMode();
    expect(useLiveStore.getState().isLiveModeActive).toBe(true);
  });

  it('deactivateLiveMode nulle position + km (AC5, RGPD)', () => {
    useLiveStore.setState({
      isLiveModeActive: true,
      currentPosition: { lat: 45, lng: 5 },
      currentKmOnRoute: 12.3,
    });
    useLiveStore.getState().deactivateLiveMode();
    const s = useLiveStore.getState();
    expect(s.isLiveModeActive).toBe(false);
    expect(s.currentPosition).toBeNull();
    expect(s.currentKmOnRoute).toBeNull();
  });

  it('setGeolocationConsent / updateGpsPosition / setCurrentKm', () => {
    useLiveStore.getState().setGeolocationConsent(true);
    expect(useLiveStore.getState().geolocationConsented).toBe(true);

    useLiveStore.getState().updateGpsPosition({ lat: 46, lng: 6 });
    expect(useLiveStore.getState().currentPosition).toEqual({ lat: 46, lng: 6 });

    useLiveStore.getState().setCurrentKm(7.5);
    expect(useLiveStore.getState().currentKmOnRoute).toBe(7.5);
  });

  it('setters parité web (speed/target/radius/departure/stageLayer/gpsTracking)', () => {
    const a = useLiveStore.getState();
    a.setSpeedKmh(22);
    a.setTargetAheadKm(40);
    a.setSearchRadius(8);
    a.setWeatherDepartureTime('2026-06-27T07:30:00.000Z');
    a.setStageLayerActive(true);
    a.setGpsTrackingActive(false);
    const s = useLiveStore.getState();
    expect(s.speedKmh).toBe(22);
    expect(s.targetAheadKm).toBe(40);
    expect(s.searchRadiusKm).toBe(8);
    expect(s.weatherDepartureTime).toBe('2026-06-27T07:30:00.000Z');
    expect(s.stageLayerActive).toBe(true);
    expect(s.gpsTrackingActive).toBe(false);
  });
});
