# Story POI-Access 1.1 : Provisionner le service Docker BRouter

Status: done

<!--
Story scope-specific issue de epics-poi-access-routing.md (feature POI Access Routing).
Préfixe `poi-access-` pour éviter collision avec la legacy story 1-1-monorepo-setup-developer-environment.
Ne PAS ajouter à sprint-status.yaml — cette feature a son propre tracking via le fichier epics dédié.
-->

## Story

As a **DevOps engineer**,
I want to add the BRouter cycling routing service as a Docker container in the project's docker-compose stack,
So that the application backend (NestJS via PM2) can call BRouter locally for cycling route calculations without exposing it to the internet.

## Acceptance Criteria

1. **Given** le `docker-compose.yml` existant (services `db`, `redis`, `caddy`, `uptime-kuma`, `plausible*`), **When** j'ajoute un service `brouter` basé sur une image officielle BRouter pinnée à une version stable (voir Dev Notes — l'archi mentionnait `nrenner/brouter:latest` mais l'image est à vérifier), **Then** le service démarre via `docker compose up -d brouter`.

2. **Given** le service `brouter` est configuré, **When** je vérifie sa config, **Then** :
   - JVM mémoire cappée à `-Xmx2g` via `environment: JAVA_OPTS=-Xmx2g`
   - Conteneur exposé sur `127.0.0.1:17777:17777` uniquement (jamais bindé sur `0.0.0.0`)
   - Volume nommé `brouter-segments` monté sur `/segments4` (chemin standard BRouter)
   - `container_name: ridenrest-brouter` (suit la convention projet `ridenrest-*`)
   - `restart: unless-stopped` (suit le pattern des services prod-only)
   - PAS de `profiles: ["production"]` (BRouter doit tourner en local aussi pour Story 1.2 benchmark + tests E2E)

3. **Given** le conteneur BRouter tourne, **When** je vérifie `docker inspect --format='{{.State.Health.Status}}' ridenrest-brouter`, **Then** le healthcheck retourne `healthy` dans le `start_period` configuré (voir Dev Notes pour le choix d'endpoint — `/brouter/profile/trekking` est NON confirmé comme endpoint health officiel, préférer une vraie requête routing).

4. **Given** le healthcheck est OK, **When** je fais `curl http://127.0.0.1:17777/...` depuis l'hôte, **Then** je reçois une réponse HTTP 200 avec un GeoJSON valide (test routing minimal).

5. **Given** aucune route Caddy ne pointe vers BRouter, **When** je tente `curl https://ridenrest.app/brouter/...` ou `curl https://api.ridenrest.app/brouter/...` depuis l'extérieur, **Then** la requête est refusée (404 Caddy ou erreur reverse proxy).

6. **Given** le NestJS API tourne en PM2 NATIF hors Docker (cf. project-context.md §VPS Deployment Config), **When** je définis la variable d'env `BROUTER_BASE_URL` dans `.env.example`, **Then** sa valeur est `http://host.docker.internal:17777` (PAS `http://brouter:17777` comme l'archi le mentionnait par erreur — voir Dev Notes §Architecture Correction).

7. **Given** le volume Docker `brouter-segments`, **When** le conteneur est redémarré (`docker compose restart brouter`), **Then** les segments OSM sont persistés (pas de re-download).

8. **Given** la configuration docker-compose, **When** elle est ajoutée à la section `services:` du fichier existant, **Then** elle suit l'ordre alphabétique des services existants ou s'insère logiquement après `caddy` (cohérence avec le pattern actuel).

9. **Given** le service `brouter` est ajouté, **When** je relance `docker compose up -d` (avec autres services déjà up), **Then** les services existants (`db`, `redis`, etc.) ne sont PAS impactés et le `brouter` démarre en additionnel.

10. **Given** le fichier `docker-compose.yml` modifié, **When** je commit, **Then** le commit ne contient QUE le bloc `brouter:` et la déclaration du volume `brouter-segments:` — aucune autre modification.

---

## ⚠️ Critical Discovery Notes — À LIRE AVANT IMPLÉMENTATION

### 1. L'image `nrenner/brouter` n'est PAS confirmée sur Docker Hub

La recherche web (mai 2026) a montré que la page Docker Hub de `nrenner/brouter` renvoie **404**. Avant tout commit :

```bash
# Tester l'existence de l'image
docker pull nrenner/brouter:1.7.9    # tester avec un tag versionné
docker pull nrenner/brouter:latest   # fallback
```

**Si l'image n'existe pas** → chercher des alternatives :
- `abrensch/brouter` (compte du mainteneur upstream)
- Build local depuis https://github.com/abrensch/brouter (à éviter sauf nécessité)
- Documenter le choix retenu dans la story et le runbook

**Version cible BRouter** : **v1.7.9** (release avril 2026, branche active 1.7.x).

### 2. Architecture Correction : URL d'appel BRouter

L'architecture (`architecture-poi-access-routing.md` §Communication NestJS ↔ BRouter) mentionne `http://brouter:17777` comme URL d'appel depuis NestJS. **C'EST FAUX dans le contexte de ce projet.**

Raison : **les apps Node.js (NestJS + Next.js) tournent en PM2 NATIF sur le VPS, PAS dans des conteneurs Docker** (cf. `project-context.md` §VPS Deployment Config + `docker-compose.yml` — aucun service `api` ni `web`). Le nom de service Docker `brouter` n'est donc pas résolu par DNS pour PM2.

**URL correcte** :
| Environnement | `BROUTER_BASE_URL` |
|---|---|
| Local dev (Mac/Linux) | `http://localhost:17777` |
| VPS prod (PM2 → Docker) | `http://host.docker.internal:17777` (extra_hosts mapping déjà utilisé par caddy/uptime-kuma sur Linux VPS) |

→ Dans `.env.example` : `BROUTER_BASE_URL=http://host.docker.internal:17777`
→ Dans `apps/api/.env` (dev local) : `BROUTER_BASE_URL=http://localhost:17777`

**Action requise** : signaler cette correction dans le runbook ops + mettre à jour `architecture-poi-access-routing.md` (Doc Sync Rule — cf. project-context.md).

### 3. Auto-download des segments NON confirmé

L'architecture suppose que BRouter télécharge automatiquement les segments Europe au premier démarrage. La recherche web (mai 2026) indique : **probablement pas auto-download dans le conteneur Docker** — segments à télécharger manuellement depuis `https://brouter.de/brouter/segments4/` et monter dans le volume.

→ Tester le comportement réel au premier `docker compose up -d brouter`. Si pas d'auto-download :
- Cette story se termine avec un BRouter qui démarre mais retourne 404 sur les routing requests
- La Story 1.2 prendra en charge le download manuel des segments dans le runbook
- Adapter l'AC #4 en conséquence (peut être validé en Story 1.2 si segments manuels)

→ NE PAS bloquer cette story si le routing test échoue par manque de segments — c'est attendu et géré par Story 1.2.

### 4. Healthcheck endpoint non standardisé

BRouter n'expose pas d'endpoint `/health` officiel. Le `/brouter/profile/trekking` mentionné dans l'archi n'est pas documenté comme endpoint health.

**Stratégie healthcheck recommandée** :
```yaml
healthcheck:
  test: ["CMD-SHELL", "wget --spider -q http://localhost:17777/brouter || exit 1"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 5m   # laisse 5 min au container pour démarrer la JVM (et éventuellement download)
```

Tester plusieurs URLs sur le container démarré pour identifier celle qui retourne 200/204 sans paramètres :
- `GET /brouter` (page d'accueil ?)
- `GET /brouter/profile/trekking` (peut nécessiter des params)
- `GET /` (vérifier réponse HTTP)

Choisir celui qui répond 2xx/3xx sans nécessiter de paramètres routing.

---

## Tasks / Subtasks

- [x] **Task 1** — Vérifier l'existence et la version de l'image Docker BRouter (AC: 1, ⚠️Discovery #1)
  - [x] `docker pull nrenner/brouter:1.7.9` — **ÉCHEC** : image inexistante (Docker Hub 404)
  - [x] Testé `nrenner/brouter:latest`, `abrensch/brouter:*` — tous inexistants
  - [x] Aucune image pré-construite viable → **build depuis source** (cas "nécessité" prévu par Discovery #1)
  - [x] Choix retenu : build multi-stage depuis `https://github.com/abrensch/brouter.git#v1.7.9` (Dockerfile officiel upstream)

- [x] **Task 2** — Identifier l'endpoint healthcheck fiable (AC: 3, ⚠️Discovery #4)
  - [x] Container démarré via docker-compose build + up
  - [x] `GET /brouter` (sans params) → 404 (serveur répond mais pas de page d'accueil)
  - [x] `GET /` → 404
  - [x] `GET /brouter?lonlats=...` → 400 "datafile not found" (segments absents, attendu)
  - [x] Aucun endpoint 2xx sans paramètres → healthcheck via HTTP GET /brouter vérifiant réponse HTTP valide
  - [x] Implémentation : bash `/dev/tcp` + `printf GET /brouter HTTP/1.0` + vérification réponse contient "HTTP" (évite NPE logs vs TCP nu)

- [x] **Task 3** — Ajouter le service `brouter` dans `docker-compose.yml` (AC: 1, 2, 8)
  - [x] Inséré avant `caddy:` (ordre alphabétique b < c)
  - [x] Build pinné à v1.7.9 via `build.context: https://github.com/abrensch/brouter.git#v1.7.9`
  - [x] `container_name: ridenrest-brouter`
  - [x] `restart: unless-stopped`
  - [x] `ports: ["127.0.0.1:17777:17777"]` — bind localhost uniquement (AC #2)
  - [x] `volumes: ["brouter-segments:/segments4"]`
  - [x] `command` override avec `-Xmx2g` (server.sh hardcode JAVA_OPTS=-Xmx128M → env var inefficace)
  - [x] PAS de `profiles: ["production"]` (AC #2)
  - [x] Healthcheck bash HTTP avec `start_period: 5m`
  - [x] `brouter-segments:` ajouté dans `volumes:` (entre redisdata et caddy_data)

- [x] **Task 4** — Ajouter `BROUTER_BASE_URL` à `.env.example` (AC: 6, ⚠️Discovery #2)
  - [x] Ajouté dans `apps/api/.env.example` (template commité) + `apps/api/.env` (config locale) par Guillaume
  - [x] Variable : `BROUTER_BASE_URL=http://localhost:17777`
  - [x] URL corrigée : `http://localhost:17777` (pas `host.docker.internal` — NestJS PM2 natif sur l'hôte)
  - [x] Commentaire section `# BRouter (POI Access Routing)` ajouté

- [x] **Task 5** — Démarrage local et validation healthcheck (AC: 3, 4, 7, 9)
  - [x] `docker compose up -d brouter` → Container créé et démarré sans impacter autres services
  - [x] `ridenrest-db` (Up 6 days), `ridenrest-app-redis-1` (Up 6 days) — non redémarrés (AC #9) ✅
  - [x] Healthcheck → `healthy` en < 15 secondes (AC #3) ✅
  - [x] `curl "http://127.0.0.1:17777/brouter?lonlats=..."` → 400 "datafile E0_N45.rd5 not found" (segments absents — AC #4 reporté à Story 1.2 per Discovery #3) ✅
  - [x] `docker compose restart brouter` → healthy immédiatement, volume persisté (AC #7) ✅

- [x] **Task 6** — Validation isolation réseau (AC: 5)
  - [x] Aucun bloc Caddy pour BRouter dans `Caddyfile` (fichier absent en local, prod-only)
  - [x] `docker port ridenrest-brouter` → `17777/tcp -> 127.0.0.1:17777` (jamais 0.0.0.0) ✅
  - [ ] (VPS prod, Story 1.5) — vérifier `nmap -p 17777 ridenrest.app` retourne port fermé

- [x] **Task 7** — Sync documentation (Doc Sync Rule — project-context.md)
  - [x] `architecture-poi-access-routing.md` : corrigé 9 occurrences `http://brouter:17777` → `http://localhost:17777`, `nrenner/brouter` → build depuis source, ajouté notes PM2 natif, healthcheck bash, `command` override
  - [x] `epics-poi-access-routing.md` : corrigé Story 1.1 ACs (build source, pas depends_on, URL localhost), corrigé Story 1.2 ACs (segments manuels confirmés, pas auto-download), corrigé section Infrastructure

- [x] **Task 8** — Préparer la handoff Story 1.2
  - [x] Story 1.2 ACs mis à jour dans epics : "BRouter NE télécharge PAS automatiquement les segments (confirmé)" + procédure manuelle nécessaire
  - [x] Commande de download à documenter dans runbook : segments depuis `https://brouter.de/brouter/segments4/` + montage dans volume `brouter-segments`

- [x] **Task 9** — Commit propre (AC: 10)
  - [x] Fichiers modifiés vérifiés (voir git diff --stat ci-dessous)
  - [x] Message de commit : `feat(infra): add BRouter docker service for POI access routing (story poi-access-1.1)`

---

## Dev Notes

### Pattern projet — docker-compose.yml

Le `docker-compose.yml` existant suit ces conventions (à respecter pour BRouter) :

| Pattern | Exemple existant | Application BRouter |
|---|---|---|
| Naming conteneur | `container_name: ridenrest-{service}` (db, uptime-kuma, plausible*) | `container_name: ridenrest-brouter` |
| Healthcheck format | `["CMD-SHELL", "..."]` (db, plausible) ou `["CMD", "redis-cli", "ping"]` (redis) | `["CMD-SHELL", "wget --spider -q http://localhost:17777/... \|\| exit 1"]` |
| Restart policy | `restart: unless-stopped` (services prod-only) | `restart: unless-stopped` |
| Profiles | `profiles: ["production"]` pour caddy/uptime-kuma/plausible* (jamais en local) | ❌ **PAS de profile** — BRouter doit tourner en local pour Story 1.2 |
| Ports binding | `"5432:5432"` (dev) ou `"127.0.0.1:8000:8000"` (plausible, restreint) | `"127.0.0.1:17777:17777"` (jamais public) |
| Volumes nommés | Déclarés en bas du fichier : `pgdata`, `redisdata`, ... | Ajouter `brouter-segments:` |
| `extra_hosts` | `["host.docker.internal:host-gateway"]` requis sur Linux pour atteindre l'hôte | **Non nécessaire pour BRouter** (c'est le contraire qui se passe : l'hôte appelle BRouter) |

### Pourquoi pas de `profiles: ["production"]` pour BRouter ?

Story 1.2 a besoin de tester le téléchargement des segments + créer le runbook **en local** avant Story 1.5 prod. Si BRouter avait `profiles: ["production"]`, il ne démarrerait pas avec `docker compose up -d` simple — il faudrait `--profile production`, ce qui briserait le workflow de dev pour cette feature.

À long terme (post-MVP), on pourrait isoler BRouter en `profiles: ["poi-access"]` pour ne pas l'imposer aux devs qui ne touchent pas à cette feature. Out of scope pour cette story.

### Pourquoi `host.docker.internal` et pas `brouter` ?

L'architecture mentionne `http://brouter:17777` car elle suppose un network Docker partagé entre tous les services. **Mais NestJS ne tourne PAS dans Docker** sur ce projet (cf. project-context.md §VPS Deployment Config) — il tourne en PM2 natif sur le VPS, port 3010.

Donc :
- L'hôte VPS doit pouvoir atteindre `brouter` → bind sur `127.0.0.1:17777` côté Docker
- NestJS PM2 doit pouvoir atteindre `127.0.0.1:17777` (depuis le réseau host) → URL `http://localhost:17777` ou équivalent
- `host.docker.internal` est un alias Docker pour atteindre l'hôte depuis un conteneur — l'inverse n'est pas utile ici
- **Correction** : depuis NestJS PM2 (hôte), l'URL est simplement `http://127.0.0.1:17777` ou `http://localhost:17777`. Le `host.docker.internal` est nécessaire UNIQUEMENT si NestJS tournait dans Docker (cas où on devrait atteindre l'hôte depuis le conteneur).

→ **Décision finale** :
- `BROUTER_BASE_URL=http://localhost:17777` partout (local dev ET prod VPS), car NestJS est toujours sur l'hôte
- Pas besoin de `host.docker.internal` dans `.env.example` pour BRouter

(C'est plus simple — la note initiale §Discovery #2 était sur-prudente. Documentons clairement dans le runbook que le déploiement PM2 natif simplifie l'adressage.)

### Convention `.env.example`

Le `.env.example` actuel suit ce pattern (cf. story 14.1 Task 3) :
- Pas de commentaires inline (`KEY=value # comment` → la valeur inclut le commentaire — gotcha prod du 2026-03-26)
- Commentaires SUR LA LIGNE PRÉCÉDENTE uniquement
- Valeurs base64 → wrapper en double quotes
- Section dédiée par feature avec en-tête `# {Feature name}`

### Doc Sync Rule (CRITIQUE)

Cette story déclenche **2 modifications de documentation** :
1. `architecture-poi-access-routing.md` — corriger l'URL d'appel BRouter
2. `epics-poi-access-routing.md` — clarifier l'AC #6 et l'AC de Story 2.1

Cf. project-context.md §Doc Sync Rule : "When implementing a change that deviates from the story or epics — due to a user request, a technical constraint, or a design decision made during implementation — the dev agent MUST update the relevant documents BEFORE or IMMEDIATELY AFTER implementing the change."

### Project Structure Notes

**Pas de conflit** avec la structure existante. Le fichier modifié est `docker-compose.yml` racine + `.env.example` racine. Aucun nouveau fichier source applicatif dans cette story.

### Testing Standards

- Pas de test unitaire pour cette story (config infra)
- Validation manuelle via les AC #3, #4, #5, #7, #9
- Story 2.1 ajoutera les tests unitaires `RoutingService` qui consommera cette infra
- Story 1.5 ajoutera la validation NFR p95 < 500 ms sur VPS prod

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-1.1] — AC originaux
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Starter-Template-Evaluation] — config Docker initiale (à corriger)
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Infrastructure-Deployment] — détails déploiement
- [Source: _bmad-output/project-context.md#VPS-Deployment-Config] — architecture hybride Docker+PM2 (source de la correction §Discovery #2)
- [Source: _bmad-output/project-context.md#Doc-Sync-Rule] — règle de synchronisation docs
- [Source: _bmad-output/implementation-artifacts/14-1-docker-compose-infra-services.md] — pattern de référence pour ajout de service Docker
- [Source: docker-compose.yml] — fichier à modifier
- [Source: .env.example] — fichier à enrichir
- BRouter upstream : https://github.com/abrensch/brouter (v1.7.9, april 2026)
- BRouter segments : https://brouter.de/brouter/segments4/

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via Claude Code CLI

### Debug Log References

- BRouter build log : image `brouter:1.7.9` built from `abrensch/brouter` tag v1.7.9 (multi-stage gradle → openjdk:17.0.1-jdk-slim)
- Container NPE initial : TCP-only healthcheck causes `NullPointerException: Cannot invoke "String.startsWith(String)"` in RouteServer — fixed by switching to proper HTTP GET via bash /dev/tcp
- Routing test : `GET /brouter?lonlats=2.3522,48.8566|2.3622,48.8666&profile=trekking` → 400 "datafile E0_N45.rd5 not found" (segments absents, attendu)

### Completion Notes List

1. **Aucune image Docker Hub pré-construite viable** : `nrenner/brouter` (404), `abrensch/brouter` (404), communauté obsolète (eoger = 10+ ans). Solution : build depuis le Dockerfile officiel du repo upstream, pinné au tag `v1.7.9`.

2. **server.sh hardcode JAVA_OPTS** : Le script `server.sh` écrase toujours `JAVA_OPTS="-Xmx128M"` en local. L'env var Docker est ignorée. Solution : `command` override dans docker-compose qui appelle `java` directement avec `-Xmx2g`.

3. **Healthcheck sans wget/curl** : L'image `openjdk:17.0.1-jdk-slim` n'a ni wget ni curl. Solution : bash `/dev/tcp` avec un vrai HTTP GET (pas juste TCP connect qui cause des NPE BRouter).

4. **URL simplifiée à `http://localhost:17777`** : Comme NestJS tourne en PM2 natif sur l'hôte (pas dans Docker), l'URL est identique en dev local et prod VPS. Pas besoin de `host.docker.internal`.

5. **Segments non auto-downloadés** : Confirmé — BRouter Docker ne télécharge PAS les segments au démarrage. Le routing retourne 400 "datafile not found". Handoff documenté pour Story 1.2.

6. **Task 4 bloquée** : `.env.example` inaccessible (permissions Claude Code). Lignes exactes communiquées à Guillaume pour ajout manuel.

### Review Findings

- [x] [Review][Patch] **`mem_limit: 2560m` ajouté au conteneur BRouter** — JVM heap 2 Go + 512 Mo off-heap. Docker tue le conteneur avant le OOM killer Linux. [docker-compose.yml:115]
- [x] [Review][Defer] **Build reproducibility — git tag mutable, pas de SHA pinné** — `v1.7.9` est un tag Git mutable (force-push possible). Pas de Dockerfile local ni registry privé. → Story 1.5 (VPS prod bootstrap)
- [x] [Review][Defer] **Healthcheck rapporte healthy malgré routing non-fonctionnel** — `/brouter` retourne 404 (pas de segments), mais le check valide juste `*HTTP*`. → Story 1.2 (segments download)
- [x] [Review][Defer] **deploy.sh ne gère pas le build/restart BRouter** — Le script CI/CD ne fait que git pull + pnpm + pm2 reload. Aucune commande Docker pour BRouter. → Story 1.5
- [x] [Review][Defer] **Healthcheck bash `/dev/tcp` fragile si image upstream change** — Fonctionne sur openjdk:17.0.1-jdk-slim (Debian + bash). Si upstream passe à Alpine/distroless, le healthcheck casse. → Monitoring futur
- [x] [Review][Defer] **Flags JVM manquants vs server.sh** — Le `command` override omet `-Xmn8M` et `-DuseRFCMimeType=false` présents dans server.sh original. Impact potentiel sur Content-Type des réponses BRouter. → Story 2.1 (RoutingService validera le parsing)
- [x] [Review][Defer] **start_period 5m potentiellement court** — NFR-PA-014 mentionne cold start jusqu'à 15 min avec chargement segments. Actuellement OK (healthy en <15s sans segments), mais à revalider après Story 1.2. → Story 1.2

### File List

- [x] `docker-compose.yml` (modifié — ajout service `brouter` + volume `brouter-segments`)
- [x] `apps/api/.env.example` (modifié — ajout variable `BROUTER_BASE_URL`, par Guillaume)
- [x] `apps/api/.env` (modifié — ajout variable `BROUTER_BASE_URL`, par Guillaume, non commité)
- [x] `_bmad-output/planning-artifacts/architecture-poi-access-routing.md` (modifié — 9 corrections URL/image, ajout notes PM2/healthcheck/command)
- [x] `_bmad-output/planning-artifacts/epics-poi-access-routing.md` (modifié — Story 1.1 ACs corrigés, Story 1.2 segments manuels, section Infrastructure)
- [x] `_bmad-output/implementation-artifacts/poi-access-1-1-provision-brouter-docker-service.md` (modifié — tasks checkboxes, Dev Agent Record)
