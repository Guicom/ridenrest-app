// Mock manuel expo-localization (MOB-1.4). Auto-appliqué par Jest pour tous les
// tests (mock de node_module adjacent à node_modules). Device = français par
// défaut → l'init i18next part sur `fr` de façon déterministe en test.
module.exports = {
  getLocales: () => [
    {
      languageCode: 'fr',
      languageTag: 'fr-FR',
      regionCode: 'FR',
      currencyCode: 'EUR',
      currencySymbol: '€',
      decimalSeparator: ',',
      digitGroupingSeparator: ' ',
      textDirection: 'ltr',
      measurementSystem: 'metric',
      temperatureUnit: 'celsius',
    },
  ],
  getCalendars: () => [
    { calendar: 'gregory', timeZone: 'Europe/Paris', uses24hourClock: true, firstWeekday: 1 },
  ],
};
