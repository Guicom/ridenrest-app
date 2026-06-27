import { test, expect } from '@playwright/test'
import { ADVENTURE_ID } from './env'

// MOB-4.8 — météo web. Vérifie de façon DÉTERMINISTE que la dimension « Vent » charge
// la flèche en **icône** (`icon-image` → requête réseau /images/wind-arrow.png), et NON
// un glyphe texte `→` (qui ne rend rien sur MapLibre Native ; bascule unifiée web/mobile).
test.describe('MOB-4.8 météo web — flèches de vent (icon-image)', () => {
  test.skip(!ADVENTURE_ID, 'E2E_ADVENTURE_ID non défini — voir apps/web/e2e/seed.sh')

  test('activer la météo + dimension Vent charge l’asset flèche', async ({ page }) => {
    await page.goto(`/map/${ADVENTURE_ID}`)

    // Fermer la modale « Nouveautés » (1re visite du user de test) — elle rend le
    // fond inert/aria-hidden, masquant le reste de la page à l'arbre d'accessibilité.
    await page
      .getByRole('button', { name: 'Compris' })
      .click({ timeout: 6000 })
      .catch(() => undefined)
    // Bandeau consentement analytics (peut recouvrir des contrôles).
    await page
      .getByRole('button', { name: /Accepter|Refuser/ })
      .first()
      .click({ timeout: 4000 })
      .catch(() => undefined)

    // Carte prête = canvas MapLibre monté (role="application" n'est pas exposé de façon
    // fiable dans l'arbre a11y une fois MapLibre initialisé).
    await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible({ timeout: 25000 })

    // Arme l'écoute juste avant d'activer la météo : le chargement de l'icône prouve le fix.
    const arrowRequest = page.waitForRequest(/\/images\/wind-arrow\.png/, { timeout: 40000 })

    // Déplier la section Météo, activer l'overlay, choisir la dimension Vent.
    // L'app rend DEUX sidebars (desktop `planning-sidebar` + `mobile-sidebar`) → scoper
    // au desktop pour éviter la violation strict-mode (testids dupliqués).
    const sidebar = page.getByTestId('planning-sidebar')
    const weatherHeader = sidebar.getByTestId('weather-section-header')
    await weatherHeader.scrollIntoViewIfNeeded()
    await weatherHeader.click()
    await sidebar.getByTestId('weather-toggle').click()
    await sidebar.getByTestId('weather-dim-wind').click()

    await arrowRequest // ✅ /images/wind-arrow.png demandé → couche flèches en icon-image
    await page.screenshot({ path: 'e2e/screenshots/weather-wind-web.png' })
  })
})
