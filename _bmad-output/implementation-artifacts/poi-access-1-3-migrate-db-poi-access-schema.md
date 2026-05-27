# Story POI-Access 1.3 : Migration DB pour le calcul d'itinéraire d'accès

Status: ready-for-dev

<!--
Story scope-specific issue de epics-poi-access-routing.md (feature POI Access Routing).
Préfixe `poi-access-` pour cohérence avec les stories 1.1 et 1.2.
Indépendante des stories 1.1 et 1.2 (peut tourner en parallèle — code only).
Bloquante pour toutes les stories backend d'Epic 2 (RoutingService, AccessCalculator, endpoint).
-->

## Story

As a **backend developer**,
I want to extend the database schema with the columns and types needed for storing access route data and user routing preferences,
So that subsequent backend stories can persist computed access routes and user consent without further schema changes.

## Acceptance Criteria

1. **Given** les schémas Drizzle existants dans `packages/database/src/schema/`, **When** j'édite `accommodations-cache.ts` pour ajouter 8 nouvelles colonnes (`access_origin_stage_id`, `access_distance_m`, `access_elevation_gain_m`, `access_elevation_loss_m`, `access_geometry`, `access_engine_version`, `access_computed_at`, `access_failed`), **Then** :
   - `access_origin_stage_id` est une FK vers `adventure_stages(id) ON DELETE SET NULL`
   - `access_distance_m`, `access_elevation_gain_m`, `access_elevation_loss_m` sont des `real()` nullables
   - `access_geometry` utilise le `customType<geometry>` réutilisé depuis `adventure-segments.ts` (PostGIS `geometry(LINESTRING, 4326)`)
   - `access_engine_version` est `text()` nullable
   - `access_computed_at` est `timestamp()` nullable
   - `access_failed` est `boolean().notNull().default(false)`

2. **Given** le schéma `adventures.ts`, **When** je l'édite, **Then** :
   - Un enum `routingProfileEnum = pgEnum('routing_profile', ['road', 'gravel', 'bikepacking'])` est déclaré
   - Une colonne `routingProfile: routingProfileEnum('routing_profile').notNull().default('gravel')` est ajoutée

3. **Given** le schéma `profiles.ts`, **When** je l'édite, **Then** une colonne `liveAccessConsent: boolean('live_access_consent')` (nullable, **pas de default** — NULL signifie "jamais demandé") est ajoutée.

4. **Given** les modifs Drizzle ci-dessus, **When** je lance `cd packages/database && pnpm drizzle-kit generate`, **Then** :
   - Un nouveau fichier de migration `migrations/{NNNN}_{slug}.sql` est créé (NNNN = prochain numéro séquentiel)
   - Le fichier `migrations/meta/_journal.json` est automatiquement mis à jour avec l'entrée
   - Le fichier SQL généré contient : `CREATE TYPE routing_profile AS ENUM ('road','gravel','bikepacking')`, les `ALTER TABLE` pour les 3 tables, et les colonnes geometry PostGIS correctement déclarées

5. **Given** le fichier SQL généré, **When** je l'inspecte, **Then** les **2 indexes requis** sont présents :
   - `idx_accommodations_cache_access_stage` sur `access_origin_stage_id`
   - `idx_accommodations_cache_access_pending` (index partiel sur `segment_id WHERE access_computed_at IS NULL AND access_failed = false`)
   - Si drizzle-kit ne génère pas l'index partiel `WHERE` automatiquement (limitation connue), il faut l'**éditer DANS le fichier SQL généré** (PAS dans un fichier séparé — voir Dev Notes §Drizzle Workflow)

6. **Given** une DB de dev locale propre, **When** je lance `pnpm --filter @ridenrest/database exec drizzle-kit migrate`, **Then** :
   - Toutes les migrations s'appliquent (y compris la nouvelle) sans erreur
   - `\d accommodations_cache` dans psql confirme les 8 nouvelles colonnes avec types corrects
   - `\d adventures` confirme la colonne `routing_profile`
   - `\d profiles` confirme la colonne `live_access_consent`
   - Les 2 indexes existent (`\di idx_accommodations_cache_access_*`)
   - Le type `routing_profile` existe (`\dT routing_profile`)

7. **Given** la migration s'applique sur une DB contenant déjà des rows production-like, **When** la migration se termine, **Then** :
   - Aucune row existante n'est altérée (sauf `adventures.routing_profile` qui prend la valeur default `'gravel'`)
   - Pas de lock long sur les tables (les `ALTER TABLE ... ADD COLUMN` avec default sont rapides en Postgres 11+)
   - Les rows `accommodations_cache` existantes ont toutes les nouvelles colonnes à NULL (sauf `access_failed = false`)

8. **Given** les fichiers Drizzle mis à jour, **When** je lance `pnpm typecheck` à la racine du repo, **Then** :
   - Aucune erreur TS dans `apps/api`, `apps/web`, `packages/database`, `packages/shared`
   - Les nouveaux champs sont accessibles via les types Drizzle générés (ex: `Adventure['routingProfile']`)

9. **Given** la migration est commitée, **When** elle sera déployée en prod via `deploy.sh` (existant), **Then** le step `drizzle-kit migrate` du script appliquera automatiquement la nouvelle migration sans intervention humaine.

10. **Given** la story est terminée, **When** je commit, **Then** le diff inclut UNIQUEMENT :
    - `packages/database/src/schema/accommodations-cache.ts` (modifié)
    - `packages/database/src/schema/adventures.ts` (modifié)
    - `packages/database/src/schema/profiles.ts` (modifié)
    - `packages/database/migrations/{NNNN}_{slug}.sql` (généré)
    - `packages/database/migrations/meta/_journal.json` (généré)
    - `packages/database/migrations/meta/{NNNN}_snapshot.json` (généré)
    - Éventuelles maj docs (`architecture-poi-access-routing.md`, `epics-poi-access-routing.md`) si découvertes nécessitant Doc Sync Rule

---

## ⚠️ Critical Discovery Notes — À LIRE AVANT IMPLÉMENTATION

### 1. CONTRADICTION CRITIQUE archi vs project-context

**L'architecture** (`architecture-poi-access-routing.md` §Migration Approach) dit :
> - **Drizzle migrations classiques** pour les colonnes simples
> - **Migration SQL raw** pour `geometry(LINESTRING, 4326)` et les index partiels `WHERE`
> - Pattern existant dans le projet (cf. `adventure-segments.geom`)

**MAIS le project-context** (`project-context.md` §Drizzle Migrations — MANDATORY Workflow) dit :
> **NEVER write migration SQL files manually.** Always use `drizzle-kit generate`.
> Why this is critical: `drizzle-kit migrate` (run automatically in `deploy.sh`) only applies migrations listed in `migrations/meta/_journal.json`. A manually-written `.sql` file that is NOT registered in the journal will NEVER be applied to the production database — resulting in missing columns and 500 errors.

**Resolution applicable** : suivre **STRICTEMENT le project-context** (qui est la règle d'or projet, validée en prod).

→ Si `drizzle-kit generate` ne supporte pas un cas (index partiel `WHERE`, type custom PostGIS), **éditer le fichier `.sql` GÉNÉRÉ** (qui EST référencé dans `_journal.json`), pas créer un fichier séparé.

→ Action Task 7 : mettre à jour `architecture-poi-access-routing.md` pour aligner sur cette règle (Doc Sync Rule).

### 2. CustomType geometry — vérifier le pattern existant

L'architecture mentionne que le pattern `customType<geometry>` est "déjà en place dans `adventure-segments.ts`". **À CONFIRMER en Task 1** :
- Ouvrir `packages/database/src/schema/adventure-segments.ts`
- Identifier le bloc `customType<...>` qui gère la geometry
- **Réutiliser le même import** dans `accommodations-cache.ts` (DRY — ne pas dupliquer la définition)

Si la définition est inline dans `adventure-segments.ts`, l'extraire dans un nouveau fichier partagé `packages/database/src/types/geometry.ts` (best practice) et l'importer dans les deux schémas.

### 3. Conflit colonne `live_access_consent` — pattern existant `overpassEnabled`

Le `project-context.md` mentionne :
> **Overpass Opt-in (`overpassEnabled`)** : `profiles.overpass_enabled boolean DEFAULT false` — persisted in DB

**Pattern différent du nôtre** : `overpassEnabled` a un default `false`, tandis que notre `live_access_consent` doit être **nullable sans default** (NULL = jamais demandé, true/false = consentement explicite).

→ Justifier ce choix dans un commentaire de schéma : "Tri-state for RGPD: NULL = never asked, true = consented, false = explicitly refused".

### 4. CI step `drizzle-kit migrate` DÉJÀ en place

Le `project-context.md` §VPS Deployment Config liste les steps de `deploy.sh` :
> `git pull → source .env → turbo build → copy static assets → drizzle-kit migrate → pm2 reload`

**Le step est DÉJÀ présent**. Cette story n'a PAS besoin d'ajouter de step CI — l'AC #9 vérifie juste que ça fonctionnera automatiquement. L'AC originale de `epics-poi-access-routing.md` Story 1.3 mentionnait "ajouter un step `pnpm db:migrate`" — c'est redondant.

→ Action Task 7 : mettre à jour `epics-poi-access-routing.md` pour clarifier que le step est déjà en place (Doc Sync Rule).

### 5. Pas de rollback procédure formelle

L'AC originale mentionnait "un rollback manuel est documenté dans le runbook (procédure SQL `ALTER TABLE ... DROP COLUMN`)". **Drizzle ne supporte pas de rollback automatique** — la stratégie projet est forward-only (cf. patterns existants : aucune migration `down` dans `migrations/`).

→ Documenter dans le runbook BRouter (Story 1.2 ou nouveau fichier) la procédure manuelle SI besoin :
```sql
ALTER TABLE accommodations_cache 
  DROP COLUMN access_origin_stage_id,
  DROP COLUMN access_distance_m,
  -- ... etc.
;
DROP INDEX IF EXISTS idx_accommodations_cache_access_stage;
DROP INDEX IF EXISTS idx_accommodations_cache_access_pending;
ALTER TABLE adventures DROP COLUMN routing_profile;
ALTER TABLE profiles DROP COLUMN live_access_consent;
DROP TYPE IF EXISTS routing_profile;
```
→ Procédure de last-resort, ne pas l'inclure dans le déploiement automatique.

---

## Tasks / Subtasks

- [ ] **Task 1** — Étudier le pattern customType<geometry> existant (AC: 1, ⚠️Discovery #2)
  - [ ] Lire `packages/database/src/schema/adventure-segments.ts`
  - [ ] Identifier le bloc `customType<{ data: string; driverData: string }>` qui gère `geometry`
  - [ ] Décider : (a) ré-importer depuis adventure-segments.ts, ou (b) extraire dans `packages/database/src/types/geometry.ts` partagé
  - [ ] Si (b), créer le fichier et faire le refactor d'adventure-segments.ts pour utiliser l'import (commit séparé recommandé)

- [ ] **Task 2** — Étendre `packages/database/src/schema/accommodations-cache.ts` (AC: 1)
  - [ ] Importer le customType geometry (issu Task 1)
  - [ ] Ajouter les 8 colonnes en respectant le naming snake_case DB / camelCase TS :
    ```typescript
    accessOriginStageId: text('access_origin_stage_id')
      .references(() => adventureStages.id, { onDelete: 'set null' }),
    accessDistanceM: real('access_distance_m'),
    accessElevationGainM: real('access_elevation_gain_m'),
    accessElevationLossM: real('access_elevation_loss_m'),
    accessGeometry: lineString('access_geometry'),  // customType
    accessEngineVersion: text('access_engine_version'),
    accessComputedAt: timestamp('access_computed_at'),
    accessFailed: boolean('access_failed').notNull().default(false),
    ```
  - [ ] Ajouter les 2 indexes dans le `(table) => ({...})` de `pgTable` :
    ```typescript
    accessStageIdx: index('idx_accommodations_cache_access_stage')
      .on(table.accessOriginStageId),
    accessPendingIdx: index('idx_accommodations_cache_access_pending')
      .on(table.segmentId)
      .where(sql`access_computed_at IS NULL AND access_failed = false`),
    ```

- [ ] **Task 3** — Étendre `packages/database/src/schema/adventures.ts` (AC: 2)
  - [ ] Déclarer l'enum : `export const routingProfileEnum = pgEnum('routing_profile', ['road', 'gravel', 'bikepacking'])`
  - [ ] Ajouter la colonne dans `pgTable('adventures', {...})` : `routingProfile: routingProfileEnum('routing_profile').notNull().default('gravel')`

- [ ] **Task 4** — Étendre `packages/database/src/schema/profiles.ts` (AC: 3, ⚠️Discovery #3)
  - [ ] Ajouter `liveAccessConsent: boolean('live_access_consent')` (nullable, sans default)
  - [ ] Ajouter commentaire : `// Tri-state RGPD: NULL = never asked, true = consented, false = explicitly refused`

- [ ] **Task 5** — Générer la migration via Drizzle (AC: 4, 5, ⚠️Discovery #1)
  - [ ] `cd packages/database && pnpm drizzle-kit generate`
  - [ ] Vérifier qu'un fichier `migrations/{NNNN}_{slug}.sql` est créé
  - [ ] Vérifier `migrations/meta/_journal.json` mis à jour avec la nouvelle entrée
  - [ ] **Inspecter le SQL généré** :
    - [ ] Le `CREATE TYPE routing_profile` est-il présent ?
    - [ ] Les `ALTER TABLE` pour les 3 tables sont-ils corrects ?
    - [ ] La colonne geometry PostGIS est-elle correctement déclarée (`geometry(LineString, 4326)`) ?
    - [ ] Les 2 indexes sont-ils présents, dont l'index partiel `WHERE` ?
  - [ ] Si l'index partiel `WHERE` n'est pas généré (limitation drizzle-kit) : **éditer le fichier `.sql` généré** pour l'ajouter manuellement à la fin :
    ```sql
    CREATE INDEX IF NOT EXISTS idx_accommodations_cache_access_pending
      ON accommodations_cache(segment_id)
      WHERE access_computed_at IS NULL AND access_failed = false;
    ```
  - [ ] **NE PAS créer de fichier SQL séparé** (sinon non-référencé dans `_journal.json` → jamais appliqué en prod — cf. ⚠️Discovery #1)

- [ ] **Task 6** — Appliquer et valider la migration en local (AC: 6, 7)
  - [ ] DB locale propre : `docker compose down -v && docker compose up -d db && sleep 5`
  - [ ] `pnpm --filter @ridenrest/database exec drizzle-kit migrate`
  - [ ] Vérifier qu'aucune erreur n'est levée
  - [ ] Connecter via `psql postgresql://ridenrest:ridenrest@localhost:5432/ridenrest`
  - [ ] Exécuter et vérifier output :
    - `\d accommodations_cache` → 8 nouvelles colonnes présentes avec bons types
    - `\d adventures` → `routing_profile` présent avec default `'gravel'`
    - `\d profiles` → `live_access_consent` présent (nullable, no default)
    - `\di idx_accommodations_cache_access_*` → 2 indexes présents
    - `\dT routing_profile` → type ENUM avec 3 valeurs
  - [ ] Tester l'idempotence : `drizzle-kit migrate` à nouveau → "no migrations to apply" (skipped)

- [ ] **Task 7** — Validation typecheck et Doc Sync (AC: 8, ⚠️Discovery #1, #4)
  - [ ] `pnpm typecheck` à la racine → 0 erreurs
  - [ ] Tester un import frais dans `apps/api` : `import { adventures } from '@ridenrest/database'` puis `type T = typeof adventures.$inferSelect` doit inclure `routingProfile`
  - [ ] **Doc Sync (CRITIQUE)** — mettre à jour `architecture-poi-access-routing.md` :
    - §Migration Approach : remplacer "Migration SQL raw pour geometry et index partiels" par "TOUT via drizzle-kit generate, éditer le SQL généré si besoin (jamais de fichier SQL séparé) — règle stricte project-context"
  - [ ] **Doc Sync (CRITIQUE)** — mettre à jour `epics-poi-access-routing.md` Story 1.3 :
    - AC "ajouter step CI `pnpm db:migrate`" → remplacer par "le step `drizzle-kit migrate` est déjà dans `deploy.sh`, vérifier qu'il s'exécute en CI"

- [ ] **Task 8** — Test seed manuel (validation fonctionnelle Drizzle types) (AC: 8)
  - [ ] Dans un fichier `.spec.ts` temporaire OU directement via le repl :
    ```typescript
    import { db, adventures, profiles, accommodationsCache } from '@ridenrest/database'
    // Insert dummy adventure
    const [adv] = await db.insert(adventures).values({
      // ... mandatory fields ...
      routingProfile: 'gravel',  // ← doit type-checker
    }).returning()
    
    // Insert dummy profile
    await db.update(profiles)
      .set({ liveAccessConsent: true })  // ← doit type-checker
      .where(eq(profiles.userId, 'test-user-id'))
    
    // Insert dummy accommodation cache row avec access fields
    await db.insert(accommodationsCache).values({
      // ... mandatory fields ...
      accessDistanceM: 1234.5,
      accessElevationGainM: 50,
      accessFailed: false,
    })
    ```
  - [ ] Test rapide via `pnpm tsx scripts/test-poi-access-schema.ts` (script à supprimer après validation)
  - [ ] Supprimer le script temporaire avant commit

- [ ] **Task 9** — Commit propre (AC: 10)
  - [ ] `git status` doit montrer exactement les fichiers attendus (cf. AC #10)
  - [ ] `git diff packages/database/migrations/` pour double-checker le SQL généré
  - [ ] Message de commit suggéré : `feat(db): add poi access routing schema (routing_profile, accommodations_cache.access_*, live_access_consent) — story poi-access-1.3`
  - [ ] **NE PAS commit** le script temporaire de Task 8

---

## Dev Notes

### Pattern projet — Drizzle Schema

Convention nommage (cf. project-context.md §Naming Conventions) :
- Tables : `snake_case` plural (`accommodations_cache`)
- Colonnes : `snake_case` (`access_distance_m`)
- FK : `{singular}_id` (`access_origin_stage_id`)
- Indexes : `idx_{table}_{purpose}` (`idx_accommodations_cache_access_pending`)
- Types Drizzle inferred : `camelCase` (`accessDistanceM`)

Suffixe unité physique pour les colonnes numériques (cf. archi §Enforcement Guidelines règle #8) :
- `_m` pour mètres, `_kmh` pour km/h, `_at` pour timestamps

### Pattern projet — Drizzle customType<geometry>

À confirmer via lecture de `adventure-segments.ts` (Task 1). Pattern attendu :
```typescript
import { customType } from 'drizzle-orm/pg-core'

export const lineString = customType<{ data: string; driverData: string }>({
  dataType() { return 'geometry(LineString, 4326)' },
})
```

L'usage de `customType` permet à drizzle-kit de générer correctement le SQL `geometry(...)` dans la migration — pas besoin de raw SQL.

### Pattern projet — Repository pattern

Cette story n'écrit PAS de code applicatif (services, controllers). Tous les usages futurs des nouvelles colonnes passeront par les repositories (cf. project-context.md §NestJS Architecture Rules : "ALL Drizzle queries go here, NEVER in service").

### Doc Sync Rule (CRITIQUE)

Task 7 sync 2 docs :
1. `architecture-poi-access-routing.md` — corriger §Migration Approach pour aligner sur project-context (strict drizzle-kit)
2. `epics-poi-access-routing.md` — Story 1.3 AC : noter que le step `drizzle-kit migrate` est déjà dans `deploy.sh`

### Project Structure Notes

Fichiers modifiés/créés :
- `packages/database/src/schema/accommodations-cache.ts` (modifié)
- `packages/database/src/schema/adventures.ts` (modifié)
- `packages/database/src/schema/profiles.ts` (modifié)
- `packages/database/src/types/geometry.ts` (potentiellement créé en Task 1 si refactor décidé)
- `packages/database/migrations/{NNNN}_*.sql` (généré par drizzle-kit)
- `packages/database/migrations/meta/*.json` (généré par drizzle-kit)

### Testing Standards

- Pas de test unitaire dédié à la migration (la migration EST le test)
- Validation manuelle via psql (AC #6)
- Type-check Drizzle = validation statique TS (AC #8)
- Test fonctionnel via script Task 8 (à supprimer après)

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-1.3] — AC originaux
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Data-Architecture] — schéma détaillé
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Migration-Approach] — **À CORRIGER** (cf. Discovery #1)
- [Source: _bmad-output/project-context.md#Drizzle-Migrations-MANDATORY-Workflow] — règle d'or projet (source de vérité)
- [Source: _bmad-output/project-context.md#Naming-Conventions] — DB conventions
- [Source: _bmad-output/project-context.md#VPS-Deployment-Config] — deploy.sh inclut déjà drizzle-kit migrate
- [Source: packages/database/src/schema/adventure-segments.ts] — pattern customType à étudier
- [Source: packages/database/migrations/_journal.json] — historique migrations existantes

---

## Dev Agent Record

### Agent Model Used

_(À renseigner)_

### Debug Log References

_(Vide)_

### Completion Notes List

_(À remplir)_
- Pattern customType (Task 1) : ☐ Ré-import / ☐ Extrait dans `types/geometry.ts`
- Numéro de migration généré : `___`
- Index partiel `WHERE` généré auto par drizzle-kit ? : ☐ Oui / ☐ Non (édité manuellement)
- Écarts vs architecture détectés et synchronisés : `___`

### File List

- [ ] `packages/database/src/schema/accommodations-cache.ts` (modifié)
- [ ] `packages/database/src/schema/adventures.ts` (modifié)
- [ ] `packages/database/src/schema/profiles.ts` (modifié)
- [ ] `packages/database/src/types/geometry.ts` (créé si Task 1 décide refactor)
- [ ] `packages/database/migrations/{NNNN}_*.sql` (généré)
- [ ] `packages/database/migrations/meta/_journal.json` (généré)
- [ ] `packages/database/migrations/meta/{NNNN}_snapshot.json` (généré)
- [ ] `_bmad-output/planning-artifacts/architecture-poi-access-routing.md` (modifié — Doc Sync)
- [ ] `_bmad-output/planning-artifacts/epics-poi-access-routing.md` (modifié — Doc Sync)
