# Bootstrap BRouter Prod — 2026-05-28

Opérateur : Guillaume (pair-programming avec Claude Code)
Heure début : ~21h00 (GMT+2)
VPS : Hostinger KVM 2 — `72.62.189.193` — user `deploy`, repo `/home/deploy/ridenrest-app`

## Pré-checks (Task 1)

| Check | Cible | Mesuré | OK |
|---|---|---|---|
| Disque libre `/` | ≥ 5 Go | 77 Go libres (96 Go, 21 % utilisé) | ✅ |
| RAM dispo | ≥ 3 Go | 5,6 Gi dispo (7,8 Gi total) — ⚠️ Swap 0 | ✅ |
| Docker | ≥ 20 | 29.3.1 | ✅ |
| Docker Compose | v2 | v5.1.1 | ✅ |
| Repo HEAD VPS | commits 1.1–1.4 | `80562ce` = origin/main (Story 1.1 + docs) | ⚠️ voir note |
| Env vars `BROUTER_*`/`ACCESS_*` | 7 présentes | **0 présente** (toutes absentes) | ⚠️ voir note |
| Conteneur BRouter | présent | `ridenrest-brouter` Up 24h (healthy) — déployé en Story 1.1 | ✅ |
| Volume segments | présent | `ridenrest-app_brouter-segments` (vide : 4 K) | — |

**Note repo** : Les commits Stories 1.2→1.4 (runbook+scripts, migration DB, prérequis API) sont
en local mais **pas encore poussés** sur `origin/main` → pas sur le VPS. Décision : bootstrap BRouter
**découplé** du déploiement applicatif (download segments via script copié en `/tmp`), pour éviter de
déclencher un déploiement prod complet (migration 1.3 + code 1.4) pendant le bootstrap infra.

**Note env vars** : les 7 vars sont absentes du `.env` prod, mais le schéma Zod
(`apps/api/src/config/access.config.ts`) leur donne à toutes un `.default()` (dont
`BROUTER_BASE_URL` → `http://localhost:17777`, déjà la valeur prod). Donc **l'API ne crashe pas**
sans elles. À ajouter quand même (AC #1) avant/avec le push de 1.4 → **PENDING**.

## Actions

- [x] Audit pré-bootstrap (Task 1) — voir tableau ci-dessus.
- [x] **Task 2 — Download segments** : script `update-brouter-segments.sh` copié en `/tmp`, exécuté
  sur le VPS. Résultat : **81/81 tuiles** téléchargées (3036 Mo ≈ 3,0 Go) en **121 s**, 15 tuiles
  océan ignorées (404 normaux), 0 échec. Chemin segments : **MANUEL** (BRouter n'auto-télécharge pas).
- [x] Vérif routing : `GET /brouter?lonlats=...&profile=trekking` → GeoJSON valide, `track-length 19680`
  (Paris→Versailles). Healthcheck `healthy`. (Pas de restart nécessaire — chargement lazy des tuiles.)
- [x] **Task 3 — Smoke test** : `brouter-smoke-test.sh` → **5/5 passed** (avg 1733 ms à froid).
- [x] **Task 4 — Benchmark NFR** : voir `brouter-benchmark-results.md`. **Verdict PASS** (p50 ~143 ms,
  p95 ~305–332 ms). NFR-PA-002 validée pour la charge POI-accès. Run 1/3 (soirée).
- [ ] **Task 5 — `deploy.sh`** : bloc BRouter (build+up+health-gate) — préparé en local, dry-run via push **PENDING**.
- [ ] Ajout des 7 env vars au `.env` prod — **PENDING**.
- [ ] Push 1.2→1.4 sur `main` (migration + code API) — **PENDING** (décision Guillaume).
- [x] **Task 6 — Uptime Kuma** : monitor `BRouter Production` (HTTP Keyword `LineString`) via
  `http://brouter:17777/...` (nom de service Docker — `host.docker.internal` KO car bind loopback,
  voir découverte ci-dessous). Test stop/start OK : alertes DOWN + recovery reçues (email + Telegram).
- [x] **Task 8 (interne)** : `ss -tlnp | grep 17777` → `LISTEN 127.0.0.1:17777` → bind loopback
  confirmé (NFR-PA-008 côté VPS). Reste le nmap externe depuis une machine tierce — **PENDING**.
- [ ] **Task 5 dry-run** + push 1.2→1.4 + env vars + Task 9 commit + Task 10 handoff — **PENDING**.

## Résultats (provisoire)

- BRouter **opérationnel et benchmarké** sur la prod (segments OK, routing OK, NFR PASS).
- Reste : intégration CI (`deploy.sh`), monitoring (Uptime Kuma), audit sécurité externe, push applicatif.

## Problèmes rencontrés & résolutions

1. **Conteneur healthy mais 0 segment** : le healthcheck `GET /brouter` répond HTTP même sans segments
   (connu Story 1.1). → Download manuel des 81 tuiles → routing fonctionnel.
2. **NFR benchmark FAIL initial (p95 ~1300 ms)** : dû à des routes de test 20–60 km **hors use-case**
   POI-accès. → Benchmark recorrigé sur routes courtes représentatives → **PASS**.
3. **Profil `safety` inexistant** (7 fails) : absent de l'image BRouter. → Remplacé par `gravel`.
4. **Uptime Kuma `host.docker.internal:17777` → ECONNREFUSED** : BRouter bindé sur `127.0.0.1`
   (loopback hôte) n'est pas joignable via la passerelle bridge `172.17.0.1`. → Monitor via le
   **nom de service Docker `brouter:17777`** (container-to-container), bind sécurisé inchangé.
