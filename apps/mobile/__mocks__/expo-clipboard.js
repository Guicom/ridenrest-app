// Mock `expo-clipboard` (MOB-4.2 copie d'adresse). Module natif (presse-papiers) absent
// hors device → on stube l'API JS utilisée. `setStringAsync` résout `true` (parité).
module.exports = {
  __esModule: true,
  setStringAsync: jest.fn().mockResolvedValue(true),
  getStringAsync: jest.fn().mockResolvedValue(''),
};
