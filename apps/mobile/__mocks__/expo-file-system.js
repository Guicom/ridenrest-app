// Mock natif `expo-file-system` (SDK 56 — **nouvelle API** `File`/`Directory`/`Paths`).
// Factory SANS JSX RN (contrainte transform NativeWind / jest — cf. AGENTS.md).
//
// Deux usages couverts :
//   1. MOB-3.2 : `new File(uri).size` comme fallback de taille à l'upload GPX.
//      → `File.__size` (octets ou null) reste pilotable par test. RÉTRO-COMPAT.
//   2. MOB-3.5 : cache offline (gpx/pois/weather). FS **en mémoire** : une map
//      `uri -> contenu`. `Directory.create`/`File.write`/`File.text()`/`exists`/
//      `delete()` opèrent sur cette map.
//
// Helpers de test exposés :
//   - `__resetFs()`   : vide le FS en mémoire (à appeler en `beforeEach`)
//   - `__files`       : map brute (uri -> string) pour inspection directe
//   - `File.__size`   : taille renvoyée par `file.size` (MOB-3.2)

// FS en mémoire : fichiers (uri -> contenu string) + répertoires (set d'uris).
const files = new Map();
const dirs = new Set();

function normalize(uri) {
  // Concatène les segments comme le ferait l'API native (joint sur '/').
  // On retire les doubles slashes hors schéma `file://`.
  return String(uri).replace(/([^:])\/{2,}/g, '$1/');
}

function joinUris(parts) {
  return normalize(
    parts
      .map((p) => (p && typeof p === 'object' && 'uri' in p ? p.uri : p))
      .filter((p) => p != null && p !== '')
      .join('/'),
  );
}

class Paths {
  static get cache() {
    return new Directory('file:///mock-cache');
  }
  static get document() {
    return new Directory('file:///mock-document');
  }
}

class Directory {
  constructor(...uris) {
    this.uri = joinUris(uris);
  }
  get exists() {
    return dirs.has(this.uri);
  }
  create(_options) {
    dirs.add(this.uri);
  }
  delete() {
    dirs.delete(this.uri);
    const prefix = this.uri + '/';
    for (const key of [...files.keys()]) {
      if (key.startsWith(prefix)) files.delete(key);
    }
  }
}

class File {
  constructor(...uris) {
    this.uri = joinUris(uris);
  }
  get size() {
    return File.__size;
  }
  get exists() {
    return files.has(this.uri);
  }
  create(_options) {
    if (!files.has(this.uri)) files.set(this.uri, '');
  }
  write(content) {
    files.set(this.uri, String(content));
  }
  async text() {
    if (!files.has(this.uri)) {
      throw new Error(`Mock FS: file does not exist: ${this.uri}`);
    }
    return files.get(this.uri);
  }
  delete() {
    files.delete(this.uri);
  }
}
File.__size = null;

function __resetFs() {
  files.clear();
  dirs.clear();
  File.__size = null;
}

module.exports = {
  Paths,
  Directory,
  File,
  __resetFs,
  __files: files,
  __dirs: dirs,
};
