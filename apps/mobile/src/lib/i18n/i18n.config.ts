import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';

// Scaffold i18n (MOB-1.4 / AC1 — FR-MOB-021). Structure prête pour la
// localisation ; l'externalisation de **toutes** les chaînes est en MOB-6.3.
//
// Locale par défaut + fallback = **fr** (jamais `en`) : si la langue du device
// n'est pas supportée, l'app retombe en français.
export const FALLBACK_LOCALE = 'fr';
export const SUPPORTED_LOCALES = ['fr', 'en'] as const;

export const resources = {
  fr: { translation: fr },
  en: { translation: en },
} as const;

// Langue du device (ex. « fr », « en ») via expo-localization. `?? fr` couvre
// le cas où aucune locale n'est résolue (fallback français).
export function getDeviceLanguage(): string {
  return getLocales()[0]?.languageCode ?? FALLBACK_LOCALE;
}

if (!i18next.isInitialized) {
  // eslint-disable-next-line import/no-named-as-default-member
  void i18next.use(initReactI18next).init({
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18next;
