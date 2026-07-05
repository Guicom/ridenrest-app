// Mock natif `expo-device` (MOB-6.2). `isDevice` distingue un vrai device d'un
// simulateur/émulateur (pas de credentials push sur simu). Exposé en **getter/setter** :
// l'interop wildcard de Babel copie les descripteurs accesseurs (get/set) tels quels — donc
// la lecture reste LIVE. Une simple propriété-valeur serait figée (snapshot à l'import) et le
// test ne pourrait pas la surcharger. Les tests font `Device.isDevice = false`. CommonJS.
let _isDevice = true;
module.exports = {
  get isDevice() {
    return _isDevice;
  },
  set isDevice(value) {
    _isDevice = value;
  },
};
