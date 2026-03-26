# Story 14.5: CI/CD — Déploiement automatisé via GitHub Actions

Status: review

## Story

En tant que **développeur pushant sur la branche main**,
je veux un pipeline de déploiement automatisé qui se connecte au VPS via SSH et exécute `deploy.sh`,
afin que la production soit mise à jour sans intervention manuelle après chaque merge sur `main`.

## Acceptance Criteria

1. **Pipeline déclenché sur push main** — Étant donné qu'un push sur `main` déclenche le workflow GitHub Actions, quand le job CI passe (lint, build, test), alors le job deploy démarre automatiquement et se connecte au VPS via SSH.

2. **Déploiement via SSH + deploy.sh** — Étant donné que le job deploy tourne, quand la connexion SSH est établie, alors il exécute `bash /home/deploy/ridenrest-app/deploy.sh` — qui enchaîne `git pull` → `pnpm install` → `turbo build` → copy assets → migrations DB → `pm2 reload`.

3. **Migrations DB sur le VPS** — Étant donné que `deploy.sh` est mis à jour, quand le build est terminé, alors `pnpm --filter @ridenrest/database drizzle-kit migrate` est exécuté sur le VPS (qui a accès à PostgreSQL local), avant le `pm2 reload`.

4. **Fail-safe build** — Étant donné que le build ou les migrations échouent (erreur dans `deploy.sh`), quand `set -e` détecte l'erreur, alors le script s'arrête immédiatement — PM2 conserve les processus précédents en ligne, et le workflow GitHub Actions se termine en échec (rouge).

5. **PM2 online après déploiement** — Étant donné que `deploy.sh` se termine avec succès, quand `pm2 status` est affiché, alors `ridenrest-web` (port 3011) et `ridenrest-api` (port 3010) sont en status `online` avec uptime > 0.

6. **Secrets GitHub configurés** — Étant donné que les secrets GitHub Actions sont configurés, quand le job deploy tourne, alors il utilise uniquement : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` pour la connexion SSH. Les anciens secrets Vercel/Fly.io (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `FLY_API_TOKEN`, `DATABASE_URL`) ne sont plus référencés dans le workflow.

7. **CI build toujours fonctionnel** — Étant donné que le job CI (lint, build, test) reste inchangé pour l'essentiel, quand un PR est ouvert sur `main`, alors le CI tourne sans le job deploy (PRs → CI only, push main → CI + deploy).

## Tasks / Subtasks

### Task 1 — Mettre à jour `deploy.sh` pour inclure les migrations DB

- [x] 1.1 Ajouter l'étape migrations entre le build et le `pm2 reload` (step [5/6])
- [x] 1.2 Utiliser `pnpm --filter @ridenrest/database drizzle-kit migrate` (filtre Turborepo correct)
- [x] 1.3 Mettre à jour la numérotation des steps : de [1/5] → [6/5] à [1/6] → [6/6]
- [x] 1.4 Vérifier que `set -e` est toujours en première ligne (arrêt immédiat si erreur)

### Task 2 — Remplacer le job `deploy` dans `.github/workflows/ci.yml`

- [x] 2.1 Supprimer les steps Vercel (install vercel CLI + deploy web → Vercel)
- [x] 2.2 Supprimer les steps Fly.io (setup flyctl + flyctl deploy)
- [x] 2.3 Supprimer la step "Run DB migrations" du job deploy CI (migrations maintenant dans deploy.sh sur le VPS)
- [x] 2.4 Ajouter un step SSH unique avec `appleboy/ssh-action@v1.0.3` (pinned version, voir Dev Notes)
- [x] 2.5 Configurer le step SSH avec : `host: ${{ secrets.VPS_HOST }}`, `username: ${{ secrets.VPS_USER }}`, `key: ${{ secrets.VPS_SSH_KEY }}`
- [x] 2.6 Script SSH : `bash /home/deploy/ridenrest-app/deploy.sh`
- [x] 2.7 Supprimer les étapes Checkout, pnpm, Node.js, install dans le job deploy (le deploy.sh gère tout sur le VPS)
- [x] 2.8 Garder `needs: ci` et `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`

### Task 3 — Nettoyer les références aux anciens services dans ci.yml

- [x] 3.1 Retirer `DATABASE_URL: ${{ secrets.DATABASE_URL }}` du job deploy (DB est locale au VPS)
- [x] 3.2 Garder `BETTER_AUTH_SECRET` et `BETTER_AUTH_URL` dans le job CI build step (toujours requis pour le build Next.js)
- [x] 3.3 Vérifier que le job CI ne référence plus Vercel, Fly.io, Aiven

### Task 4 — Documenter les secrets GitHub Actions à configurer (manuel)

- [x] 4.1 Documenter dans les Dev Notes ci-dessous la liste complète des secrets à créer dans GitHub
- [x] 4.2 Documenter comment générer la clé SSH pour le deploy user (ed25519 recommandé)
- [x] 4.3 Documenter l'ajout de la clé publique dans `~/.ssh/authorized_keys` sur le VPS

## Dev Notes

### 1. `deploy.sh` — Version mise à jour (avec migrations)

```bash
#!/usr/bin/env bash
set -e

APP_DIR="/home/deploy/ridenrest-app"
cd "$APP_DIR"

echo "==> [1/6] git pull"
git pull origin main

echo "==> [2/6] pnpm install"
pnpm install --frozen-lockfile

echo "==> [3/6] turbo build"
pnpm turbo build

echo "==> [4/6] Copy Next.js standalone static assets"
cp -rf apps/web/public apps/web/.next/standalone/apps/web/public
cp -rf apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

echo "==> [5/6] DB migrations (drizzle-kit)"
( cd packages/database && pnpm drizzle-kit migrate )

echo "==> [6/6] PM2 reload (zero-downtime)"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js

echo "==> Deploy done. pm2 status:"
pm2 status
```

**Pourquoi les migrations dans `deploy.sh` et non dans GitHub Actions ?**
PostgreSQL tourne sur `localhost:5432` du VPS — inaccessible depuis les runners GitHub Actions (réseau externe). Les migrations DOIVENT s'exécuter depuis le VPS lui-même. C'est un changement d'architecture par rapport à l'ancien setup où Aiven était accessible depuis partout.

**Pourquoi `( cd packages/database && pnpm drizzle-kit migrate )` avec les parenthèses ?**
Les parenthèses créent un subshell — le `cd` n'affecte pas le répertoire courant du script parent. Après l'étape migrations, on reste dans `$APP_DIR`.

**`NODE_TLS_REJECT_UNAUTHORIZED=0` supprimé intentionnellement** — Cette variable était nécessaire avec Aiven (SSL auto-signé). Avec PostgreSQL Docker local (pas de SSL, connexion localhost), elle n'est plus nécessaire et serait une vulnérabilité inutile.

---

### 2. `.github/workflows/ci.yml` — Version finale

```yaml
name: CI / CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  PNPM_VERSION: '10.32.1'
  NODE_VERSION: '22'

jobs:
  # ─────────────────────────────────────────────────────
  # Job 1: CI — Lint + Build + Test (ALL pushes + PRs)
  # ─────────────────────────────────────────────────────
  ci:
    name: Lint, Build & Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2   # Turborepo needs git history for diff-based caching

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm turbo run lint --filter='*'

      - name: Build
        run: pnpm turbo run build --filter='*'
        env:
          BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET }}
          BETTER_AUTH_URL: ${{ secrets.BETTER_AUTH_URL }}

      - name: Test
        run: pnpm turbo run test --filter='*'

  # ─────────────────────────────────────────────────────
  # Job 2: Deploy — SSH vers VPS → deploy.sh
  # Only runs on push to main (not PRs) after CI passes
  # ─────────────────────────────────────────────────────
  deploy:
    name: Deploy to VPS
    runs-on: ubuntu-latest
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: bash /home/deploy/ridenrest-app/deploy.sh
```

---

### 3. Secrets GitHub Actions — Configuration manuelle (Settings → Secrets and variables → Actions)

**Secrets à CONSERVER (toujours actifs) :**
| Secret | Usage | Valeur |
|---|---|---|
| `BETTER_AUTH_SECRET` | Build Next.js (CI job) | Secret Better Auth (même que `.env` prod) |
| `BETTER_AUTH_URL` | Build Next.js (CI job) | `https://ridenrest.app` |

**Secrets à AJOUTER (nouveaux) :**
| Secret | Usage | Valeur |
|---|---|---|
| `VPS_HOST` | SSH deploy | IP ou domaine du VPS (ex: `123.456.789.0` ou `ridenrest.app`) |
| `VPS_USER` | SSH deploy | Utilisateur SSH sur le VPS (ex: `deploy`) |
| `VPS_SSH_KEY` | SSH deploy | Clé privée SSH au format PEM (voir ci-dessous) |

**Secrets à SUPPRIMER (obsolètes après migration) :**
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `FLY_API_TOKEN`
- `DATABASE_URL` (DB n'est plus accessible depuis les runners CI)

---

### 4. Génération de la clé SSH pour le deploy (recommandé : ed25519)

```bash
# Sur le MAC du développeur — générer une clé dédiée au CI/CD
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/ridenrest_deploy_ci

# Afficher la clé publique → à copier sur le VPS
cat ~/.ssh/ridenrest_deploy_ci.pub

# Afficher la clé privée → à copier dans GitHub Secret VPS_SSH_KEY
cat ~/.ssh/ridenrest_deploy_ci
```

```bash
# Sur le VPS (SSH manuellement) — ajouter la clé publique
echo "ssh-ed25519 AAAA... github-actions-deploy" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

**Important :** Coller la clé privée **complète** dans le secret `VPS_SSH_KEY`, incluant les lignes `-----BEGIN OPENSSH PRIVATE KEY-----` et `-----END OPENSSH PRIVATE KEY-----`.

---

### 5. `appleboy/ssh-action` — Version pinned

Toujours pinner une version exacte pour les GitHub Actions (sécurité supply chain) :
- `appleboy/ssh-action@v1.0.3` — version stable, active en mars 2026
- **Ne jamais utiliser** `@master` ou `@latest` pour des actions de déploiement
- Vérifier les releases sur : https://github.com/appleboy/ssh-action/releases

---

### 6. Comportement fail-safe du pipeline

```
Push main
    ↓
[CI job] lint → build → test
    ↓ (si échec → pipeline rouge, deploy NE tourne PAS)
[Deploy job] SSH → deploy.sh
    ├── git pull ← si échec → set -e arrête le script
    ├── pnpm install ← si échec → set -e arrête
    ├── turbo build ← si échec → set -e arrête, PM2 garde l'ancienne version
    ├── copy assets ← si échec → set -e arrête
    ├── drizzle-kit migrate ← si échec → set -e arrête, PM2 garde l'ancienne version
    └── pm2 reload ← seulement si tout a réussi
```

**Point critique :** `set -e` dans `deploy.sh` garantit que PM2 n'est rechargé QUE si tout s'est passé sans erreur. En cas d'échec du build ou des migrations, l'ancienne version reste en production.

---

### 7. Ce que cette story N'inclut PAS

- **Suppression de `apps/api/fly.toml` et `apps/api/Dockerfile`** → story 14.7 (décommissionnement)
- **Migration des données Aiven → VPS** → story 14.7
- **Monitoring Uptime Kuma** → story 14.6
- **Backups PostgreSQL** → story 14.4
- **Provisionnement SSH sur le VPS** (création user `deploy`, config sudo, etc.) → manuel, documenté dans Epic 14 intro

---

### Project Structure Notes

```
ridenrest-app/
├── deploy.sh                         ← MODIFIÉ — ajout step migrations [5/6]
└── .github/
    └── workflows/
        └── ci.yml                    ← MODIFIÉ — job deploy remplacé (SSH VPS)
```

Aucune modification au code applicatif (`apps/`, `packages/`) dans cette story.

### References

- Story 14.1 — Docker Compose infra (PostgreSQL :5432, Redis :6379, Caddy) — prérequis
- Story 14.2 — `deploy.sh` et `ecosystem.config.js` créés — base de cette story
- `appleboy/ssh-action` : https://github.com/appleboy/ssh-action
- [GitHub Actions Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- `_bmad-output/memory/project_ports.md` — API :3010, Web :3011
- `project-context.md#VPS Deployment Config` — architecture hybride Docker+PM2

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ✅ `deploy.sh` : 5 steps → 6 steps, ajout migrations drizzle-kit en [5/6] via subshell `( cd packages/database && pnpm drizzle-kit migrate )`. `set -e` conservé en ligne 2.
- ✅ `.github/workflows/ci.yml` : job deploy entièrement remplacé — suppression Vercel, Fly.io, DB migrations CI, Checkout/Node/pnpm/install. Remplacement par step SSH unique `appleboy/ssh-action@v1.0.3` avec secrets `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY`.
- ✅ `BETTER_AUTH_SECRET` et `BETTER_AUTH_URL` conservés dans le job CI (build Next.js).
- ✅ Task 4 : documentation secrets/SSH déjà présente dans Dev Notes sections 3 et 4 — validée complète.
- ℹ️ Pas de tests automatisés écrits : les fichiers `.yml` et `.sh` sont des configs CI/CD dont la validation se fait à l'exécution. Validation structurelle effectuée via script Node.js.

### File List

- `deploy.sh`
- `.github/workflows/ci.yml`
