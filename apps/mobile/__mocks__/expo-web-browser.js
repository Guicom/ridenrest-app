// Mock natif expo-web-browser (MOB-2.1) — auto-appliqué par Jest. Le retour OAuth
// deep-link (`openAuthSessionAsync`) est réellement exercé en MOB-2.3/2.4 ; ici on
// fournit des stubs neutres pour que tout import du client Better Auth ne casse pas
// en environnement de test.
module.exports = {
  openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
  dismissBrowser: jest.fn(),
  maybeCompleteAuthSession: jest.fn(() => ({ type: 'failed' })),
  WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss', OPENED: 'opened' },
};
