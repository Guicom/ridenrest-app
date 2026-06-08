// Barrel i18n (MOB-1.4). Importer depuis `@/lib/i18n` câble l'init i18next
// (effet de bord du module config) et expose les helpers react-i18next.
export {
  default as i18n,
  resources,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  getDeviceLanguage,
} from './i18n.config';
export { I18nextProvider, Trans, useTranslation } from 'react-i18next';
