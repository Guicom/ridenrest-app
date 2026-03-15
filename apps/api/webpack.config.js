// webpack.config.js — required for module:nodenext + NestJS webpack bundler
// 1. extensionAlias: nodenext forces .js in imports; webpack maps .js → .ts
// 2. externals: workspace packages (@ridenrest/*) are symlinked .ts files —
//    must be bundled (not treated as externals) so ts-loader can process them
const nodeExternals = require('webpack-node-externals')

module.exports = (options) => ({
  ...options,
  externals: [
    nodeExternals({
      allowlist: [/^@ridenrest\//],
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
