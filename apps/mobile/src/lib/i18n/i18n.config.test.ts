import i18n, { FALLBACK_LOCALE, getDeviceLanguage } from './i18n.config';

describe('i18n config (MOB-1.4 / AC1)', () => {
  it('initialise i18next avec fr comme fallback', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(FALLBACK_LOCALE).toBe('fr');
  });

  it('résout une chaîne UI via t() — preuve de câblage', () => {
    expect(i18n.t('explore.back')).toBe('Retour');
    expect(i18n.t('home.subtitle')).toContain('MOB-1.4');
  });

  it('retombe en fr pour une locale non supportée', () => {
    expect(i18n.t('oauthCallback.title', { lng: 'de' })).toBe('Callback OAuth');
  });

  it('détecte la langue du device via expo-localization (mock = fr)', () => {
    expect(getDeviceLanguage()).toBe('fr');
  });
});
