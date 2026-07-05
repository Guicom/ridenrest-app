import { chromium, type FullConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { BASE_URL, EMAIL, PASSWORD } from './env'

// Authentifie le user de test via l'API Better Auth (email/mot de passe — Google OAuth
// n'est pas scriptable) et sauvegarde la session (cookies) en storageState réutilisé
// par toutes les specs. Sidestep complet de l'OAuth.
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const browser = await chromium.launch()
  const ctx = await browser.newContext()

  // Signup idempotent (ignore si le compte existe déjà), puis sign-in → cookie de session.
  await ctx.request
    .post(`${BASE_URL}/api/auth/sign-up/email`, {
      data: { email: EMAIL, password: PASSWORD, name: 'E2E Bot' },
    })
    .catch(() => undefined)

  const res = await ctx.request.post(`${BASE_URL}/api/auth/sign-in/email`, {
    data: { email: EMAIL, password: PASSWORD },
  })
  if (!res.ok()) {
    throw new Error(`Login E2E échoué (${res.status()}): ${await res.text()}`)
  }

  // Visite l'app une fois pour fermer les modales « une fois » (Nouveautés + consentement
  // analytics) — leurs flags localStorage sont alors capturés dans storageState, donc les
  // specs démarrent sans overlay (sinon le fond passe inert/aria-hidden → carte masquée).
  const page = await ctx.newPage()
  await page.goto(`${BASE_URL}/adventures`, { waitUntil: 'networkidle' }).catch(() => undefined)
  await page.getByRole('button', { name: 'Compris' }).click({ timeout: 15000 }).catch(() => undefined)
  await page
    .getByRole('button', { name: /Accepter|Refuser/ })
    .first()
    .click({ timeout: 8000 })
    .catch(() => undefined)
  await page.waitForTimeout(500)

  const authDir = path.resolve(__dirname, '.auth')
  fs.mkdirSync(authDir, { recursive: true })
  await ctx.storageState({ path: path.join(authDir, 'state.json') })
  await browser.close()
}
