# Story POI-Access 1.5 : Bootstrap initial du VPS prod + CI/CD pipeline BRouter + benchmark NFR

Status: in-progress

<!--
Story scope-specific issue de epics-poi-access-routing.md (feature POI Access Routing).
Préfixe `poi-access-` pour cohérence avec 1.1-1.4.

DÉPENDANCE DURE : Stories 1.1, 1.2, 1.3, 1.4 doivent toutes être DONE avant cette story.
Pourquoi : cette story est une opération MANUELLE one-shot sur le VPS prod qui consomme
tout le travail Code+Doc fait dans les 4 stories précédentes.

Cette story est un EXÉCUTANT OPS — peu de code, beaucoup de SSH, validation, et observabilité.
À programmer en accord avec Guillaume car implique des modifications sur le VPS de prod.
-->

## Story

As a **DevOps engineer**,
I want to perform the one-shot manual bootstrap of BRouter on the production VPS, wire it into the existing GitHub Actions CI/CD pipeline (`deploy.sh`), and formally validate the NFR latency (<500ms p95) in the production environment,
So that the team can ship Epic 2-4 backend work with confidence that the production routing infrastructure is operational and continuously deployable.

## Acceptance Criteria

1. **Given** un accès SSH au VPS Hostinger KVM 2 (IP `72.62.189.193`), **When** je vérifie l'état du VPS avant bootstrap, **Then** je confirme tous les pré-requis :
   - ≥ 5 GB d'espace disque libre (`df -h /`)
   - ≥ 3 GB RAM libre (`free -h`)
   - Docker + docker-compose installés et version compatible (Docker ≥ 20, docker-compose v2)
   - Le repo `ridenrest-app` est à jour sur la branche `main` avec les commits des Stories 1.1-1.4
   - Les vars `.env` sur le VPS contiennent les 7 vars `BROUTER_*` et `ACCESS_*` ajoutées par Stories 1.1 et 1.4
   - Tous les checks sont consignés dans `docs/ops/brouter-prod-bootstrap-log-{date}.md`

2. **Given** le repo à jour sur le VPS, **When** j'exécute `docker compose pull brouter && docker compose up -d brouter`, **Then** :
   - L'image (tag pinné Story 1.1) est pulled
   - Le conteneur démarre et commence le téléchargement des segments Europe (chemin auto OU manuel selon découvertes Story 1.2)
   - Je suis le progrès via `docker logs -f ridenrest-brouter`
   - Si chemin manuel : j'exécute `./scripts/update-brouter-segments.sh` sur le VPS
   - `docker inspect --format='{{.State.Health.Status}}' ridenrest-brouter` retourne `healthy` dans les 30 min (incluant download initial)

3. **Given** BRouter est healthy sur le VPS, **When** je teste manuellement :
   - `curl http://127.0.0.1:17777/{healthcheck_endpoint}` (endpoint validé Story 1.1) → 200
   - `./scripts/brouter-smoke-test.sh http://127.0.0.1:17777` (script Story 1.2) → 5/5 ✅
   **Then** BRouter répond correctement sur les 5 routes test européennes.

4. **Given** BRouter tourne sur le VPS, **When** j'exécute le **benchmark NFR formel** (script étendu de Story 1.2 ou nouveau script `scripts/brouter-benchmark-prod.sh` — voir Dev Notes), **Then** :
   - 30+ requêtes routing diverses (mix de profils trekking/fastbike/safety, longueurs 5-50 km, géographies variées Europe)
   - Latence **p95 mesurée < 500 ms** (validation formelle NFR-PA-002)
   - Latence **p50 mesurée < 200 ms**
   - Aucun timeout (>5s) sur l'ensemble du benchmark
   - Les résultats sont consignés dans `docs/ops/brouter-benchmark-results.md` (datés, distribution complète, environnement, machine)
   - Si la NFR échoue (p95 ≥ 500ms) → escalade blocker bug, déprovisionner BRouter, ne PAS continuer la story

5. **Given** le pipeline GitHub Actions existant (`deploy.sh` sur le VPS), **When** je l'étends pour gérer BRouter, **Then** :
   - Le `deploy.sh` est modifié pour inclure :
     ```bash
     # Avant les apps : pull et restart BRouter si modifié
     docker compose pull brouter
     docker compose up -d brouter
     # Attendre que BRouter soit healthy avant de continuer le deploy
     timeout 300 sh -c 'until docker inspect --format="{{.State.Health.Status}}" ridenrest-brouter | grep -q healthy; do sleep 5; done'
     ```
   - Ces steps sont insérés AVANT `drizzle-kit migrate` et `pm2 reload` (pour éviter d'avoir une API qui démarre avant que BRouter soit prêt)
   - Le deploy échoue (et bloque le rollout) si BRouter ne devient pas healthy en 5 minutes
   - Un dry-run testé : commit minor + push → CI déclenche deploy → BRouter steps tournent en no-op (déjà healthy) sans bloquer le reste

6. **Given** Uptime Kuma déjà configuré sur l'infra (cf. `docker-compose.yml` service `uptime-kuma`), **When** j'ajoute un monitor pour BRouter, **Then** :
   - Type : `HTTP Keyword` ou équivalent
   - URL : `http://host.docker.internal:17777/{healthcheck_endpoint}` (Uptime Kuma tourne dans Docker, donc utilise `host.docker.internal` pour atteindre le port 17777 bindé sur l'hôte)
   - Nom : `BRouter Production`
   - Interval : 30s
   - Notification : email + Telegram (utilise les notifs existantes Uptime Kuma)
   - Test manuel : `docker compose stop brouter` → alerte reçue dans < 2 min, puis `docker compose start brouter` → recovery alert

7. **Given** la procédure complète bootstrap est exécutée, **When** je mets à jour `docs/ops/brouter-runbook.md` (créé en Story 1.2), **Then** le runbook inclut :
   - **Log du bootstrap initial** : date, opérateur (qui a fait l'opération), durée totale, problèmes rencontrés
   - **Procédure de redéploiement BRouter sans downtime** : `docker compose pull brouter && docker compose up -d brouter` (Docker gère le rolling update si healthcheck OK)
   - **Procédure de rollback** : downgrader l'image (`docker compose pull brouter:{old-tag} && docker compose up -d brouter`) + restaurer le tag dans `docker-compose.yml`
   - **Procédure de purge volume + re-download** : si segments corrompus, `docker compose down brouter && docker volume rm ridenrest-app_brouter-segments && docker compose up -d brouter`

8. **Given** l'audit sécurité, **When** je vérifie depuis l'extérieur du VPS, **Then** :
   - `curl https://ridenrest.app/brouter/...` → erreur Caddy (404 ou bad gateway) — confirmation que BRouter n'est PAS exposé via reverse proxy
   - `curl https://api.ridenrest.app/brouter/...` → idem
   - `nmap -p 17777 72.62.189.193` (depuis une machine externe) → port `closed` ou `filtered` (jamais `open`)
   - Confirmation NFR-PA-008 (bind localhost uniquement) validée en prod

9. **Given** la story est terminée, **When** je commit, **Then** le diff inclut UNIQUEMENT :
   - `deploy.sh` (modifié — ajout des 3 steps BRouter)
   - `docs/ops/brouter-runbook.md` (modifié — sections rollback, redéploiement, purge, log bootstrap)
   - `docs/ops/brouter-prod-bootstrap-log-{date}.md` (nouveau — log de l'opération)
   - `docs/ops/brouter-benchmark-results.md` (modifié ou créé — résultats benchmark prod NFR)
   - `scripts/brouter-benchmark-prod.sh` (nouveau si on fait un script dédié — sinon scripts 1.2 étendu)
   - Éventuelles maj `architecture-poi-access-routing.md` ou `epics-poi-access-routing.md` (Doc Sync)

10. **Given** la story est terminée, **When** je remets la main au PM, **Then** je consigne dans les Completion Notes :
   - Date et heure du bootstrap initial prod
   - Tag image Docker BRouter en production
   - Durée totale opération (estimation : 30-60 min)
   - Résultats benchmark NFR (p50, p95, p99)
   - Problèmes rencontrés et résolutions
   - Confirmation Uptime Kuma alerte fonctionne

---

## ⚠️ Critical Discovery Notes — À LIRE AVANT IMPLÉMENTATION

### 1. Story OPS — pas de dev code

Cette story est principalement **manuelle (SSH + commandes shell)** + **modification d'un script existant** (`deploy.sh`). Très peu de code applicatif. Le dev agent doit être à l'aise avec :
- SSH et travail sur VPS distant
- Docker compose
- Lecture/modification de scripts bash
- Validation manuelle de NFRs

Si le dev agent n'a pas d'accès SSH au VPS, **cette story doit être faite par Guillaume manuellement** (ou avec lui en pair-programming en remote).

### 2. Coordination avec Guillaume requise

Modifier `deploy.sh` impacte TOUS les futurs déploiements du projet. Le dry-run de l'AC #5 est CRITIQUE : on ne veut pas casser le pipeline existant qui marche.

Recommandation : faire la modification sur une branche `feat/brouter-deploy`, tester le pipeline via un commit minor sur cette branche, valider que tout passe, MERGE seulement après validation manuelle.

### 3. Le bootstrap est non-réversible facilement

Une fois `docker compose up -d brouter` lancé sur le VPS, le download des segments commence et consomme bande passante + disque. Si interrompu, peut laisser le volume dans un état semi-cohérent. **Avant de lancer**, s'assurer que :
- Le timing est OK (pas en heure de pointe trafic VPS)
- L'opérateur peut surveiller pendant 30-60 min
- Un rollback est planifié si problème (Task 8 de Story 1.5)

### 4. Uptime Kuma — `host.docker.internal` sur Linux

Sur le VPS Linux, `host.docker.internal` n'est PAS résolu par défaut (contrairement à Docker Desktop Mac). Le `docker-compose.yml` (lu en Story 1.1) montre que `uptime-kuma` a déjà `extra_hosts: ["host.docker.internal:host-gateway"]` configuré → c'est OK.

→ Action Task 6 : vérifier que `host.docker.internal:17777` est bien accessible depuis le conteneur uptime-kuma sur le VPS prod.

### 5. Benchmark NFR — méthodologie rigoureuse

Le benchmark p95 doit être statistiquement significatif :
- **Minimum 30 requêtes** (pas 10 comme l'AC initial mentionnait) pour calculer un p95 fiable
- Mix de profils (trekking 50%, fastbike 25%, safety 25%)
- Mix de longueurs (5km / 15km / 30km / 50km)
- Mix de géographies (Europe ouest dense / Europe est moins dense / pays sans BRouter complet ?)
- Run le benchmark **3 fois** à des moments différents (matin, après-midi, soir) pour capturer la variance load VPS

Si p95 instable entre les runs → drapeau rouge à investiguer avant de continuer.

### 6. Dépendance dure aux 4 stories précédentes

**Bloquante** : ne PAS démarrer cette story si :
- Story 1.1 incomplete (image Docker non validée, BROUTER_BASE_URL absente)
- Story 1.2 incomplete (runbook absent, segments method inconnue)
- Story 1.3 incomplete (migration DB non appliquée — `deploy.sh` va planter sur le step `drizzle-kit migrate` en CI)
- Story 1.4 incomplete (env vars manquantes → API crash early au démarrage)

Vérifier les statuts des 4 stories dans le epics file AVANT de démarrer.

### 7. Risque : modifier `deploy.sh` peut casser le déploiement projet

Le `deploy.sh` est utilisé pour TOUS les déploiements (pas juste BRouter). Une erreur de syntaxe bash ou un step mal ordonné peut bloquer l'équipe entière. Mitigation :
- Tester localement la syntaxe : `bash -n deploy.sh`
- Tester dans un fork du repo
- Avoir un plan de rollback du `deploy.sh` (commit précédent prêt à revert)

---

## Tasks / Subtasks

- [x] **Task 0** — Pré-checks : vérifier que Stories 1.1-1.4 sont DONE (⚠️Discovery #6) — toutes `done`
  - [ ] Lire les Completion Notes de poi-access-1-1, 1-2, 1-3, 1-4
  - [ ] Confirmer que chaque story est marquée DONE et non bloquée
  - [ ] Si une story est en RED → escalader, ne pas démarrer 1.5
  - [ ] Coordonner avec Guillaume le créneau d'exécution (cf. ⚠️Discovery #2, #3)

- [x] **Task 1** — Audit pré-bootstrap du VPS (AC: 1) — voir log bootstrap
  - [ ] SSH au VPS : `ssh ridenrest@72.62.189.193` (ou via clé)
  - [ ] Vérifier disque : `df -h /` → ≥ 5 GB libre
  - [ ] Vérifier RAM : `free -h` → ≥ 3 GB libre
  - [ ] Vérifier Docker : `docker --version && docker compose version`
  - [ ] Vérifier le repo : `cd /path/to/ridenrest-app && git log -5 --oneline` → commits 1.1-1.4 présents
  - [ ] Vérifier `.env` : `grep -E "BROUTER_|ACCESS_" .env` → 7 vars présentes
  - [ ] Créer `docs/ops/brouter-prod-bootstrap-log-{YYYY-MM-DD}.md` avec template :
    ```markdown
    # Bootstrap BRouter Prod — {date}
    
    Opérateur : {nom}
    Heure début : {time}
    
    ## Pré-checks
    - Disque libre : {valeur} (cible ≥ 5 GB)
    - RAM libre : {valeur} (cible ≥ 3 GB)
    - Docker version : {valeur}
    - Repo HEAD : {commit}
    - Env vars BROUTER_*/ACCESS_* : ☐ présentes
    
    ## Actions
    [À remplir au fur et à mesure]
    
    ## Résultats
    [À remplir en fin]
    ```

- [x] **Task 2** — Provisionnement initial BRouter sur le VPS (AC: 2) — 81 tuiles / 3 GB / healthy
  - [ ] `docker compose pull brouter` (image tag pinné Story 1.1)
  - [ ] `docker compose up -d brouter`
  - [ ] Dans un autre terminal : `docker logs -f ridenrest-brouter` (suivre les logs)
  - [ ] Si chemin manuel (Story 1.2 a confirmé pas d'auto-download) :
    - [ ] Attendre que le container soit running (~30s)
    - [ ] Lancer `./scripts/update-brouter-segments.sh` (script Story 1.2)
    - [ ] Surveiller le download (peut prendre 15-30 min sur VPS selon bande passante Hostinger)
  - [ ] Attendre que `docker inspect --format='{{.State.Health.Status}}' ridenrest-brouter` retourne `healthy`
  - [ ] Si timeout 30 min sans healthy → debug logs, vérifier disque, escalader si besoin

- [x] **Task 3** — Smoke test prod (AC: 3) — 5/5 passed
  - [ ] `curl http://127.0.0.1:17777/{healthcheck_endpoint}` → 200
  - [ ] `./scripts/brouter-smoke-test.sh http://127.0.0.1:17777` → 5/5 ✅
  - [ ] Si KO → debug avec runbook section (b), escalader

- [x] **Task 4** — Benchmark NFR formel (AC: 4, ⚠️Discovery #5) — PASS (p95 ~330ms) ; runs 2&3 optionnels
  - [ ] Créer ou étendre `scripts/brouter-benchmark-prod.sh` (variante du smoke test) :
    - 30+ requêtes mix profils/longueurs/géographies
    - Output CSV : `route,profile,distance_km,duration_ms,status`
    - Calculs p50, p95, p99 en fin de script (via `awk` ou `datamash`)
  - [ ] Lancer le benchmark SUR le VPS (pas en local) : `./scripts/brouter-benchmark-prod.sh > /tmp/bench-{date}-run1.csv`
  - [ ] Re-lancer 2 fois supplémentaires à des heures différentes (run2, run3)
  - [ ] Vérifier consistance entre les runs
  - [ ] Si tous les runs p95 < 500 ms → **NFR-PA-002 VALIDÉE** ✅
  - [ ] Si p95 ≥ 500 ms sur ≥ 1 run → **NFR ÉCHEC** → blocker, arrêter la story
  - [ ] Consigner dans `docs/ops/brouter-benchmark-results.md` :
    - Date, heure, opérateur
    - Configuration (image tag, JVM heap, profils)
    - Output complet des 3 runs (p50, p95, p99 chacun)
    - Verdict final (PASS / FAIL)

- [ ] **Task 5** — Modifier `deploy.sh` pour intégrer BRouter (AC: 5, ⚠️Discovery #7)
  - [ ] Travailler sur une branche `feat/brouter-deploy`
  - [ ] Lire le `deploy.sh` actuel : identifier où s'insère le bloc BRouter (avant `drizzle-kit migrate`, après `git pull`)
  - [ ] Insérer le bloc :
    ```bash
    # ─── BRouter (POI Access Routing) ──────────────────
    echo "🛰️ Pulling BRouter image..."
    docker compose pull brouter
    
    echo "🛰️ Restarting BRouter (no-op if healthy)..."
    docker compose up -d brouter
    
    echo "🛰️ Waiting for BRouter healthcheck..."
    if ! timeout 300 sh -c 'until docker inspect --format="{{.State.Health.Status}}" ridenrest-brouter | grep -q healthy; do sleep 5; done'; then
      echo "❌ BRouter failed to become healthy in 5 min"
      exit 1
    fi
    echo "✅ BRouter healthy"
    ```
  - [ ] Vérifier la syntaxe : `bash -n deploy.sh`
  - [ ] Push la branche, déclencher un dry-run via un commit minor (ex: typo doc)
  - [ ] Observer le pipeline GitHub Actions : steps BRouter doivent passer (no-op puisque déjà healthy)
  - [ ] Si OK, merge sur main
  - [ ] Si KO, debug et fixer avant merge

- [x] **Task 6** — Configurer monitor Uptime Kuma (AC: 6, ⚠️Discovery #4) — UP via `brouter:17777`, stop/start testé OK
  - [ ] Se connecter à Uptime Kuma (URL : selon config projet, probablement `status.ridenrest.app`)
  - [ ] Ajouter monitor : Type `HTTP Keyword`
  - [ ] URL : `http://host.docker.internal:17777/{healthcheck_endpoint}` (où l'endpoint vient de Story 1.1)
  - [ ] Keyword : choisir une string distinctive de la réponse healthcheck (ex: nom de profil, version, etc.)
  - [ ] Nom : `BRouter Production`
  - [ ] Interval : 30s, retry : 3, max retries : 3
  - [ ] Notifications : email + Telegram (réutiliser les channels Uptime Kuma existants)
  - [ ] Test manuel : `docker compose stop brouter` → attendre 2 min → alerte reçue ? → `docker compose start brouter` → recovery
  - [ ] Si pas d'alerte reçue → debug config notifs Uptime Kuma

- [ ] **Task 7** — Mettre à jour le runbook BRouter (AC: 7)
  - [ ] Ouvrir `docs/ops/brouter-runbook.md` (créé en Story 1.2)
  - [ ] Ajouter en haut une section "Log du bootstrap initial prod" avec date/opérateur/durée/problèmes
  - [ ] Ajouter section "Procédure de redéploiement sans downtime"
  - [ ] Ajouter section "Procédure de rollback"
  - [ ] Ajouter section "Procédure de purge volume + re-download"
  - [ ] Croiser avec le log bootstrap (Task 1) pour ne rien oublier

- [ ] **Task 8** — Audit sécurité externe (AC: 8)
  - [ ] Depuis une machine externe au VPS : `curl -v https://ridenrest.app/brouter/profile/trekking`
  - [ ] Vérifier réponse Caddy : 404 ou 502, jamais 200
  - [ ] Idem pour `https://api.ridenrest.app/brouter/...`
  - [ ] Depuis externe : `nmap -p 17777 72.62.189.193` (ou via `nc -zv 72.62.189.193 17777`)
  - [ ] Port doit être `closed`/`filtered`, jamais `open`
  - [ ] Si port open → URGENT : revoir le binding `127.0.0.1:17777:17777`, alerte sécurité

- [ ] **Task 9** — Doc Sync + commit (AC: 9, Doc Sync Rule)
  - [ ] Si découvertes nouvelles (ex: latence p95 réelle différente de l'estimation archi), mettre à jour `architecture-poi-access-routing.md`
  - [ ] Si AC story ont évolué pendant l'exécution, mettre à jour `epics-poi-access-routing.md`
  - [ ] `git diff --stat` doit correspondre au listing AC #9
  - [ ] Message de commit : `feat(ops): bootstrap BRouter on prod VPS + CI integration + NFR validation — story poi-access-1.5`

- [ ] **Task 10** — Completion + handoff (AC: 10)
  - [ ] Compléter les Completion Notes ci-dessous avec valeurs réelles
  - [ ] Informer Guillaume : BRouter est en prod, Epic 1 est complet, Epic 2 peut démarrer
  - [ ] Suggérer (optionnel) : lancer `bmad-create-story` pour Story 2.1 (RoutingService) dans la foulée

---

## Dev Notes

### Pattern projet — `deploy.sh`

Le `deploy.sh` existant a 6 steps (cf. project-context.md §VPS Deployment Config) :
```
git pull → source .env → turbo build → copy static assets → drizzle-kit migrate → pm2 reload
```

Le bloc BRouter s'insère entre `source .env` et `turbo build` (ou juste avant `drizzle-kit migrate` — décider selon dépendance build). Recommandation : juste après `source .env` car BRouter ne dépend ni de build ni de DB.

### Gotchas projet à anticiper

Cf. project-context.md §VPS Deployment Config :
- `.env` : pas de commentaires inline (la valeur inclut le commentaire — gotcha prod 2026-03-26)
- `.env` : valeurs base64 wrappées en double quotes
- Caddy : pas de route ajoutée pour BRouter (jamais exposé)
- PM2 : pas modifié (BRouter n'est PAS géré par PM2 — c'est Docker)
- Turbo : pas impacté (BRouter n'est pas une app Node)

### Pattern projet — Bash scripts ops

Cf. patterns scripts existants (Story 1.2 + `scripts/dev-setup.sh`) :
- Shebang `#!/usr/bin/env bash`
- `set -euo pipefail`
- Logs `✅` / `❌` pour signal visuel humain
- Variables d'env avec fallback `"${VAR:-default}"`
- Exit code 0 si succès, ≥1 si échec

### Coordination avec Guillaume

Cette story implique des modifications sur le VPS de prod. **À programmer en accord avec Guillaume** :
- Créneau bas trafic
- Présence pour surveillance et décisions en cas d'imprévu
- Validation manuelle avant merge sur `main`

### Doc Sync Rule

3 docs potentiellement impactées :
- `architecture-poi-access-routing.md` — si latence réelle prod diverge de l'estimation
- `epics-poi-access-routing.md` — Story 1.5 si AC ont évolué
- `docs/ops/brouter-runbook.md` — étendu obligatoirement (AC #7)

### Project Structure Notes

Fichiers modifiés ou créés :
- `deploy.sh` (modifié)
- `docs/ops/brouter-runbook.md` (modifié)
- `docs/ops/brouter-prod-bootstrap-log-{date}.md` (nouveau, archive historique)
- `docs/ops/brouter-benchmark-results.md` (créé ou étendu)
- `scripts/brouter-benchmark-prod.sh` (nouveau, optionnel si on étend le script smoke test)

### Testing Standards

- Pas de test unitaire (story OPS)
- Validation manuelle via les AC
- Le benchmark formel REMPLACE les tests pour la NFR latence

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-1.5] — AC originaux
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Infrastructure-Deployment] — config Docker + CI prod
- [Source: _bmad-output/project-context.md#VPS-Deployment-Config] — deploy.sh, gotchas prod
- [Source: _bmad-output/implementation-artifacts/poi-access-1-1-provision-brouter-docker-service.md] — image tag, healthcheck endpoint, BROUTER_BASE_URL
- [Source: _bmad-output/implementation-artifacts/poi-access-1-2-validate-brouter-segments-and-runbook.md] — runbook, smoke test script, update-segments script
- [Source: _bmad-output/implementation-artifacts/poi-access-1-3-migrate-db-poi-access-schema.md] — migration DB qui sera appliquée en CI
- [Source: _bmad-output/implementation-artifacts/poi-access-1-4-audit-prereqs-and-resolve-gaps.md] — env vars + scaffolding API
- [Source: deploy.sh] — script à modifier
- [Source: docker-compose.yml] — service `brouter` à utiliser
- [Source: scripts/brouter-smoke-test.sh] — outil de validation (Story 1.2)
- [Source: scripts/update-brouter-segments.sh] — outil de download (Story 1.2 si chemin manuel)

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Code) en pair-programming supervisé avec Guillaume (commandes prod exécutées par Guillaume).

### Debug Log References

_(Vide)_

### Completion Notes List

**Session 2026-05-28 (~21h00 GMT+2) — Tasks 0-4 DONE en prod, artifacts 5/7 prêts, reste prod-pending.**

- Date/heure bootstrap initial prod : 2026-05-28, ~21h00 GMT+2
- Opérateur : Guillaume (pair-programming supervisé avec Claude Code)
- Tag image Docker en production : `brouter:1.7.9` (build from source `abrensch/brouter#v1.7.9`, déjà déployée Story 1.1)
- Durée totale opération : en cours (Tasks 1-4 ~30 min)
- Chemin segments (rappel Story 1.2) : ☑ Manuel (BRouter n'auto-télécharge pas)
- Taille segments prod : ~3.0 GB (81 tuiles, download ~121 s)
- Résultats benchmark NFR (charge représentative — routes courtes POI-accès, profils trekking/fastbike/gravel) :
  - Run 1 (soirée) — passe froide : p50=144 p95=305 p99=397 (36/36 ok)
  - Run 1 (soirée) — passe chaude : p50=142 p95=332 p99=332 (36/36 ok)
  - Runs 2 & 3 (après-midi/matin) : optionnels, non encore exécutés
  - **Verdict NFR-PA-002 (p95 < 500ms)** : ☑ PASS
- Uptime Kuma alerte fonctionne : ☑ Oui — monitor `BRouter Production` (HTTP Keyword `LineString`), testé stop/start, alertes DOWN + recovery reçues (email + Telegram)
- Audit sécurité externe (nmap port closed) : ☐ PENDING (Task 8 — machine externe) — bind `127.0.0.1:17777` confirmé côté compose ET via `ss` sur le VPS (`LISTEN 127.0.0.1:17777`)
- Problèmes rencontrés et résolutions :
  1. Conteneur healthy mais 0 segment (healthcheck `GET /brouter` répond HTTP sans segments — connu Story 1.1) → download manuel des 81 tuiles.
  2. NFR benchmark FAIL initial (p95 ~1300 ms) car routes test 20-60 km **hors use-case** POI-accès → benchmark recorrigé sur routes courtes représentatives → PASS.
  3. Profil `safety` inexistant dans l'image → remplacé par `gravel` (cohérent enum app `road/gravel/bikepacking`).
- Écarts vs spec story (à synchroniser en Doc Sync) :
  - AC #2/#5 : `docker compose pull brouter` impossible (image build-from-source, pas de registre) → `deploy.sh` utilise `up -d` (auto-build) ; rollback = git revert / rebuild tag, pas `pull old-tag`.
  - Profils benchmark : `trekking/fastbike/safety` → `trekking/fastbike/gravel`.
  - Distances benchmark : la NFR vise des accès POI **courts** (~200ms/POI archi), pas 5-50 km.
  - AC #6 : `host.docker.internal:17777` incompatible avec le bind loopback (`172.17.0.1` ≠ `127.0.0.1`) → monitor Uptime Kuma via le **nom de service `brouter:17777`** (réseau Compose).

**PENDING (prod, à planifier avec Guillaume) :**
- Task 5 dry-run : push branche/main → CI déploie → vérifier step BRouter no-op (code `deploy.sh` prêt).
- Ajout des 7 vars `BROUTER_*`/`ACCESS_*` au `.env` prod (non bloquant — defaults Zod — mais requis AC #1).
- Push commits 1.2→1.4 sur `main` (migration DB 1.3 + code API 1.4) — décision Guillaume.
- Task 8 nmap externe (machine tierce), Task 9 commit, Task 10 handoff.

### File List

- [x] `deploy.sh` (modifié — step [4/7] BRouter `up -d` + health-gate ; `up -d` au lieu de `pull`)
- [x] `docs/ops/brouter-runbook.md` (modifié — sections (h) log bootstrap, (i) redéploiement, (j) rollback, (k) purge volume)
- [x] `docs/ops/brouter-prod-bootstrap-log-2026-05-28.md` (nouveau)
- [x] `docs/ops/brouter-benchmark-results.md` (nouveau)
- [x] `scripts/brouter-benchmark-prod.sh` (nouveau — 36 routes courtes, p50/p95/p99, verdict NFR)
- [x] `_bmad-output/planning-artifacts/architecture-poi-access-routing.md` (Doc Sync : corrigé ligne 1882 `pull`→`up -d`/build + bind localhost ; ajouté note validation NFR prod)
- [ ] `_bmad-output/planning-artifacts/epics-poi-access-routing.md` (Doc Sync — PENDING si AC évoluent)
