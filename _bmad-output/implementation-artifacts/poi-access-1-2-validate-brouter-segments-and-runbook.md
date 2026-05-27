# Story POI-Access 1.2 : Valider le téléchargement des segments en local & créer le runbook ops

Status: done

<!--
Story scope-specific issue de epics-poi-access-routing.md (feature POI Access Routing).
Préfixe `poi-access-` pour cohérence avec la story 1.1.
Dépendance dure : Story 1.1 doit être DONE avant de démarrer cette story.
La validation NFR p95 < 500 ms FORMELLE se fait sur le VPS prod via Story 1.5, pas ici.
-->

## Story

As a **DevOps engineer**,
I want to validate the BRouter Europe segment download workflow on my local machine and document the operational procedures in a runbook,
So that the team has a reproducible reference for first-time bootstrap and recurring ops tasks before deploying to production (Story 1.5).

## Acceptance Criteria

1. **Given** le conteneur BRouter provisionné en local (Story 1.1 DONE), **When** je lance le conteneur pour la première fois sur ma machine, **Then** soit BRouter télécharge automatiquement les segments Europe (~3 GB) depuis `brouter.de/brouter/segments4/` (chemin auto), **soit** j'exécute manuellement les commandes de téléchargement (chemin manuel — voir Dev Notes pour la stratégie).

2. **Given** la décision auto vs manuel prise (Task 1), **When** le téléchargement est complet, **Then** :
   - Les fichiers `.rd5` couvrant l'Europe sont présents dans le volume `brouter-segments` (vérifiable via `docker exec ridenrest-brouter ls -la /segments4`)
   - Le téléchargement total complet en < 30 minutes sur connexion ~10 Mo/s
   - La taille totale des segments est consignée dans `docs/ops/brouter-runbook.md` (informative)

3. **Given** les segments persistent dans le volume Docker, **When** je fais `docker compose restart brouter`, **Then** AUCUN re-téléchargement n'est déclenché (validation visuelle des logs container : pas de wget/download)

4. **Given** les segments sont chargés, **When** j'exécute un script de smoke test (3-5 requêtes routing sur des coordonnées européennes connues, profil `trekking`), **Then** :
   - Les 5 requêtes retournent HTTP 200
   - Chaque réponse est un GeoJSON LineString valide (parseable par `jq`)
   - Aucune n'a `messages` d'erreur dans le payload BRouter
   - La latence locale est notée pour information (PAS de validation NFR formelle ici — c'est Story 1.5 sur VPS)

5. **Given** la validation locale est OK, **When** je crée `docs/ops/brouter-runbook.md`, **Then** le runbook contient les **6 sections obligatoires** :
   - **(a) Provisionnement initial** : commande exacte, prérequis disque (≥ 5 GB libres), durée download attendue, vérifications post-install
   - **(b) Diagnostic d'une panne BRouter** : logs (`docker logs -f ridenrest-brouter`), commande healthcheck, vérification volume, fallback circuit breaker (cf. Story 2.1)
   - **(c) Procédure de mise à jour des segments OSM** : cron mensuel + procédure manuelle (script `update-brouter-segments.sh`)
   - **(d) Procédure de bump de `ACCESS_ENGINE_VERSION`** : explication impact (recalcul lazy progressif, pas de pic de charge), commande de bump dans `.env`, vérification déploiement
   - **(e) Procédure de diagnostic d'explosion de queue BullMQ `poi-access-calculation`** : purge, throttle, monitoring Bull Board (cf. Story 4.3)
   - **(f) Première installation sur VPS prod** : réfère explicitement à la Story 1.5 + lien vers le fichier story
   - **(g) Bonus** : commande de smoke test rapide (réutilisée en CI)

6. **Given** le script de smoke test fonctionne, **When** je le commit dans le repo, **Then** il est placé dans `scripts/brouter-smoke-test.sh`, est exécutable (`chmod +x`), et utilise `BROUTER_BASE_URL` depuis `.env` (cohérence avec Story 1.1).

7. **Given** la documentation est créée, **When** je commit, **Then** le diff inclut UNIQUEMENT :
   - `docs/ops/brouter-runbook.md` (nouveau)
   - `scripts/brouter-smoke-test.sh` (nouveau, exécutable)
   - `scripts/update-brouter-segments.sh` (nouveau, exécutable — section (c) du runbook)
   - Éventuelles mises à jour mineures de `architecture-poi-access-routing.md` ou `epics-poi-access-routing.md` si découvertes (Doc Sync Rule)

8. **Given** la story est terminée, **When** je remets la main au PM, **Then** je consigne dans les Completion Notes : (a) le chemin retenu (auto vs manuel), (b) la taille observée des segments Europe, (c) le temps de téléchargement réel, (d) la latence moyenne du smoke test (informative).

---

## ⚠️ Critical Discovery Notes — À LIRE AVANT IMPLÉMENTATION

### 1. Dépendance dure : Story 1.1 doit être DONE

Cette story consomme directement les artefacts de Story 1.1 :
- Le conteneur Docker `ridenrest-brouter` doit exister et démarrer
- L'image Docker validée (tag exact) est documentée dans la Story 1.1 Completion Notes
- L'endpoint healthcheck validé est documenté dans la Story 1.1 Completion Notes
- `BROUTER_BASE_URL` est dans `.env.example` (et le dev a une valeur dans son `.env` local)

**Action préliminaire** : lire intégralement la section "Completion Notes List" de la story 1.1 avant de démarrer.

### 2. Auto-download des segments : à confirmer/infirmer en Task 1

L'architecture supposait l'auto-download. La recherche web de Story 1.1 a indiqué que c'est probablement faux côté Docker (l'app Android le fait, mais pas l'image Docker). **Cette story doit valider expérimentalement** :

Si auto-download confirmé → Task 2-3 : monitor le download, documenter dans runbook
Si auto-download infirmé → Task 4-5 : préparer commande manuelle, l'intégrer au runbook

**Commande manuelle de référence** (à ajuster selon validation) :
```bash
# Télécharger les segments Europe (sous-ensemble — pas tout le monde)
# Les segments sont nommés par tile : E5_N45.rd5 = Europe centrale, etc.
docker exec ridenrest-brouter sh -c '
  cd /segments4 && \
  wget -nv -nc -r -l1 -np -A "E*.rd5,W*.rd5" \
    https://brouter.de/brouter/segments4/
'
# (À tester — peut nécessiter une liste explicite des fichiers Europe)
```

### 3. Quels fichiers `.rd5` couvrent "l'Europe" ?

BRouter divise le monde en tiles de 5°×5° (latitude × longitude). Pour couvrir l'Europe :
- Latitudes : N35 à N70 (8 tiles)
- Longitudes : W15 à E40 (12 tiles)
- Total approximatif : ~50-60 fichiers `.rd5` (taille variable selon densité OSM)

**Source de référence** : https://brouter.de/brouter/segments4/ (lister les fichiers `.rd5` existants pour identifier ceux à télécharger).

**Stratégie pragmatique** : télécharger TOUT le contenu du dossier `segments4` couvrant l'Europe. Si l'archi disait "~3 GB", c'est probablement ~50-60 fichiers × ~50 MB en moyenne.

### 4. Validation NFR latence : NON dans cette story

L'architecture (NFR-PA-002) spécifie `< 500 ms p95 sur VPS KVM 2`. **Cette validation formelle est en Story 1.5** (bootstrap VPS prod), pas ici. Cette story produit un benchmark INFORMATIF en local seulement.

→ Ne PAS bloquer cette story si la latence locale dépasse 500 ms : c'est attendu sur certaines machines de dev (CPU plus lent, RAM partagée).

### 5. Le runbook est CRITIQUE pour Story 1.5

Story 1.5 (bootstrap VPS prod) va RÉUTILISER les procédures de ce runbook. Si le runbook est vague ou incomplet, Story 1.5 sera bloquée. Section (a) "Provisionnement initial" doit être suffisante pour qu'un dev qui n'a jamais touché BRouter puisse exécuter la procédure sur le VPS sans questions.

---

## Tasks / Subtasks

- [x] **Task 1** — Tester le comportement de démarrage initial (AC: 1, 2, ⚠️Discovery #2)
  - [x] Volume Docker existant avec conteneur UP (24h), segments vides confirmé
  - [x] `docker logs ridenrest-brouter` : uniquement des healthchecks GET /brouter, aucun download
  - [x] `docker exec ridenrest-brouter ls -la /segments4` : dossier vide → **chemin manuel** confirmé
  - [x] Résultat : pas d'auto-download, cohérent avec Story 1.1 Completion Notes #5

- [N/A] **Task 2** — [SI AUTO] Skippée — chemin manuel retenu

- [x] **Task 3** — [SI MANUEL] Préparer la commande de téléchargement (AC: 1, 2, ⚠️Discovery #3)
  - [x] Consulté https://brouter.de/brouter/segments4/ — identifié grille Europe complète
  - [x] Créé `scripts/update-brouter-segments.sh` — télécharge sur l'hôte (curl) + docker cp (pas de wget dans le conteneur)
  - [x] Grille : lon W15→E40, lat N35→N70 (96 combinaisons, 81 tiles existantes, 15 océan/404)
  - [x] `chmod +x scripts/update-brouter-segments.sh`
  - [x] Script exécuté avec succès : 81 fichiers, 3036 MB, 98 secondes

- [x] **Task 4** — Vérifier la persistance volume (AC: 3)
  - [x] `docker compose restart brouter` — restart OK
  - [x] Logs post-restart : uniquement healthchecks, aucun re-download
  - [x] `docker exec ridenrest-brouter ls /segments4/*.rd5 | wc -l` → 81 (inchangé)

- [x] **Task 5** — Créer le script de smoke test (AC: 4, 6)
  - [x] Créé `scripts/brouter-smoke-test.sh` — 5 routes européennes, profil trekking
  - [x] Adaptation macOS : `date +%s%3N` remplacé par `python3 -c 'import time; print(int(time.time()*1000))'`
  - [x] `chmod +x scripts/brouter-smoke-test.sh`
  - [x] 5/5 tests passés, latence moyenne 764ms (warm cache, informatif)

- [x] **Task 6** — Créer le runbook ops (AC: 5)
  - [x] Créé `docs/ops/` (nouveau dossier)
  - [x] Créé `docs/ops/brouter-runbook.md` avec les 7 sections obligatoires :
    - (a) Provisionnement initial : prérequis, commandes, vérification
    - (b) Diagnostic panne : logs, healthcheck, volume, circuit breaker (Story 2.1)
    - (c) Mise à jour segments : script + cron mensuel `0 3 1 * *`
    - (d) Bump ACCESS_ENGINE_VERSION : procédure + impact recalcul lazy
    - (e) Diagnostic queue BullMQ : redis-cli, purge, throttle
    - (f) Première installation VPS : référence Story 1.5
    - (g) Bonus : smoke test usage
  - [x] Chemin manuel documenté avec chiffres réels

- [x] **Task 7** — Validation finale + Doc Sync (AC: 7)
  - [x] Smoke test final : 5/5 passed, avg 764ms
  - [x] Doc Sync : architecture-poi-access-routing.md mis à jour (§Volume de données + §Téléchargement initial + §Mise à jour segments)
  - [x] Écarts corrigés : suppression mention wget dans cron, clarification téléchargement manuel via script

- [x] **Task 8** — Commit & Completion Notes (AC: 7, 8)
  - [x] Completion Notes renseignées ci-dessous
  - [x] Commit suggéré : `feat(ops): add BRouter runbook + smoke test + segments script (story poi-access-1.2)`

---

## Dev Notes

### Patterns projet à respecter

**Scripts shell** (cf. autres scripts existants) :
- Shebang `#!/usr/bin/env bash` (pas `/bin/bash`)
- `set -euo pipefail` toujours
- Variables d'env avec fallback : `"${VAR:-default}"`
- Pas de `set -x` par défaut (verbeux)
- Output `✅` / `❌` pour les checks visibles humain
- Exit code 0 si succès, ≥1 si échec

**Docs `docs/ops/`** :
- Pas de convention stricte trouvée (à vérifier si autres runbooks existent — sinon créer la convention)
- Format Markdown standard, niveaux H2 pour les sections principales
- Code blocks avec langage (`bash`, `yaml`, `sql`, etc.)
- Liens relatifs vers les autres docs du repo (`_bmad-output/...`, `apps/api/src/...`)

### BRouter — Format de l'URL d'appel

Format complet d'une requête BRouter routing :
```
GET {BROUTER_BASE_URL}/brouter
  ?lonlats={lon1},{lat1}|{lon2},{lat2}  (jusqu'à plusieurs waypoints)
  &profile={trekking|fastbike|safety|car-fast}
  &alternativeidx={0|1|2|3}  (route principale ou alternatives)
  &format={geojson|gpx|kml}
```

Exemple : `http://localhost:17777/brouter?lonlats=2.3488,48.8534|2.1301,48.8014&profile=trekking&alternativeidx=0&format=geojson`

**⚠️ Ordre des coordonnées** : `lon,lat` (GeoJSON), JAMAIS `lat,lon`. Cohérent avec NFR du project (cf. `architecture-poi-access-routing.md` §Enforcement Guidelines règle #1).

### BRouter — Profils standards

| Profil BRouter | Usage | Mapping projet |
|---|---|---|
| `trekking` | Mix route + chemins blancs | "Gravel" (default aventure) |
| `fastbike` | Route asphaltée privilégiée | "Route" |
| `safety` | Priorité trafic réduit | "Bikepacking" |

(Mapping défini en `architecture-poi-access-routing.md` §Starter Template Evaluation #2.)

### BRouter — Réponse GeoJSON

Structure type retournée :
```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": { "type": "LineString", "coordinates": [[lon, lat, ele], ...] },
    "properties": {
      "track-length": "4523",           // distance totale en mètres (string!)
      "filtered ascend": "127",          // D+ en mètres
      "plain-ascend": "120",
      "messages": [["lon", "lat", "ele", ...]]
    }
  }]
}
```

Validation minimale smoke test : `jq -e '.features[0].geometry.type == "LineString"'`

### Pourquoi `jq` et pas un parseur Node.js ?

Le smoke test reste un script ops standalone qui doit fonctionner même si Node.js n'est pas installé / l'API down. `jq` est disponible partout (Linux/Mac, GitHub Actions runners, etc.). Si `jq` n'est pas dispo localement, le dev peut l'installer : `brew install jq` (Mac) / `apt install jq` (Debian/Ubuntu).

### Persistance volume Docker

Le volume nommé `brouter-segments` est géré par Docker (`/var/lib/docker/volumes/ridenrest-app_brouter-segments/_data/` sous le hood). Il survit aux :
- `docker compose restart brouter`
- `docker compose down` (sans `-v`)
- `docker rm ridenrest-brouter`
- Reboot du host

Il est détruit uniquement par :
- `docker compose down -v`
- `docker volume rm ridenrest-app_brouter-segments`
- `docker volume prune` (si non utilisé)

**Anti-pattern** : ne PAS bind-mount un dossier local (`./brouter-segments:/segments4`) — perte de portabilité, conflits de permission UID/GID.

### Project Structure Notes

**Pas de conflit** avec la structure existante. Nouveaux fichiers :
- `docs/ops/brouter-runbook.md` (nouveau dossier `docs/ops/` créé si absent)
- `scripts/brouter-smoke-test.sh` (cohérent avec scripts existants ex: `scripts/dev-setup.sh` créé en Story 14.1)
- `scripts/update-brouter-segments.sh` (idem)

### Testing Standards

- Validation manuelle via les AC (smoke test = test fonctionnel)
- Pas de test unitaire (scripts shell + docs)
- Le smoke test sera réutilisable dans la pipeline CI plus tard (post-MVP)

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-1.2] — AC originaux
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Bootstrap-Téléchargement-initial-des-segments] — assomption auto-download (à valider)
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Enforcement-Guidelines] — règle [lon,lat]
- [Source: _bmad-output/implementation-artifacts/poi-access-1-1-provision-brouter-docker-service.md] — Completion Notes (à lire AVANT cette story)
- [Source: _bmad-output/project-context.md#Doc-Sync-Rule] — règle sync docs
- [Source: scripts/dev-setup.sh] — pattern de script ops existant
- BRouter upstream : https://github.com/abrensch/brouter (v1.7.9)
- BRouter segments index : https://brouter.de/brouter/segments4/
- BRouter API doc : https://github.com/abrensch/brouter/blob/master/docs/users/api.md

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via Claude Code CLI

### Debug Log References

- Container logs : uniquement healthcheck GET /brouter toutes les 30s, aucun message download
- Segment download : 81/96 tiles téléchargées (15 ocean tiles = 404 attendus)
- macOS date bug : `date +%s%3N` produit un littéral 'N' sur BSD date → corrigé avec python3 millis()
- Smoke test cold start : ~1590ms première requête (chargement segment E0_N45.rd5), ~630ms warm

### Completion Notes List

- Chemin retenu (Task 1) : **Manuel** — BRouter Docker ne télécharge pas les segments au démarrage
- Tag image BRouter utilisée (issu Story 1.1) : `brouter:1.7.9` (build from abrensch/brouter#v1.7.9)
- Endpoint healthcheck utilisé (issu Story 1.1) : bash `/dev/tcp` HTTP GET sur port 17777
- Nombre de fichiers segments Europe téléchargés : **81** (grille W15→E40, N35→N70, 15 tiles océan ignorées)
- Taille totale segments Europe : **3036 MB (~3.0 GB)**
- Temps de téléchargement réel : **98 secondes** (~31 Mo/s)
- Latence moyenne smoke test (informatif seulement) : **764 ms** (warm cache local, 5 routes trekking)
- Écarts vs architecture détectés et synchronisés :
  - §Volume de données : précisé "81 tiles, téléchargement manuel via script"
  - §Téléchargement initial : remplacé procédure implicite par référence au script + runbook
  - §Mise à jour segments : remplacé `docker exec brouter wget` (impossible, pas de wget) par référence au script
  - §Profils BRouter : **`safety` n'existe pas** dans v1.7.9 → remplacé par `fastbike-verylowtraffic` (décision finale en Story 2.1)

### File List

- [x] `docs/ops/brouter-runbook.md` (nouveau)
- [x] `scripts/brouter-smoke-test.sh` (nouveau, exécutable)
- [x] `scripts/update-brouter-segments.sh` (nouveau, exécutable)
- [x] `_bmad-output/planning-artifacts/architecture-poi-access-routing.md` (modifié — 3 sections Doc Sync)
- [x] `_bmad-output/implementation-artifacts/poi-access-1-2-validate-brouter-segments-and-runbook.md` (modifié — tasks, completion notes)

### Review Findings

_Code review 2026-05-27 — Blind Hunter + Edge Case Hunter + Acceptance Auditor_

- [x] [Review][Decision] **F1 — Cron mensuel = no-op permanent** : ajouté flag `--force` au script + cron utilise `--force`. Résolu.
- [x] [Review][Patch] **F2 — Crash bash 3.2 macOS** : remplacé `${arr[-1]}` par `${arr[${#arr[@]}-1]}`. Résolu.
- [x] [Review][Patch] **F3 — Nom conteneur Redis inexistant** : corrigé en `ridenrest-app-redis-1` dans le runbook. Résolu.
- [x] [Review][Patch] **F4 — Commande `KEYS` Redis bloquante O(n)** : remplacé par `--scan --pattern` + batch DEL. Résolu.
- [x] [Review][Patch] **F5 — Injection shell dans `docker exec sh -c`** : utilisé args positionnels (`'...' _ "$VAR"`). Résolu.
- [x] [Review][Patch] **F6 — Guillemets `.env` cassent l'URL smoke test** : ajouté `tr -d '"'"'"` après extraction. Résolu.
- [x] [Review][Patch] **F7 — Dépendances `python3`/`jq`/`bc` non vérifiées** : ajouté `command -v` checks au démarrage. Résolu.
- [x] [Review][Patch] **F8 — `docker inspect` réussit sur conteneur arrêté** : vérifie maintenant `{{.State.Running}}` = true. Résolu.
- [x] [Review][Patch] **F9 — `curl 2>&1 || true` masque les erreurs réseau** : stderr capturé dans fichier temp séparé. Résolu.
- [x] [Review][Patch] **F10 — Glob `ls *.rd5 | wc -l` sans `2>/dev/null` dans le runbook** : ajouté `2>/dev/null`. Résolu.
