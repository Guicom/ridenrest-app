# Story 17.11: Réactivation du feature flag Strava

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que **propriétaire produit (Guillaume)**,
Je veux **réactiver le feature flag `NEXT_PUBLIC_STRAVA_ENABLED` en dev et en prod**,
Afin que **tous les utilisateurs puissent connecter leur compte Strava et importer leurs routes Strava comme segments GPX dans leurs aventures, maintenant que l'élévation API Strava est obtenue**.

## Contexte

Le feature flag `NEXT_PUBLIC_STRAVA_ENABLED` a été introduit pour griser les CTA Strava (« Connecter Strava » dans `/settings`, « Importer depuis Strava » dans la page d'aventure) tant que l'application Strava de Ride'n'Rest était en mode **Single Athlete** (1 utilisateur autorisé : le propriétaire de l'app). Toute l'infrastructure Strava est déjà implémentée et testée (stories 2.3 OAuth, 3.5 import routes, 16.5 multi-select+pagination, 16.32 brand compliance). Cette story est une **réactivation par flag**, pas un nouveau développement.

Guillaume vient d'obtenir l'accès API étendu côté Strava — l'app peut désormais accepter des utilisateurs externes. Il faut flipper le flag, garantir que le cache Turbo invalide correctement le build prod, mettre à jour le CHANGELOG, et valider end-to-end.

## Acceptance Criteria

1. **Étant donné** un développeur qui pull la branche et démarre l'app en local,
   **Quand** il consulte `apps/web/.env.local`,
   **Alors** la variable `NEXT_PUBLIC_STRAVA_ENABLED=true` est présente, et le bouton « Connect with Strava » de `/settings` est cliquable (pas de tooltip « temporairement indisponible »).

2. **Étant donné** le fichier `turbo.json`,
   **Quand** on inspecte la liste `tasks.build.env`,
   **Alors** `NEXT_PUBLIC_STRAVA_ENABLED` y figure — afin que tout changement de la variable invalide le cache Turbo (gotcha déjà documenté dans `project-context.md`).

3. **Étant donné** un nouveau développeur qui clone le repo,
   **Quand** il consulte `apps/web/.env.example`,
   **Alors** `NEXT_PUBLIC_STRAVA_ENABLED=true` y figure (avec un commentaire d'une ligne expliquant le rôle), pour qu'un copier-coller donne un environnement local fonctionnel.

4. **Étant donné** le `.env` du VPS Hostinger (production),
   **Quand** Guillaume met à jour la valeur,
   **Alors** `NEXT_PUBLIC_STRAVA_ENABLED=true` (basculé depuis `false`) — opération **manuelle Guillaume** sur le VPS.

5. **Étant donné** un utilisateur production sans compte Strava connecté,
   **Quand** il visite `/settings` après le re-déploiement,
   **Alors** le bouton « Connect with Strava » officiel s'affiche **non-grisé**, sans tooltip « temporairement indisponible », et le clic lance le flow OAuth Strava.

6. **Étant donné** un utilisateur production sans Strava connecté qui ouvre une page d'aventure,
   **Quand** il consulte la barre de boutons des segments,
   **Alors** le bouton « Importer depuis Strava » est **non-grisé** et cliquable ; clic → modal d'import qui propose d'aller dans les paramètres pour connecter Strava.

7. **Étant donné** un utilisateur qui complète le flow OAuth Strava en production,
   **Quand** il revient sur `/settings`,
   **Alors** la card affiche « Compte connecté » + bouton « Déconnecter » ; les tokens (`accessToken`, `refreshToken`, `accessTokenExpiresAt`) sont stockés dans la table `account` ; `profiles.strava_athlete_id` contient l'ID athlete Strava.

8. **Étant donné** un utilisateur Strava connecté qui clique « Importer depuis Strava »,
   **Quand** la modal s'ouvre,
   **Alors** la liste paginée des routes Strava se charge (cache Redis 1h via `GET /api/strava/routes`) ; sélection d'au moins une route + clic « Importer » → segment(s) créé(s) avec `source = 'strava'`, badge « Via Strava » sur les segment cards une fois le parsing terminé.

9. **Étant donné** la story 17.1 (système de release notes via `apps/web/CHANGELOG.md`),
   **Quand** la version est incrémentée pour ce déploiement,
   **Alors** une entrée dans `apps/web/CHANGELOG.md` mentionne explicitement « Réactivation de la connexion et de l'import Strava » dans la section Nouveautés, et la version est bumpée selon le pattern existant (e.g. `1.2.1` ou `1.3.0` selon le scope du déploiement).

10. **Étant donné** la suite de tests existants (`pnpm -w test` côté web et api),
    **Quand** on lance les tests,
    **Alors** les tests Strava existants passent sans modification (`strava-connection-card.test.tsx`, `strava-import-modal.test.tsx`, `strava.service.test.ts`, `actions.test.ts`) — aucune régression introduite par le flip du flag.

## Tasks / Subtasks

### Configuration applicative

- [ ] **Task 1 — Mettre à jour `turbo.json` pour invalidation cache** (AC: #2)
  - [ ] 1.1 Ouvrir `turbo.json` à la racine du repo
  - [ ] 1.2 Ajouter `"NEXT_PUBLIC_STRAVA_ENABLED"` dans `tasks.build.env` (juste après `"NEXT_PUBLIC_APP_VERSION"`, à la fin du tableau)
  - [ ] 1.3 Vérifier la syntaxe JSON valide avec `node -e "JSON.parse(require('fs').readFileSync('turbo.json','utf8'))"` (ou ouvrir dans l'IDE)

- [ ] **Task 2 — Documenter le flag dans `.env.example`** (AC: #3)
  - [ ] 2.1 Ouvrir `apps/web/.env.example`
  - [ ] 2.2 Ajouter (ou modifier si déjà présent) :
    ```
    # Active les CTA Strava (connexion + import). false = griser les boutons (mode "Single Athlete").
    NEXT_PUBLIC_STRAVA_ENABLED=true
    ```
  - [ ] 2.3 Pas de commentaire inline sur la même ligne que `KEY=value` (gotcha documenté `feedback_env_no_inline_comments.md`)

- [ ] **Task 3 — Mettre à jour `.env.local` côté dev** (AC: #1) **[MANUEL — Guillaume]**
  - [ ] 3.1 Ouvrir `apps/web/.env.local`
  - [ ] 3.2 S'assurer que `NEXT_PUBLIC_STRAVA_ENABLED=true` est présent (ajouter sinon)
  - [ ] 3.3 Redémarrer `pnpm dev` pour que Next.js recompile les `NEXT_PUBLIC_*`

### Production VPS

- [ ] **Task 4 — Mettre à jour `.env` du VPS Hostinger** (AC: #4) **[MANUEL — Guillaume]**
  - [ ] 4.1 SSH sur le VPS : `ssh deploy@72.62.189.193`
  - [ ] 4.2 Éditer `/home/deploy/ridenrest-app/.env`
  - [ ] 4.3 Remplacer `NEXT_PUBLIC_STRAVA_ENABLED=false` par `NEXT_PUBLIC_STRAVA_ENABLED=true`
  - [ ] 4.4 Sauvegarder, sortir
  - [ ] 4.5 Le re-déploiement (Task 7) appliquera le changement — pas de redémarrage PM2 immédiat nécessaire (le build Next.js doit avoir lieu en premier, sinon l'ancien bundle compilé contient toujours `false`)

### Documentation utilisateur

- [ ] **Task 5 — Mettre à jour `apps/web/CHANGELOG.md` (système story 17.1)** (AC: #9)
  - [ ] 5.1 Ouvrir `apps/web/CHANGELOG.md`
  - [ ] 5.2 Ajouter une nouvelle entrée en haut du fichier (juste sous `# Changelog`) avec la prochaine version (incrément patch ou minor selon les autres changements en cours du déploiement) :
    ```markdown
    ## 1.X.Y — YYYY-MM-DD

    ### Nouveautés
    - Réactivation de la connexion Strava : connecte ton compte Strava depuis Paramètres
    - Import direct des routes Strava comme segments GPX dans une aventure (multi-sélection, recherche par nom)
    ```
  - [ ] 5.3 Synchroniser `package.json#version` (root, `apps/web`) avec la nouvelle version selon le système de versioning de la story 17.1
  - [ ] 5.4 Vérifier `apps/web/src/components/release-notes-popup.tsx` (ou équivalent) pour s'assurer que la popin de release notes utilisera bien le contenu mis à jour

### Validation pré-déploiement

- [ ] **Task 6 — Validation locale (avant push)** (AC: #1, #5, #6, #10)
  - [ ] 6.1 `pnpm -w lint` → 0 erreur
  - [ ] 6.2 `pnpm -w test` → tous les tests passent (les tests Strava utilisent `mockIsStravaEnabled.mockReturnValue(true)` par défaut, donc le flip de flag ne casse rien)
  - [ ] 6.3 `pnpm --filter @ridenrest/web build` → 0 erreur, et le bundle `.next/static/chunks/app/(app)/settings/page-*.js` ne contient plus de littéral `temporairement indisponible` activé (greppable)
  - [ ] 6.4 Smoke test manuel local :
    - [ ] `pnpm dev` → ouvrir `http://localhost:3011/settings` → bouton "Connect with Strava" non grisé, pas de tooltip "indisponible"
    - [ ] Cliquer le bouton → redirection Strava OAuth (page `https://www.strava.com/oauth/authorize?...`) sans erreur
    - [ ] (si test complet souhaité avec un compte Strava test) compléter le flow → retour `/settings` avec « Compte connecté »
    - [ ] Ouvrir une aventure → bouton « Importer depuis Strava » non grisé → modal s'ouvre

### Déploiement

- [ ] **Task 7 — Déploiement production** (AC: #4, #5, #6, #7, #8) **[MANUEL — Guillaume après merge]**
  - [ ] 7.1 Push de la branche → merge sur `main`
  - [ ] 7.2 GitHub Actions déclenche `deploy.sh` sur le VPS
  - [ ] 7.3 Vérifier que `deploy.sh` `source .env` AVANT `turbo build` (sinon les `NEXT_PUBLIC_*` ne sont pas embarqués — gotcha documenté project-context.md)
  - [ ] 7.4 Attendre la fin du déploiement (PM2 reload web + api)
  - [ ] 7.5 Vérifier que le cache Turbo a bien été invalidé : si la build hit le cache, le bundle compilé contient encore l'ancien littéral. La présence de `NEXT_PUBLIC_STRAVA_ENABLED` dans `turbo.json#env` (Task 1) garantit l'invalidation.

### Smoke test production (CRITIQUE)

- [ ] **Task 8 — Smoke test E2E sur ridenrest.app** (AC: #5, #6, #7, #8) **[MANUEL — Guillaume]**
  - [ ] 8.1 Ouvrir `https://ridenrest.app` en navigation privée + se connecter avec un compte test (ou créer un compte test)
  - [ ] 8.2 Aller sur `https://ridenrest.app/settings`
    - [ ] Vérifier : bouton « Connect with Strava » officiel visible, **non grisé**, pas de message « temporairement indisponible »
  - [ ] 8.3 Cliquer le bouton → flow OAuth Strava complet
    - [ ] Vérifier : retour sur `/settings` avec « Compte connecté » + bouton « Déconnecter »
    - [ ] DB check (psql VPS) : `SELECT provider_id, account_id, access_token_expires_at FROM account WHERE user_id = '<userId>'` → ligne `provider_id = 'strava'`, `account_id` non null
    - [ ] DB check : `SELECT strava_athlete_id FROM profiles WHERE id = '<userId>'` → valeur non null
  - [ ] 8.4 Aller sur une aventure (créer si nécessaire avec un GPX test)
    - [ ] Vérifier : bouton « Importer depuis Strava » non grisé
    - [ ] Cliquer → modal s'ouvre avec liste paginée des routes Strava (l'utilisateur test doit avoir au moins 1 route Strava sauvegardée pour ce test)
  - [ ] 8.5 Sélectionner 1-2 routes → cliquer « Importer N segment(s) »
    - [ ] Vérifier : toast succès, modal se ferme, segment(s) apparaissent dans la liste avec `parse_status: pending` puis `done`
    - [ ] Vérifier : badge « Via Strava » sur les segment cards une fois parsées
    - [ ] DB check : `SELECT id, source, parse_status FROM adventure_segments WHERE adventure_id = '<advId>'` → `source = 'strava'`
  - [ ] 8.6 Cliquer « Déconnecter » sur `/settings` → vérifier que la ligne `account` est supprimée et `profiles.strava_athlete_id` repassé à null

### Code Review Follow-up (post-deploy, optionnel)

- [ ] **Task 9 — Décision : conserver ou nettoyer le code défensif `!isStravaEnabled()`**
  - [ ] 9.1 Avec le flag à `true` partout, les conditions `!isStravaEnabled() && !stravaConnected` deviennent toujours `false`. Le code défensif (tooltip, `disabled`, opacity-50) est mort en production.
  - [ ] 9.2 **Recommandation** : conserver le mécanisme **tel quel** pour pouvoir re-désactiver rapidement (kill-switch) si Strava révoque l'accès ou si un incident production survient. Documenter cette décision en commentaire d'une ligne au-dessus de la définition `isStravaEnabled` dans `apps/web/src/lib/strava-config.ts` :
    ```typescript
    // Kill-switch Strava — flip à false pour griser les CTA en cas d'incident API/quota Strava.
    export const isStravaEnabled = () => process.env.NEXT_PUBLIC_STRAVA_ENABLED === 'true'
    ```
  - [ ] 9.3 Pas de suppression du code conditionnel dans `strava-connection-card.tsx` ni `adventure-detail.tsx` — le coût de maintenance est nul, l'option de rollback rapide a une vraie valeur.

---

## Dev Notes

### CRITICAL : ce qui est DÉJÀ FAIT — ne rien réimplémenter

L'intégration Strava est **complète** côté code. Cette story flip un feature flag, rien d'autre.

| Composant | Fichier | Statut |
|---|---|---|
| OAuth Strava (Better Auth `genericOAuth`) | `apps/web/src/lib/auth/auth.ts` | ✅ done (story 2.3) |
| `genericOAuthClient` côté browser | `apps/web/src/lib/auth/client.ts` | ✅ done (story 2.3) |
| Page Settings + StravaConnectionCard | `apps/web/src/app/(app)/settings/...` | ✅ done (story 2.3) |
| Server Action `disconnectStrava` | `apps/web/src/app/(app)/settings/actions.ts` | ✅ done (story 2.3) |
| NestJS `StravaModule` (controller + service) | `apps/api/src/strava/...` | ✅ done (story 3.5) |
| Rate limiting Redis (15min/daily) | `apps/api/src/strava/strava.service.ts` | ✅ done (story 3.5) |
| Token refresh automatique | `apps/api/src/strava/strava.service.ts` | ✅ done (story 3.5) |
| Multi-sélection + pagination + recherche | `apps/web/.../strava-import-modal.tsx` | ✅ done (story 16.5) |
| Conformité Strava Brand Guidelines (logo officiel, bouton SVG, deauthorize, privacy policy) | divers | ✅ done (story 16.32) |
| Feature flag `isStravaEnabled()` + UI dégradée | `apps/web/src/lib/strava-config.ts` | ✅ done |
| Server-side check `stravaConnected` | `apps/web/src/app/(app)/adventures/[id]/page.tsx` | ✅ done |
| Badge « Via Strava » sur segment cards | `apps/web/.../segment-card.tsx` | ✅ done |
| Tests existants (Vitest + Jest) | colocalisés | ✅ done — couvrent le flag |

**Cette story modifie uniquement** :
- `turbo.json` (env list)
- `apps/web/.env.example` (documentation)
- `apps/web/.env.local` (manuel Guillaume)
- `.env` du VPS (manuel Guillaume)
- `apps/web/CHANGELOG.md` (release notes story 17.1)
- `package.json#version` (root + apps/web — versioning story 17.1)
- (Optionnel) commentaire kill-switch dans `apps/web/src/lib/strava-config.ts`

### CRITICAL — Gotcha Turbo Cache (déjà documenté project-context.md)

> Turbo cache : les `NEXT_PUBLIC_*` doivent être dans `turbo.json#env` sinon le cache ignore les changements

Sans Task 1, le scénario échoue ainsi :
1. Guillaume passe le `.env` VPS de `false` à `true`
2. `deploy.sh` lance `turbo build`
3. Turbo voit que ni les fichiers source, ni les variables d'env **listées dans `turbo.json#env`** n'ont changé → cache HIT → réutilise le bundle précédent (compilé avec `false`)
4. Le bundle servi en prod a toujours `process.env.NEXT_PUBLIC_STRAVA_ENABLED === 'true'` qui retourne `false`
5. Les boutons restent grisés en prod malgré le `.env` correct

**La fix est triviale** : ajouter `"NEXT_PUBLIC_STRAVA_ENABLED"` dans `turbo.json#env` (Task 1.2).

### CRITICAL — Gotcha .env inline comments (déjà documenté project-context.md)

`apps/web/.env.example` (Task 2.2) : le commentaire doit être sur **sa propre ligne**, AU-DESSUS de `KEY=value`. NE PAS faire :
```
NEXT_PUBLIC_STRAVA_ENABLED=true # active la connexion Strava   # ❌ casse en prod
```
Faire :
```
# Active les CTA Strava (connexion + import). false = griser les boutons.
NEXT_PUBLIC_STRAVA_ENABLED=true
```

### CRITICAL — Comportement actuel du flag

Référentiel exact du comportement désiré :

**`apps/web/src/lib/strava-config.ts`** (1 ligne, déjà en place) :
```typescript
export const isStravaEnabled = () => process.env.NEXT_PUBLIC_STRAVA_ENABLED === 'true'
```

**`apps/web/src/app/(app)/settings/_components/strava-connection-card.tsx`** (extrait, déjà en place) :
```typescript
const stravaEnabled = isStravaEnabled()
const connectDisabled = !stravaEnabled && !isConnected
// → bouton grisé + message "temporairement indisponible" si flag=false ET non connecté
// → utilisateurs déjà connectés gardent l'accès au bouton "Déconnecter" même si flag=false
```

**`apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx`** (lignes 466-481, déjà en place) :
```tsx
<Button
  className={`...${!isStravaEnabled() && !stravaConnected ? ' opacity-50 cursor-not-allowed' : ''}`}
  disabled={!isStravaEnabled() && !stravaConnected}
  ...
>
  Importer depuis Strava
</Button>
{!isStravaEnabled() && !stravaConnected && (
  <div className="...tooltip...">L&apos;intégration Strava est temporairement indisponible</div>
)}
```

→ Avec le flag à `true`, `connectDisabled` et la condition tooltip deviennent toujours `false`. Aucune modification du JSX nécessaire.

### CRITICAL — `account.create.after` hook ne sera pas re-exécuté

Le hook Better Auth `databaseHooks.account.create.after` (auth.ts) qui synchronise `profiles.strava_athlete_id` ne se déclenche que **lors de la création** d'un compte Strava. Pour les utilisateurs ayant déjà eu un compte Strava lié AVANT que le flag ne soit désactivé (cas rare en prod actuellement, mais à vérifier), aucune action ne se déclenche au flip — leur état reste correct (déjà persisté lors du link initial).

→ Pas de migration de données nécessaire.

### Stack technique impacté

- **Build pipeline** : Turborepo 2.6.1 + pnpm 9 — invalidation cache via `turbo.json#env`
- **Frontend** : Next.js 15 standalone — `NEXT_PUBLIC_*` compilées au build, **pas** lues runtime
- **Process manager prod** : PM2 + `ecosystem.config.js` → charge `.env` via `fs.readFileSync` puis spread dans `env`. Une fois le `.env` modifié + nouveau bundle compilé, `pm2 reload` suffit.
- **Reverse proxy** : Caddy 2 — pas de cache spécifique côté Caddy à invalider
- **CDN** : pas de Cloudflare devant ridenrest.app actuellement (à confirmer) → pas d'invalidation CDN nécessaire

### Tests existants — comportement attendu

`strava-connection-card.test.tsx` (Vitest) :
- Default mock : `mockIsStravaEnabled.mockReturnValue(true)` → couvre le scénario nominal post-réactivation
- 3 tests dédiés au flag (`describe('feature flag STRAVA_ENABLED')`) :
  - `greys out Connect button when STRAVA_ENABLED=false and not connected` — passera toujours (mock explicite false)
  - `keeps Connect button active when STRAVA_ENABLED=false but already connected` — passera toujours
  - `keeps Connect button fully active when STRAVA_ENABLED=true` — passera toujours

→ Aucun test à modifier. La story 17.11 n'introduit pas de nouveau test côté code (les tests existants couvrent déjà les deux états du flag).

### Anti-patterns à éviter

```typescript
// ❌ Ajouter NEXT_PUBLIC_STRAVA_ENABLED uniquement dans .env sans toucher à turbo.json
// → Turbo cache ignore le changement → bundle prod garde l'ancienne valeur
// ✅ Modifier turbo.json#env EN MÊME TEMPS

// ❌ Utiliser un commentaire inline dans .env.example
NEXT_PUBLIC_STRAVA_ENABLED=true # active Strava
// ✅ Commentaire au-dessus
# Active les CTA Strava (connexion + import).
NEXT_PUBLIC_STRAVA_ENABLED=true

// ❌ Supprimer le mécanisme isStravaEnabled() en pensant que "le flag est inutile une fois à true"
// → Perte du kill-switch d'urgence si Strava révoque l'accès
// ✅ Garder en place comme kill-switch

// ❌ Faire pm2 reload directement sans rebuild Next.js
// → Le bundle déployé contient toujours l'ancienne valeur compilée
// ✅ Toujours passer par deploy.sh complet (turbo build → pm2 reload)

// ❌ Activer le flag prod AVANT d'avoir vérifié l'élévation API Strava côté developers.strava.com
// → Erreurs 403 pour tout utilisateur autre que Guillaume
// ✅ Vérifier sur https://www.strava.com/settings/api que l'app est bien en mode "Open" (999 utilisateurs) ou supérieur
```

### Pré-requis Strava (côté plateforme externe)

**Avant de merger cette story** : Guillaume doit confirmer que l'app Strava (https://www.strava.com/settings/api) est en mode :
- ✅ **Open** (999 utilisateurs autorisés) — minimum recommandé pour MVP avril 2026
- ou supérieur (si élévation supplémentaire obtenue)

Si l'app est encore en mode **Single Athlete** (1 user), tout utilisateur autre que Guillaume verra une erreur Strava OAuth → ne pas activer le flag avant l'élévation officielle.

### References

- [Source: _bmad-output/implementation-artifacts/2-3-strava-oauth-connection.md — OAuth Strava complet, scopes `['read', 'read_all']`, account.create.after hook]
- [Source: _bmad-output/implementation-artifacts/3-5-strava-activity-import-as-segment.md — NestJS StravaModule, listRoutes/importRoute, rate limiting Redis 100/15min + 1000/jour, refresh token]
- [Source: _bmad-output/implementation-artifacts/16-5-strava-import-enhancements.md — multi-select + pagination dans la modal d'import]
- [Source: _bmad-output/implementation-artifacts/16-32-strava-attribution-badge.md — bouton OAuth officiel + deauthorize + privacy policy + brand guidelines]
- [Source: _bmad-output/implementation-artifacts/17-1-versioning-app-release-notes-popup.md — système CHANGELOG.md + popin release notes]
- [Source: _bmad-output/project-context.md#VPS-Deployment-Config — gotcha Turbo cache `NEXT_PUBLIC_*` doivent être dans `turbo.json#env`, gotcha .env pas de commentaires inline]
- [Source: turbo.json — liste actuelle `tasks.build.env` (NEXT_PUBLIC_API_URL, NEXT_PUBLIC_BETTER_AUTH_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, NEXT_PUBLIC_PLAUSIBLE_DOMAIN, NEXT_PUBLIC_APP_VERSION) — `NEXT_PUBLIC_STRAVA_ENABLED` à ajouter]
- [Source: apps/web/src/lib/strava-config.ts — implémentation 1-ligne du flag]
- [Source: apps/web/src/app/(app)/settings/_components/strava-connection-card.tsx — UI conditionnelle existante]
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx#L466-481 — bouton "Importer depuis Strava" avec tooltip conditionnel]
- [Source: apps/web/src/app/(app)/adventures/[id]/page.tsx — Server Component check `stravaConnected` via authDb account table]
- [Source: ecosystem.config.js — PM2 charge `.env` via fs.readFileSync, spread dans `env` de chaque app]
- [Source: apps/web/CHANGELOG.md — format des entrées (versions 1.1.0, 1.2.0)]
- [Source: developers.strava.com/docs/getting-started/#account — modes Single Athlete vs Open vs Approved]

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

#### Modified Files (attendus)
- `turbo.json`
- `apps/web/.env.example`
- `apps/web/CHANGELOG.md`
- `package.json` (root, version bump)
- `apps/web/package.json` (version bump)
- (Optionnel) `apps/web/src/lib/strava-config.ts` (commentaire kill-switch)

#### Manual Tasks Remaining (Guillaume)
- `apps/web/.env.local` — `NEXT_PUBLIC_STRAVA_ENABLED=true`
- VPS `/home/deploy/ridenrest-app/.env` — flip `false` → `true`
- Vérifier statut app Strava (mode Open ou supérieur) sur https://www.strava.com/settings/api avant merge

---

## Change Log

- 2026-05-03 — Story 17.11 créée par Bob (SM) suite à l'obtention de l'élévation API Strava par Guillaume. Réactivation par feature flag du système Strava OAuth + import routes (infrastructure entièrement implémentée dans les stories 2.3, 3.5, 16.5, 16.32).
