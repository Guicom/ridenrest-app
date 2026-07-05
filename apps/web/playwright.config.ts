import { defineConfig, devices } from '@playwright/test'
import './e2e/env'
import { BASE_URL } from './e2e/env'

// E2E web (MOB-4.x). Login programmatique une fois (global-setup → storageState),
// puis specs réutilisant la session. Le serveur web doit déjà tourner sur BASE_URL
// (pnpm dev) — pas de webServer auto pour ne pas entrer en conflit avec l'instance dev.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    storageState: 'e2e/.auth/state.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // MapLibre GL JS exige WebGL : en headless Chromium, l'activer via SwiftShader
    // (rendu logiciel) sinon la carte reste blanche et aucune couche n'est ajoutée.
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
