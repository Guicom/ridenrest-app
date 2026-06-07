// Babel — NativeWind v4 (cf. MOB-1.3).
// - `babel-preset-expo` (jsxImportSource: 'nativewind') : transforme le JSX RN
//   pour que `className` soit pris en charge par NativeWind. Le React Compiler
//   (app.json → experiments.reactCompiler) reste géré par ce preset.
// - `nativewind/babel` : compile les classes Tailwind en styles RN.
// Alias `@/*` : résolu nativement par Metro via tsconfig (SDK 56) — pas de
// module-resolver babel nécessaire (cf. MOB-1.1).
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  }
}
