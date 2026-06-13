// Mock natif expo-file-system (MOB-3.2). Le mobile n'utilise que la classe `File`
// (API SDK 54+) comme **fallback de taille** quand le picker ne fournit pas `size`.
// Stub minimal : `size` contrôlable par test via `File.__size` (octets ou null).
// Factory SANS JSX RN (contrainte transform NativeWind / jest).
class File {
  constructor(uri) {
    this.uri = uri;
  }
  get size() {
    return File.__size;
  }
}
File.__size = null;

module.exports = { File };
