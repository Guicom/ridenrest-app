# Validation device (Maestro) — apps/mobile

Suite de validation **sur simulateur iOS** lancée en fin de dev-story pour les stories
mobiles (carte, overlays, navigation, persistance, non-régression de crash natif).

## Lancer

```bash
cd apps/mobile
pnpm test:device                              # smoke (démarre + ouvre le planning, pas de crash)
pnpm test:device weather.yaml                  # un flow de feature
pnpm test:device smoke.yaml weather.yaml       # plusieurs
BUILD=1 pnpm test:device weather.yaml          # rebuild standalone (pnpm sim) avant
```

Screenshots → `.maestro/screenshots/` (gitignorés). Le runner = `scripts/device-test.sh`
(fixe `JAVA_HOME` + PATH Maestro, vérifie simu booté + backend).

## Pré-requis (une fois)

1. Simulateur iOS booté, app installée via `pnpm sim`.
2. **Se connecter une fois à la main** (Google OAuth non scriptable) — la session
   persiste en `expo-secure-store`, donc tous les runs suivants sont autonomes.
3. Backend local up (`docker compose up -d` + API :3010).

## Écrire un flow

- Réutiliser `common/open-planning.yaml` via `runFlow:` (lance l'app + ouvre le planning).
- Asserts déterministes : présence de texte/éléments, `assertVisible/NotVisible`, persistance.
- **Le contenu du canvas MapLibre (GL natif) n'est PAS introspectable** → `takeScreenshot`
  + revue visuelle par l'agent pour les ACs de rendu (ligne météo, flèches, densité…).
- Sélecteurs : préférer un `testID` (accessibilityIdentifier) sur les éléments clés. Les
  labels dupliqués piègent (ex. « Fermer le panneau » porté aussi par un backdrop plein
  écran → on tape le chevron par coordonnée `point: 89%,50%`, à fiabiliser via testID).

## Android (émulateur)

Les flows iOS (texte/label) ne marchent pas tels quels sur Android — voir les
spécificités ci-dessous. Flows Android dédiés : `.maestro/android/`.

**Mise en route (une fois)** — toolchain dans `../AGENTS.md` §Android :
1. `npx expo run:android` (build debug + Metro). Émulateur : `emulator @ridenrest_pixel`.
2. Build = **dev-client** → au lancement il affiche le **dev-launcher Expo** (liste des
   serveurs Metro) : taper le serveur pour charger l'app (pas automatisable proprement →
   étape manuelle, ou build `--variant release` pour s'en affranchir, cf. AGENTS.md).
3. **Ponts de ports** (localhost émulateur ≠ hôte) : `adb reverse tcp:8081 tcp:8081`
   (Metro) **+ `tcp:3010` + `tcp:3011`** (API + auth) — sinon « Connexion impossible ».
4. **Locale** : par défaut en-US → l'app est en anglais. Pour matcher les flows FR :
   `adb root && adb shell setprop persist.sys.locale fr-FR && adb reboot`.
5. Login : email/mot de passe (user e2e) — **scriptable** (formulaire, pas OAuth).

**Cibler le bon device** : iOS sim + émulateur Android tous deux up → Maestro est ambigu.
Toujours `maestro --device emulator-5554 test …` pour Android.

**Gotcha bounds-zéro (CRITIQUE)** : sur Android (RN nouvelle archi/Fabric), un `Pressable`
en **position absolue + transform** (le chevron du drawer `drawer-toggle`) expose des
bounds **`[0,0][0,0]`** dans l'arbre a11y → Maestro le filtre (« not found » par id ET
label, alors que `uiautomator dump` le voit en `content-desc`). ⇒ le taper par
**coordonnée** (`point: "3%,50%"` ouvrir / `"89%,50%"` fermer). Les contrôles en layout
normal (Météo, Vent, Afficher sur la carte) sont ciblables par label sans souci.
`testID` **ne** surface **pas** en `resource-id` sur cette archi → cibler par **label**,
pas par id, côté Android. (Diagnostiqué via `adb shell uiautomator dump`.)

## Limites assumées

- Login OAuth : manuel une fois.
- Visuel carte : jugé sur screenshots (pas d'assert pixel — tuiles instables).
- Données spécifiques à un AC (ex. départ d'étape) : seed DB minimal puis revert
  (`postgresql://ridenrest:ridenrest@localhost:5432/ridenrest`).
- Côté **web**, préférer le E2E Playwright (`apps/web`, `pnpm test:e2e`) qui introspecte
  la carte de façon déterministe (`map.getLayer(...)`).
