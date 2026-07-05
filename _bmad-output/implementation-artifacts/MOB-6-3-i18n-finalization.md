---
baseline_commit: f0349415d9fe5b1fb173cf42d84072799e96cdf7
---

# Story MOB-6.3 : Finition de l'internationalisation

Status: ready-for-dev

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

- [ ] **T1 — Externaliser le placeholder de date hardcodé** (AC: 1)
  - [ ] Ajouter une clé (ex. `map.stages.departurePlaceholder`) dans `fr.json` (`"AAAA-MM-JJ HH:MM"`) **et** `en.json` (`"YYYY-MM-DD HH:MM"`).
  - [ ] Remplacer les 3 littéraux : `components/map/stage-dialog.tsx:154`, `components/map/sidebar-weather-section.tsx:138`, `components/live/live-filters-drawer.tsx:427` par `t('map.stages.departurePlaceholder')`.

- [ ] **T2 — Localiser `components/poi-access/format.ts`** (AC: 1)
  - [ ] `formatAccessDistance` (`format.ts:13`) : retirer `km.toFixed(1).replace('.', ',')` (virgule FR figée) → accepter un `locale` + `Intl.NumberFormat` (modèle `lib/format/distance.ts`).
  - [ ] Ajouter `locale` param à `formatAccessDistance` / `formatAccessElevation` / `formatAccessEta`, et le passer aux call-sites : `access-fallback.tsx:20`, `access-metrics.tsx:90/95/101`, `variant-selector.tsx:83/84/112/118` (via `const locale = i18n.language`).
  - [ ] Vérifier le rendu EN (`1.4 km`, pas `1,4 km`).

- [ ] **T3 — Nettoyer les clés mortes de scaffold + réécrire le test couplé** (AC: 3)
  - [ ] Retirer les sections `home` (`subtitle`, `navigateExplore`), `explore` (`title`, `routerOk`, `back`), `oauthCallback` (`title`, `subtitle`) de `fr.json` **et** `en.json` (zéro usage confirmé — écran de démo supprimé, cf. `app/index.tsx:5`).
  - [ ] Réécrire les assertions de `i18n.config.test.ts:10-15` (qui testent `explore.back`, `home.subtitle` contenant `'MOB-1.4'`, `oauthCallback.title`) sur des clés **vivantes** (ex. `adventures.title`, `common.cancel`, `auth.login.title`). Ne pas laisser le test rouge.

- [ ] **T4 — Test de parité de clés FR↔EN (verrou AC2)** (AC: 2)
  - [ ] Ajouter `src/lib/i18n/locale-parity.test.ts` (hors `src/app/`) : aplatit les deux arbres de clés et asserte `keys(fr) === keys(en)` (aucune clé orpheline dans un seul fichier). Garde anti-régression pour tous les ajouts futurs.

- [ ] **T5 — Audit final de non-régression** (AC: 1, 2)
  - [ ] Re-grep les écrans principaux (`src/app/**`, `src/components/**`) : JSX accentué, props `label/title/placeholder/accessibilityLabel/message`, `Alert.alert`, mots FR fréquents (`Rechercher/Annuler/Retour/Erreur…`). Confirmer 0 chaîne UI en dur (les hits accentués restants doivent être des **commentaires** uniquement).
  - [ ] (Décision) Statuer sur les unités non localisées (`h`, `min`, `km`, `D+` dans `formatEta`/`formatEtaSummary`) : très probablement **OK** (parité web, locale-invariant assumé) → **documenter la décision** dans Completion Notes plutôt que corriger.
  - [ ] Vérifier que les defaults `locale = 'fr'` dans `lib/format/distance.ts` / `stage.ts` restent alimentés par `i18n.language` à tous les call-sites (risque résiduel faible, non bloquant).

- [ ] **T6 — Doc Sync + gate** (règle CRITIQUE project-context)
  - [ ] Mettre à jour ce fichier (Completion Notes) : l'externalisation était déjà quasi-complète ; documenter la réalité vs l'AC « aucune chaîne en dur ne subsiste ». **Pas de changement d'AC dans `epics-mobile.md`** (les AC restent satisfaits) sauf déviation.
  - [ ] `sprint-status.yaml` : MOB-6-3 → `in-progress` puis `review`.
  - [ ] **Gate verte** : `jest` (dont nouveau test de parité) · `tsc` 0 · `eslint` 0. `pnpm sim` optionnel (pas de natif).

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
| UPDATE | `src/lib/i18n/locales/fr.json` + `en.json` | + `map.stages.departurePlaceholder` ; − clés mortes `home`/`explore`/`oauthCallback` |
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

_(à remplir par le dev agent)_

### Debug Log References

### Completion Notes List

### File List
