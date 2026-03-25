# Story 14.2: Node.js natif + PM2 en production

Status: ready-for-dev

## Story

En tant que **développeur déployant sur le VPS**,
je veux que Next.js et NestJS tournent comme des processus Node.js natifs gérés par PM2,
afin que le workflow de déploiement soit identique à ce qu'on ferait en local (`turbo build` + `pm2 start`) — sans Dockerfiles pour les apps.

## Acceptance Criteria

1. **Build unifié** — Étant donné que Node.js 22 LTS et pnpm sont installés sur le VPS, quand `pnpm install && turbo build` est exécuté depuis la racine du monorepo, alors `apps/web` et `apps/api` buildent tous les deux avec succès — identique au Mac du développeur.

2. **Next.js standalone** — Étant donné que `next.config.ts` a `output: 'standalone'` configuré, quand `turbo build` se termine pour `apps/web`, alors l'output standalone dans `apps/web/.next/standalone/` peut être démarré avec `node apps/web/.next/standalone/server.js`.

3. **ecosystem.config.js** — Étant donné qu'un fichier `ecosystem.config.js` existe à la racine du repo, quand `pm2 start ecosystem.config.js` est exécuté, alors deux processus sont gérés : `ridenrest-web` (Next.js standalone, port 3011) et `ridenrest-api` (NestJS `dist/main.js`, port 3010), les deux avec `restart: always` et rotation des logs.

4. **Redémarrage automatique après crash** — Étant donné qu'un processus Node.js crashe, quand PM2 détecte le crash, alors le processus est automatiquement redémarré dans les 5 secondes et le crash est loggué.

5. **Redémarrage au boot** — Étant donné que le VPS redémarre, quand le système démarre, alors PM2 est configuré comme service systemd (`pm2 startup`) afin que les deux apps redémarrent automatiquement.

6. **Script deploy.sh** — Étant donné qu'un fichier `deploy.sh` existe à la racine du repo, quand il est exécuté sur le VPS, alors il enchaîne `git pull` + `pnpm install` + `turbo build` + copie des assets statiques Next.js + `pm2 reload ecosystem.config.js --update-env`, sans downtime.

## Tasks / Subtasks

### Task 1 — Configurer `output: 'standalone'` dans next.config.ts
- [ ] 1.1 Ouvrir `apps/web/next.config.ts`
- [ ] 1.2 Ajouter `output: 'standalone'` dans la config Next.js
- [ ] 1.3 Vérifier que `turbo build` pour `apps/web` génère bien `apps/web/.next/standalone/server.js`

### Task 2 — Créer `ecosystem.config.js` à la racine du repo
- [ ] 2.1 Créer le fichier `ecosystem.config.js` avec la config PM2 pour les deux processus (voir Dev Notes pour le template complet)
- [ ] 2.2 Configurer `ridenrest-web` : script `apps/web/.next/standalone/server.js`, port 3011, `HOSTNAME: '0.0.0.0'`, `max_memory_restart: '512M'`
- [ ] 2.3 Configurer `ridenrest-api` : script `apps/api/dist/main.js`, port 3010, `max_memory_restart: '512M'`
- [ ] 2.4 Activer `log_date_format` sur les deux processus pour des logs lisibles

### Task 3 — Créer `deploy.sh` à la racine du repo
- [ ] 3.1 Créer `deploy.sh` avec les étapes dans l'ordre : `git pull`, `pnpm install --frozen-lockfile`, `turbo build`, copie assets statiques Next.js, `pm2 reload ecosystem.config.js --update-env`
- [ ] 3.2 Ajouter les copies obligatoires `public/` et `.next/static/` vers le dossier standalone (étape critique souvent oubliée)
- [ ] 3.3 Rendre le script exécutable (`chmod +x deploy.sh`)
- [ ] 3.4 Ajouter une variable `APP_DIR` en tête de script pour faciliter la configuration

### Task 4 — Documenter le workflow PM2 systemd (manuel, VPS uniquement)
- [ ] 4.1 Documenter dans les Dev Notes (ci-dessous) la séquence complète pour configurer PM2 au démarrage du système : `pm2 start`, `pm2 save`, `pm2 startup`
- [ ] 4.2 Préciser que la commande générée par `pm2 startup` doit être exécutée en tant que `sudo`

### Task 5 — Vérification locale du build standalone
- [ ] 5.1 Exécuter `turbo build` en local depuis la racine du monorepo
- [ ] 5.2 Vérifier l'existence de `apps/web/.next/standalone/server.js`
- [ ] 5.3 Tester le démarrage : `PORT=3011 HOSTNAME=0.0.0.0 node apps/web/.next/standalone/server.js` (avec variables d'env de dev)
- [ ] 5.4 Vérifier l'existence de `apps/api/dist/main.js` après build

## Dev Notes

### Fichiers à créer / modifier

| Fichier | Action | Description |
|---|---|---|
| `apps/web/next.config.ts` | Modifier | Ajouter `output: 'standalone'` |
| `ecosystem.config.js` | Créer | Config PM2 à la racine du repo |
| `deploy.sh` | Créer | Script de déploiement complet |

---

### 1. next.config.ts — `output: 'standalone'`

Le fichier actuel est vide (pas de config). Ajouter `output: 'standalone'` :

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

**Pourquoi standalone ?** Next.js en mode standalone génère un serveur Node.js autonome dans `.next/standalone/` avec uniquement les dépendances nécessaires (`node_modules` minimal). Cela évite d'avoir à copier l'intégralité des `node_modules` du projet sur le serveur de prod — le dossier standalone est auto-suffisant.

---

### 2. ecosystem.config.js — Config PM2 complète

```js
module.exports = {
  apps: [
    {
      name: 'ridenrest-web',
      script: 'apps/web/.next/standalone/server.js',
      cwd: '/home/deploy/ridenrest-app',
      env: {
        PORT: 3011,
        NODE_ENV: 'production',
        HOSTNAME: '0.0.0.0',
      },
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/pm2/ridenrest-web-error.log',
      out_file: '/var/log/pm2/ridenrest-web-out.log',
      merge_logs: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '5s',
    },
    {
      name: 'ridenrest-api',
      script: 'apps/api/dist/main.js',
      cwd: '/home/deploy/ridenrest-app',
      env: {
        PORT: 3010,
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/pm2/ridenrest-api-error.log',
      out_file: '/var/log/pm2/ridenrest-api-out.log',
      merge_logs: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '5s',
    },
  ],
};
```

**Notes importantes :**
- `cwd` est défini sur le chemin absolu du repo sur le VPS (`/home/deploy/ridenrest-app`). À ajuster si l'utilisateur ou le chemin diffère.
- `HOSTNAME: '0.0.0.0'` est **obligatoire** pour Next.js standalone — sans ça, le serveur écoute sur `localhost` uniquement et Caddy ne peut pas y accéder (même en local).
- Les variables secrètes (`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, etc.) ne doivent **pas** figurer dans ce fichier — elles sont chargées via le `.env` à la racine du repo, lues par `@nestjs/config` (NestJS) et par `next.config.ts` / le runtime Next.js. Le `.env` de production doit être créé manuellement sur le VPS (jamais commité).
- `max_restarts: 10` + `min_uptime: '5s'` évitent une boucle infinie de redémarrages si l'app crashe immédiatement au démarrage (ex: variable d'env manquante).
- `/var/log/pm2/` doit exister. Créer le dossier si nécessaire : `sudo mkdir -p /var/log/pm2 && sudo chown $USER /var/log/pm2`.

---

### 3. Gotcha critique — Assets statiques Next.js standalone

**ATTENTION : Le build standalone ne copie PAS automatiquement `public/` et `.next/static/`.**

Sans ces deux dossiers, l'app web démarre mais :
- Les assets publics (images, fonts, favicon) renvoient 404
- Les chunks JS/CSS client renvoient 404 — l'app est inutilisable

Il faut les copier manuellement après chaque build :

```bash
# Depuis la racine du monorepo
cp -r apps/web/public apps/web/.next/standalone/apps/web/public
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
```

Cette étape est **intégrée dans `deploy.sh`** (voir ci-dessous). Ne jamais l'oublier.

---

### 4. deploy.sh — Script de déploiement complet

```bash
#!/usr/bin/env bash
set -e

APP_DIR="/home/deploy/ridenrest-app"
cd "$APP_DIR"

echo "==> [1/5] git pull"
git pull origin main

echo "==> [2/5] pnpm install"
pnpm install --frozen-lockfile

echo "==> [3/5] turbo build"
pnpm turbo build

echo "==> [4/5] Copy Next.js standalone static assets"
cp -r apps/web/public apps/web/.next/standalone/apps/web/public
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

echo "==> [5/5] PM2 reload (zero-downtime)"
pm2 reload ecosystem.config.js --update-env

echo "==> Deploy done. pm2 status:"
pm2 status
```

**Points clés :**
- `set -e` : arrête le script à la première erreur — évite de déployer une version cassée.
- `--frozen-lockfile` : garantit la reproductibilité (n'installe que ce qui est dans `pnpm-lock.yaml`).
- `pm2 reload` (et non `pm2 restart`) : rechargement zero-downtime — PM2 démarre un nouveau worker et ne coupe le précédent qu'une fois le nouveau prêt.
- `--update-env` : force PM2 à relire les variables d'env (utile si `.env` a changé).
- Le script tire toujours depuis `main`. Pour déployer depuis une autre branche, modifier ou passer la branche en paramètre.

---

### 5. Workflow PM2 systemd — Démarrage automatique au boot

Séquence à exécuter **une seule fois** lors de la mise en place initiale sur le VPS :

```bash
# 1. Démarrer les apps pour la première fois
cd /home/deploy/ridenrest-app
pm2 start ecosystem.config.js

# 2. Vérifier que les deux processus sont online
pm2 status

# 3. Sauvegarder la liste des processus PM2
pm2 save

# 4. Configurer PM2 comme service systemd
pm2 startup
# → La commande affiche une ligne à copier-coller et exécuter en sudo, ex:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy

# 5. Exécuter la commande affichée par pm2 startup (avec sudo)
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy
```

Après cette configuration, PM2 démarre automatiquement au reboot du VPS et relance les deux apps.

**Vérification post-reboot :**
```bash
sudo reboot
# Après reconnexion SSH :
pm2 status   # les deux processus doivent être "online"
```

---

### 6. Variables d'environnement en production

PM2 ne charge pas nativement les fichiers `.env`. Les deux apps chargent leurs propres variables :

- **NestJS** (`apps/api`) : utilise `@nestjs/config` avec `ConfigModule.forRoot({ envFilePath: '.env' })` — lit le `.env` à la racine du process (`cwd`). Comme `cwd` est défini sur la racine du repo dans `ecosystem.config.js`, NestJS trouvera le `.env` à cet endroit.
- **Next.js** (`apps/web`) : charge automatiquement le `.env` à la racine de l'app lors du build. En mode standalone, les variables sont embarquées dans le build pour `NEXT_PUBLIC_*`. Les variables serveur sont lues au runtime depuis `process.env` (qui hérite de l'environnement du process PM2).

**Variables secrètes à définir dans `.env` sur le VPS (jamais commitées) :**
```bash
# PostgreSQL (Docker local — cf. story 14.1)
DATABASE_URL=postgresql://ridenrest:CHANGEME@localhost:5432/ridenrest

# Redis (Docker local — cf. story 14.1)
REDIS_URL=redis://localhost:6379

# Better Auth
BETTER_AUTH_SECRET=...  # générer avec: openssl rand -hex 32
BETTER_AUTH_URL=https://ridenrest.com

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...

# Next.js (public — embarqués dans le build)
NEXT_PUBLIC_API_URL=https://api.ridenrest.com
NEXT_PUBLIC_APP_URL=https://ridenrest.com
```

---

### 7. Optimisation Caddy — Servir les assets statiques directement (recommandé)

Par défaut, Next.js standalone sert les assets `/_next/static/*` via Node.js. Pour de meilleures performances, Caddy (configuré en story 14.1) peut les servir directement depuis le filesystem.

Ajouter dans le bloc `ridenrest.com` du Caddyfile :

```
# Servir les assets statiques directement (bypass Node.js)
handle_path /_next/static/* {
    root * /home/deploy/ridenrest-app/apps/web/.next/standalone/apps/web/.next/static
    file_server
}

# Le reste va vers Next.js
reverse_proxy localhost:3011
```

**Gain :** Caddy sert les fichiers statiques (JS, CSS, images) sans passer par Node.js — latence réduite, CPU épargné. Optionnel pour le MVP, recommandé en production stable.

---

### 8. NestJS — `dist/main.js`

NestJS utilise webpack pour bundler en un fichier unique `dist/main.js` via `nest build`. Le script `build` de `apps/api/package.json` est `"build": "nest build"` — c'est ce que `turbo build` exécute pour le package `@ridenrest/api`.

Le fichier de sortie est `apps/api/dist/main.js`. C'est ce chemin qui est référencé dans `ecosystem.config.js`.

**Vérification post-build :**
```bash
ls -lh apps/api/dist/main.js   # doit exister et avoir une taille > 0
```

---

### 9. Ce que cette story N'inclut PAS

- **CI/CD GitHub Actions** → story 14.5 (`deploy.sh` est invoqué par le pipeline CI, mais le pipeline lui-même est hors scope ici)
- **Provisionnement initial du VPS** (Node.js, pnpm, PM2 installation) → manuel, documenté dans Epic 14 intro
- **Migration des données** → story 14.7
- **Monitoring Uptime Kuma** → story 14.6
- **Backups PostgreSQL** → story 14.4
- **Environnement dev local** → story 14.3

---

### Project Structure Notes

```
ridenrest-app/                    ← racine du monorepo
├── ecosystem.config.js           ← CRÉÉ (story 14.2) — config PM2
├── deploy.sh                     ← CRÉÉ (story 14.2) — script de déploiement
├── apps/
│   ├── web/
│   │   ├── next.config.ts        ← MODIFIÉ (story 14.2) — output: 'standalone'
│   │   └── .next/
│   │       └── standalone/       ← généré par turbo build
│   │           └── server.js     ← point d'entrée Next.js en prod
│   └── api/
│       └── dist/
│           └── main.js           ← généré par turbo build (nest build)
```

### References

- [Next.js Standalone Output](https://nextjs.org/docs/pages/api-reference/config/next-config-js/output) — documentation officielle `output: 'standalone'`
- [PM2 Process Management](https://pm2.keymetrics.io/docs/usage/process-management/) — ecosystem.config.js, `pm2 reload`, `pm2 save`
- [PM2 Startup](https://pm2.keymetrics.io/docs/usage/startup/) — configuration systemd automatique
- Story 14.1 — Docker Compose infra (PostgreSQL :5432, Redis :6379, Caddy) — prérequis de cette story
- Story 14.5 — CI/CD GitHub Actions (consommateur de `deploy.sh`)
- `_bmad-output/memory/project_ports.md` — API :3010, Web :3011

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-03-25)

### Debug Log References

_Aucun debug log pour cette story — pas encore implémentée._

### Completion Notes List

_À remplir par le dev agent lors de l'implémentation._

### File List

Fichiers créés ou modifiés par cette story :

- `apps/web/next.config.ts` — ajout de `output: 'standalone'`
- `ecosystem.config.js` — créé à la racine du repo (config PM2)
- `deploy.sh` — créé à la racine du repo (script de déploiement VPS)
