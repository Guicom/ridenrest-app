// Setup Jest global (MOB-1.4). RNTL v14 enregistre ses matchers automatiquement.
// On garde ce fichier comme point d'extension (mocks globaux futurs : reanimated,
// async-storage…) au fur et à mesure des epics MOB-2+.

// NativeWind en environnement Node (jsdom-less) : pas d'injection de styles, mais
// le rendu RN reste valide pour les assertions de contenu/rôle.
