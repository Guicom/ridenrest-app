// webpack.config.js — NestJS webpack build with nodenext module resolution support
// Required because: apps/api uses moduleResolution: "nodenext" which requires .js extensions in imports
// Webpack needs to know that .js imports should resolve to .ts source files during build
module.exports = (options) => ({
  ...options,
  resolve: {
    ...options.resolve,
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
})
