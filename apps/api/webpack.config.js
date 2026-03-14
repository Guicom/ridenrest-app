// webpack.config.js — NestJS webpack build config for Docker deployment
// Two issues to fix vs NestJS defaults:
//
// 1. extensionAlias: apps/api uses moduleResolution: "nodenext" which requires .js
//    extensions in imports. Webpack must know .js resolves to .ts source files.
//
// 2. externals: NestJS webpack config externalizes all node_modules by default
//    (expects them at runtime). For our Docker runner stage (no node_modules),
//    we must bundle everything into dist/main.js.
module.exports = (options) => ({
  ...options,
  externals: [], // Bundle all node_modules — required for minimal Docker runner
  resolve: {
    ...options.resolve,
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
})
