---
baseline_commit: f0349415d9fe5b1fb173cf42d84072799e96cdf7
---

# Story MOB-6.3 : Finition de l'internationalisation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **une app entièrement localisée (français au lancement)**,
So that **l'expérience est cohérente et prête pour de futures langues**.

> **3ᵉ story de l'epic MOB-6**. ⚠️ **Story de FINITION + VERROUILLAGE, PAS d'externalisation massive.** Le scaffold i18n de MOB-1.4 a été **largement dépassé au fil des epics MOB-2→5** : `i18next` + `react-i18next` + `expo-localization` opérationnels, **365 clés FR et 365 clés EN** (arbres miroir), **52/83 fichiers source** consomment `useTranslation`, les 31 restants n'affichent **aucun texte utilisateur** (calques carte GeoJSON, primitives UI, layouts). L'audit exhaustif **ne remonte aucune chaîne UI française en dur** dans les écrans. Cette story **ferme les derniers trous ciblés** et **pose une garde anti-régression** (parité de clés FR↔EN).
>
> 🟢 **Aucun module natif ajouté** → pas de prebuild requis (contrairement à 6.1/6.2). Cycle de test standard (`jest`, `tsc`, `eslint`) + `pnpm sim` optionnel.
>
> 🔑 **Convention de clés établie (à suivre)** : namespace unique `translation`, **dot-notation** `domaine.sousSection.clé`, suffixe `A11y` pour les labels lecteur d'écran, sous-clés `errors.*` par domaine. Interpolation `{{var}}` (jamais de concat). Formatage : `const locale = i18n.language` passé aux helpers `lib/format/*` (`Intl.NumberFormat`/`Intl.DateTimeFormat`, dispos sous Hermes). **Toute clé ajoutée doit exister dans les 2 locales.**

## Acceptance Criteria

1. **Given** le scaffold i18n (MOB-1.4) déjà largement étendu
   **When** je finalise la localisation
   **Then** toutes les chaînes d'UI visibles sont externalisées via i18next (FR-MOB-021)
   **And** les derniers restes identifiés sont corrigés : (a) le placeholder de date **`"AAAA-MM-JJ HH:MM"` hardcodé** (3 fichiers) est externalisé (variante EN `"YYYY-MM-DD HH:MM"`) ; (b) `components/poi-access/format.ts` est **localisé** (plus de `.replace('.', ',')` figé — `Intl.NumberFormat` + `locale`)
   **And** aucune chaîne en dur ne subsiste dans les écrans principaux (adventures, map, live, auth, settings, pois)

2. **Given** la locale de l'appareil
   **When** l'app démarre
   **Then** le français est servi par défaut (`getDeviceLanguage()` + `fallbackLng: 'fr'` + `supportedLngs`) et l'architecture permet l'ajout d'une langue **sans refonte** (ajout d'un `locales/xx.json` + entrée `resources`/`SUPPORTED_LOCALES`)
   **And** un **test de parité de clés FR↔EN** verrouille l'invariant « chaque clé existe dans les deux locales » (garde anti-régression)

3. **Given** les clés mortes de scaffold (`home.*`, `explore.*`, `oauthCallback.*` — écrans de démo supprimés, zéro usage)
   **When** je nettoie les locales
   **Then** ces clés sont retirées de `fr.json` **et** `en.json`
   **And** les assertions de `i18n.config.test.ts` **couplées à ces clés mortes** sont réécrites sur des clés vivantes (sinon test rouge)

## Tasks / Subtasks

- [x] **T1 — Externaliser le placeholder de date hardcodé** (AC: 1)
  - [x] Ajouter une clé (`common.dateTimePlaceholder` — voir Completion Notes pour le choix de nommage) dans `fr.json` (`"AAAA-MM-JJ HH:MM"`) **et** `en.json` (`"YYYY-MM-DD HH:MM"`).
  - [x] Remplacer les 3 littéraux : `components/map/stage-dialog.tsx:154`, `components/map/sidebar-weather-section.tsx:138`, `components/live/live-filters-drawer.tsx:427` par `t('common.dateTimePlaceholder')`.

- [x] **T2 — Localiser `components/poi-access/format.ts`** (AC: 1)
  - [x] `formatAccessDistance` (`format.ts:13`) : retirer `km.toFixed(1).replace('.', ',')` (virgule FR figée) → accepter un `locale` + `Intl.NumberFormat` (modèle `lib/format/distance.ts`).
  - [x] Ajouter `locale` param à `formatAccessDistance` / `formatAccessElevation` / `formatAccessEta`, et le passer aux call-sites : `access-fallback.tsx:20`, `access-metrics.tsx:90/95/101`, `variant-selector.tsx:83/84/112/118` (via `const locale = i18n.language`).
  - [x] Vérifier le rendu EN (`1.4 km`, pas `1,4 km`) — cas EN ajoutés à `format.test.ts`.

- [x] **T3 — Nettoyer les clés mortes de scaffold + réécrire le test couplé** (AC: 3)
  - [x] Retirer les sections `home` (`subtitle`, `navigateExplore`), `explore` (`title`, `routerOk`, `back`), `oauthCallback` (`title`, `subtitle`) de `fr.json` **et** `en.json` (zéro usage confirmé — écran de démo supprimé, cf. `app/index.tsx:5`).
  - [x] Réécrire les assertions de `i18n.config.test.ts:10-15` sur des clés **vivantes** (`common.cancel`, `auth.login.title`, `common.retry` pour le fallback). Test vert.

- [x] **T4 — Test de parité de clés FR↔EN (verrou AC2)** (AC: 2)
  - [x] Ajouter `src/lib/i18n/locale-parity.test.ts` (hors `src/app/`) : aplatit les deux arbres de clés et asserte `keys(fr) === keys(en)` (aucune clé orpheline dans un seul fichier). Garde anti-régression pour tous les ajouts futurs.

- [x] **T5 — Audit final de non-régression** (AC: 1, 2)
  - [x] Re-grep les écrans principaux (`src/app/**`, `src/components/**`) : JSX accentué (0 hit), props `label/title/placeholder/accessibilityLabel/message`, `Alert.alert` (tous `t()`), mots FR fréquents. Confirmé 0 chaîne UI FR en dur. Hit résiduel non-FR traité : `dialog.tsx` `accessibilityLabel="close"` → localisé (`common.close`). `session-loading` laissé (slug de test, interrogé par 2 tests).
  - [x] (Décision) Unités non localisées (`h`, `min`, `km`, `D+` dans `formatEta`/`formatEtaSummary`) → **gardées** (parité web, locale-invariant). Documenté ci-dessous.
  - [x] Vérifié : tous les call-sites de `formatKm`/`formatInt`/`formatDistanceM`/`formatStageDeparture` passent déjà `i18n.language` (aucun ne s'appuie sur le défaut `'fr'`). Risque résiduel nul.

- [x] **T6 — Doc Sync + gate** (règle CRITIQUE project-context)
  - [x] Completion Notes mises à jour : réalité (externalisation déjà quasi-complète) vs AC. **Pas de changement d'AC dans `epics-mobile.md`** (AC satisfaits).
  - [x] `sprint-status.yaml` : MOB-6-3 → `in-progress` puis `review`.
  - [x] **Gate verte** : `check:native-config` 5 invariants OK · `jest` 624/624 (dont parité + cas EN) · `tsc` 0 · `eslint` 0 err (2 warnings préexistants) · `expo export -p ios` OK. Pas de natif → pas de prebuild.

## Dev Notes

### Architecture & contraintes (à respecter à la lettre)

- **Setup existant (ne pas réécrire)** : `src/lib/i18n/i18n.config.ts` init i18next au 1er import (effet de bord), `FALLBACK_LOCALE='fr'`, `SUPPORTED_LOCALES=['fr','en']`, détection device `getDeviceLanguage()` (`expo-localization` → `getLocales()[0]?.languageCode ?? 'fr'`), `defaultNS:'translation'`, `interpolation.escapeValue:false`, `returnNull:false`, garde `if (!i18next.isInitialized)`. Barrel `src/lib/i18n/index.ts` ré-exporte `i18n`, `resources`, helpers, `I18nextProvider`, `Trans`, `useTranslation`. Montage : `src/app/_layout.tsx:32/76` (`<I18nextProvider i18n={i18n}>`).
- **Locales** : `src/lib/i18n/locales/fr.json` + `en.json`, **structure miroir, 365 clés chacune**. Namespace unique `translation`, sections top-level = domaines (`auth`, `common`, `adventures`, `live`, `map`, `pois`, `settings`, `strava`, `offline`…). Interpolation `{{var}}`. **Pas de pluriel i18next** (`({{count}})` littéral — conserver le pattern existant).
- **Formatage localisé** : modèles de référence `lib/format/distance.ts` (`formatKm`/`formatInt`/`formatDistanceM`) + `lib/format/stage.ts` (`formatStageDeparture`) — acceptent `locale`, alimentés par `i18n.language` aux call-sites. **poi-access/format.ts est le seul offender** qui hardcode la virgule FR et n'accepte pas `locale`.
- **AC2 déjà satisfait au niveau archi** — ajouter une langue = fichier locale + entrées registre, aucune refonte. Le test de parité (T4) formalise l'invariant existant.
- **Aucun module natif** → pas de `expo prebuild`. Tests uniquement + `pnpm sim` facultatif.

### Source tree — fichiers à toucher

| Action | Fichier | Note |
|---|---|---|
| UPDATE | `src/lib/i18n/locales/fr.json` + `en.json` | + `common.dateTimePlaceholder`, `common.closeA11y` ; − clés mortes `home`/`explore`/`oauthCallback` |
| UPDATE | `src/components/map/stage-dialog.tsx` (~l.154) | placeholder → `t(...)` |
| UPDATE | `src/components/map/sidebar-weather-section.tsx` (~l.138) | placeholder → `t(...)` |
| UPDATE | `src/components/live/live-filters-drawer.tsx` (~l.427) | placeholder → `t(...)` |
| UPDATE | `src/components/poi-access/format.ts` | `locale` param + `Intl.NumberFormat` |
| UPDATE | `src/components/poi-access/{access-fallback,access-metrics,variant-selector}.tsx` | passer `locale` |
| UPDATE | `src/lib/i18n/i18n.config.test.ts` (l.10-15) | réécrire assertions sur clés vivantes |
| NEW | `src/lib/i18n/locale-parity.test.ts` | garde parité FR↔EN |

### Testing

- **Runner** : Jest + jest-expo. Mock `expo-localization` renvoie `fr` (utilisé par `i18n.config.test.ts`).
- **Placement** : tests i18n en `src/lib/i18n/*.test.ts` (jamais sous `src/app/` — `require.context` d'expo-router casse `expo export`).
- **Piège couplage** : `i18n.config.test.ts:10-15` asserte des clés mortes (`explore.back`, `home.subtitle` avec `'MOB-1.4'`, `oauthCallback.title`) → **les supprimer sans réécrire le test le rend rouge** (T3).

### Project Structure Notes

- Chaque clé ajoutée/retirée doit l'être dans **fr.json ET en.json** (invariant vérifié par le test de parité).
- Ne pas hardcoder d'unité/séparateur dans les composants — passer par `Intl.*` + `i18n.language`.
- `home`/`explore`/`oauthCallback` = reliquats de l'écran de démo MOB-1.1 supprimé (`app/index.tsx:5`) — sûrs à retirer (grep = 0 usage code).

### Décisions à trancher pendant l'impl (documenter dans Completion Notes)

- Unités `h`/`min`/`km`/`D+` non localisées (`formatEta`, `formatEtaSummary` `live-controls.tsx:43`) : garder tel quel (parité web) ou localiser ? Recommandation : garder + documenter.
- Nommage exact de la clé placeholder date (`map.stages.departurePlaceholder` ou autre section) — cohérence avec l'arbre existant.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story-MOB-6.3] (l.1096-1111) — ACs, FR-MOB-021
- [Source: apps/mobile/src/lib/i18n/{i18n.config.ts,index.ts,i18n.config.test.ts}] — setup i18n, garde init, test couplé
- [Source: apps/mobile/src/lib/i18n/locales/{fr,en}.json] — 365 clés miroir, namespace `translation`
- [Source: apps/mobile/src/app/_layout.tsx:32/76] — montage `I18nextProvider`
- [Source: apps/mobile/src/components/map/stage-dialog.tsx:154 + sidebar-weather-section.tsx:138 + live/live-filters-drawer.tsx:427] — placeholders date hardcodés
- [Source: apps/mobile/src/components/poi-access/format.ts:13] — virgule FR figée (offender formatage)
- [Source: apps/mobile/src/lib/format/{distance,stage}.ts] — modèles de formatage localisé (`Intl` + `locale`)
- [Source: _bmad-output/implementation-artifacts/MOB-1-4-*.md] — scaffold i18n initial
- [Source: _bmad-output/project-context.md#Mobile] — conventions i18n, styling NativeWind, placement tests

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (dev-story, 2026-07-05)

### Debug Log References

- `check:native-config` → 5 invariants OK (aucun natif ajouté par cette story).
- `jest` (full mobile) → 94 suites / **624 tests** verts. Warning « worker process failed to exit gracefully » = teardown jest-expo préexistant (timers), sans rapport.
- `tsc --noEmit` → 0.
- `expo lint` → 0 erreur, 2 warnings **préexistants** (`app/(app)/live/[id].tsx:365`, `app/(app)/map/[id].tsx:356` — `react-hooks/exhaustive-deps` de l'auto-zoom délibéré, hors fichiers touchés).
- `expo export -p ios` → **OK** (`Exported: dist`, bundle iOS 10 MB).
- ⚠️ `pnpm build` (= `expo export` **toutes plateformes**) échoue au **rendu statique web** : `[expo-notifications] ... localStorage.getItem is not a function` — préexistant de MOB-6.2 (push), sans rapport avec cette story (bundle iOS OK). Tracé en tâche de fond (`task_e08261c8`).

### Completion Notes List

**Nature de la story — finition confirmée.** L'audit exhaustif confirme le constat de create-story : **aucune chaîne UI française en dur** dans les écrans/composants (grep JSX accentué = 0 hit). Cette story ferme les derniers trous ciblés et pose le verrou de parité. L'AC1 « aucune chaîne en dur ne subsiste » est satisfaite.

**T1 — Choix de nommage de la clé placeholder.** La story suggérait `map.stages.departurePlaceholder` mais laissait explicitement le nommage « à trancher » (Dev Notes). Retenu : **`common.dateTimePlaceholder`**. Justification : le même littéral de format date-heure est utilisé dans **3 domaines distincts** (`map.stages` via stage-dialog, `map.weather` via sidebar-weather-section, `live.weather` via live-filters-drawer) → le placer sous `map.stages` et le consommer depuis `live.weather` serait un couplage de namespace incohérent. `common` est le foyer correct d'une chaîne transverse réutilisable. Les 3 `TextInput` consomment `t('common.dateTimePlaceholder')`.

**T2 — Localisation de `poi-access/format.ts`.** `formatAccessDistance` remplace `toFixed(1).replace('.', ',')` par `Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })` → conserve la **1 décimale fixe** de l'ancien comportement (`1,0 km` en FR) tout en donnant `1.4 km` / `2.0 km` en EN. `formatAccessElevation` passe à `Intl.NumberFormat(locale, { maximumFractionDigits: 0 })` (séparateur de milliers localisé, parité `formatInt`). `formatAccessEta` **reçoit** `locale` pour l'homogénéité de façade mais ne l'utilise pas (sa sortie `~1h05`/`~6 min`/`—` ne contient aucun nombre à séparateur) — `eslint no-unused-vars` a `args: "none"`, donc pas de warning. Call-sites mis à jour (`const locale = i18n.language`) : `access-fallback.tsx`, `access-metrics.tsx` (×3), `variant-selector.tsx` (×4). Cas EN ajoutés à `format.test.ts`. Les tests composants (`access-metrics.test`, `variant-selector.test`) utilisent le i18n **réel** (FR) → assertions `1,5 km`/`40 m D+` inchangées.

**T3 — Clés mortes.** `home` (2), `explore` (3), `oauthCallback` (2) = **7 clés** retirées de `fr.json` ET `en.json` (0 usage code hors le test couplé — écran démo MOB-1.1 supprimé, `app/index.tsx` = simple `Redirect`). `i18n.config.test.ts` réécrit sur clés vivantes (`common.cancel`='Annuler', `auth.login.title`='Connexion', fallback `common.retry`='Réessayer').

**T4 — Verrou de parité.** `src/lib/i18n/locale-parity.test.ts` (hors `src/app/`) aplatit les 2 arbres et asserte l'égalité stricte des ensembles de clés. Toute future clé ajoutée dans une seule locale casse ce test.

**T5 — Audit + décisions.**
- Grep écrans : 0 chaîne FR en dur. Littéraux restants = hors-scope (`*.stories.tsx`, `*.test.tsx`), marques intraduisibles (`Powered by Strava`), marqueur RGPD (`ph-no-capture`), numériques (`"0"`).
- **Gap non-FR fermé** : `ui/dialog.tsx` backdrop `accessibilityLabel="close"` (anglais, annoncé aux lecteurs d'écran, primitive partagée, non couvert par test) → localisé via nouvelle clé `common.close` (FR « Fermer » / EN « Close ») + `useTranslation` câblé dans la primitive.
- `session-loading` (`session-loading.tsx`) **laissé tel quel** : slug d'identification, interrogé par 2 tests (`getByLabelText('session-loading')`), pas de la prose utilisateur.
- **Décision unités** : `h`/`min`/`km`/`D+`/`D-` dans `formatEta` (`lib/format/stage.ts`) et `formatEtaSummary` (`live-controls.tsx`) restent **non localisés** → gardés (parité web, unités locale-invariantes assumées). Correction non requise.
- **Vérif threading locale** : 100% des call-sites de `formatKm`/`formatInt`/`formatDistanceM`/`formatStageDeparture` passent déjà `i18n.language` — aucun ne retombe sur le défaut `'fr'`.

**Parité clés finale** : FR et EN = **360 clés** miroir (365 − 7 mortes + `common.dateTimePlaceholder` + `common.close`).

**Pas de module natif** → aucun prebuild. Story validable au reload standard (`pnpm sim` optionnel). Pas de nouvel écran/overlay Maestro (aucun flow device à créer).

### File List

**Modifiés :**
- `apps/mobile/src/lib/i18n/locales/fr.json` (+ `common.dateTimePlaceholder`, `common.close` ; − `home`/`explore`/`oauthCallback`)
- `apps/mobile/src/lib/i18n/locales/en.json` (idem, miroir)
- `apps/mobile/src/lib/i18n/i18n.config.test.ts` (assertions réécrites sur clés vivantes)
- `apps/mobile/src/components/poi-access/format.ts` (`locale` param + `Intl.NumberFormat`)
- `apps/mobile/src/components/poi-access/format.test.ts` (cas EN distance + élévation)
- `apps/mobile/src/components/poi-access/access-fallback.tsx` (passe `locale`)
- `apps/mobile/src/components/poi-access/access-metrics.tsx` (passe `locale` ×3)
- `apps/mobile/src/components/poi-access/variant-selector.tsx` (passe `locale` ×4)
- `apps/mobile/src/components/map/stage-dialog.tsx` (placeholder → `t(...)`)
- `apps/mobile/src/components/map/sidebar-weather-section.tsx` (placeholder → `t(...)`)
- `apps/mobile/src/components/live/live-filters-drawer.tsx` (placeholder → `t(...)`)
- `apps/mobile/src/components/ui/dialog.tsx` (`accessibilityLabel` → `t('common.close')`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MOB-6-3 → in-progress → review)
- `_bmad-output/implementation-artifacts/MOB-6-3-i18n-finalization.md` (ce fichier)

**Créés :**
- `apps/mobile/src/lib/i18n/locale-parity.test.ts` (verrou parité FR↔EN)

### Review Findings

- [x] [Review][Decision] Nommage `common.close` → `common.closeA11y` — renommé dans `fr.json`, `en.json`, `dialog.tsx`. Résolu : option 1 (suffixe `A11y` conforme convention Dev Notes).
- [x] [Review][Patch] `locale-parity.test.ts` stagé (`git add`) — verrou AC2 présent dans l'index git. [`apps/mobile/src/lib/i18n/locale-parity.test.ts`]
- [x] [Review][Patch] Test ajouté : `formatAccessElevation` FR ≥ 1000 m — cas `formatAccessElevation(1234)` → `'1 234 m'` ajouté. [`apps/mobile/src/components/poi-access/format.test.ts`]
- [x] [Review][Patch] Table Dev Notes source-tree corrigée : `common.dateTimePlaceholder` + `common.closeA11y` (nom `map.stages.departurePlaceholder` retiré). [`_bmad-output/implementation-artifacts/MOB-6-3-i18n-finalization.md` §Source tree]
- [x] [Review][Patch] Description de test renommée : `'séparateur de milliers EN (virgule pour les milliers, pas le décimal)'` — ambiguïté levée. [`apps/mobile/src/components/poi-access/format.test.ts`]
- [x] [Review][Defer] `formatAccessEta` — paramètre `locale` mort (intentionnel per Completion Notes, homogénéité de façade) — deferred, pre-existing
- [x] [Review][Defer] `dialog.tsx` backdrop `Pressable` sans `accessibilityRole="button"` — gap a11y pré-existant, non introduit par cette story — deferred, pre-existing
- [x] [Review][Defer] `Intl.NumberFormat` instancié à chaque appel (micro-optimisation) — deferred, pre-existing
- [x] [Review][Defer] `formatAccessElevation` duplique la logique de `formatInt` de `distance.ts` — déduplication possible mais hors scope de cette story — deferred, pre-existing
- [x] [Review][Defer] `formatAccessDistance` appelée deux fois par variante dans `variant-selector.tsx` — micro-optimisation — deferred, pre-existing
- [x] [Review][Defer] Boilerplate `const locale = i18n.language` × 3 composants — pattern établi projet, un hook `useLocale()` serait une amélioration future — deferred, pre-existing

### Change Log

| Date | Version | Description |
|---|---|---|
| 2026-07-05 | 1.0 | dev-story MOB-6.3 — finition i18n : placeholder date externalisé (`common.dateTimePlaceholder`), `poi-access/format.ts` localisé (`Intl` + `locale`), 7 clés mortes retirées + test couplé réécrit, verrou de parité FR↔EN, `dialog.tsx` close localisé. Gate verte (jest 624, tsc 0, lint 0 err, export iOS OK). Status → review. |
