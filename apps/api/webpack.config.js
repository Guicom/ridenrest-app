// webpack.config.js — required for module:nodenext + NestJS webpack bundler
// 1. extensionAlias: nodenext forces .js in imports; webpack maps .js → .ts
// 2. externals: none — bundle everything into dist/main.js for minimal Docker runner
//    (no node_modules needed in production image)
module.exports = (options) => ({
  ...options,
  externals: [],
  resolve: {
    ...options.resolve,
    extensionAlias: {
      '.js': ['.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
    },
  },
})
