// webpack.config.js — required for module:nodenext + NestJS webpack bundler
// 1. extensionAlias: nodenext forces .js in imports; webpack maps .js → .ts
// 2. nodeExternals: standard NestJS approach — node_modules are available on VPS
//    (PM2 + node natif depuis epic 14, pas de Docker pour l'app).
//    Pino v10 charge lib/worker.js comme worker thread séparé via chemin dynamique
//    (__dirname) — ne peut pas être bundlé par webpack.
//    additionalModuleDirs : depuis .npmrc `node-linker=hoisted` (MOB-1.1, requis
//    par Metro/RN), les deps sont aplaties dans le node_modules racine du monorepo.
//    Sans ce scan, webpack-node-externals ne voit plus pino et le bundle → le
//    worker thread de pino plante (dist/lib/worker.js introuvable).
const path = require('path')
const nodeExternals = require('webpack-node-externals')

const rootNodeModules = path.resolve(__dirname, '../../node_modules')

module.exports = (options) => ({
  ...options,
  externals: [
    nodeExternals({
      allowlist: [/@ridenrest\//],
      additionalModuleDirs: [rootNodeModules],
    }),
  ],
  resolve: {
    ...options.resolve,
    extensionAlias: {
      '.js': ['.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
    },
  },
})
