import fs from 'node:fs'
import path from 'node:path'

// Charge apps/web/.env.test (non commité) sans dépendance externe. Les vars déjà
// présentes dans l'environnement priment (utile en CI).
function loadEnvTest(): void {
  const p = path.resolve(__dirname, '../.env.test')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}
loadEnvTest()

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3011'
export const EMAIL = process.env.E2E_EMAIL ?? 'e2e@ridenrest.local'
export const PASSWORD = process.env.E2E_PASSWORD ?? 'Test1234!'
export const ADVENTURE_ID = process.env.E2E_ADVENTURE_ID ?? ''
