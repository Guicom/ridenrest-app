// webpack.config.js — required for module:nodenext + NestJS webpack bundler
// 1. extensionAlias: nodenext forces .js in imports; webpack maps .js → .ts
// 2. nodeExternals: standard NestJS approach — node_modules are available on VPS
//    (PM2 + node natif depuis epic 14, pas de Docker pour l'app).
//    Pino v10 charge lib/worker.js comme worker thread séparé via chemin dynamique
//    (__dirname) — ne peut pas être bundlé par webpack.
const nodeExternals = require('webpack-node-externals')

module.exports = (options) => ({
  ...options,
  externals: [nodeExternals({ allowlist: [/@ridenrest\//] })],
  resolve: {
    ...options.resolve,
    extensionAlias: {
      '.js': ['.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
    },
  },
})
