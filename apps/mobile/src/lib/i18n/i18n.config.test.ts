import i18n, { FALLBACK_LOCALE, getDeviceLanguage } from './i18n.config';

describe('i18n config (MOB-1.4 / AC1)', () => {
  it('initialise i18next avec fr comme fallback', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(FALLBACK_LOCALE).toBe('fr');
  });

  it('résout une chaîne UI via t() — preuve de câblage', () => {
    // Clés VIVANTES (MOB-6.3 / T3) — les anciennes clés de démo `home`/`explore`/
    // `oauthCallback` ont été retirées avec l'écran de scaffold MOB-1.1.
    expect(i18n.t('common.cancel')).toBe('Annuler');
    expect(i18n.t('auth.login.title')).toBe('Connexion');
  });

  it('retombe en fr pour une locale non supportée', () => {
    expect(i18n.t('common.retry', { lng: 'de' })).toBe('Réessayer');
  });

  it('détecte la langue du device via expo-localization (mock = fr)', () => {
    expect(getDeviceLanguage()).toBe('fr');
  });
});
