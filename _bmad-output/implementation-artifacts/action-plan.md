# Plan d'action consolidé

**Créé le 2026-08-20**, à l'issue des stories 17.13 / 17.14 (réparation de la recherche POI, déployée en prod).

## À quoi sert ce fichier, et en quoi il diffère de `deferred-work.md`

| | `deferred-work.md` | ce fichier |
|---|---|---|
| Unité | un constat différé, rattaché à la story qui l'a produit | un chantier à mener, transversal |
| Granularité | fine, souvent un fichier / une ligne | un lot livrable |
| Ordre | chronologique, par story | par priorité et par porteur |
| Vocation | mémoire des arbitrages (« pourquoi on ne l'a pas fait ») | décider quoi faire ensuite |

Les deux coexistent. **Quand un point est déjà suivi dans `deferred-work.md`, ce fichier y renvoie au lieu de le recopier** — sinon les deux dérivent et on ne sait plus lequel fait foi.

Convention de porteur : **[dev]** = agent, **[Guillaume]** = ne peut venir que de lui, **[duo]** = session commune.

---

## A. Recherche POI — lot prêt à démarrer

Priorité la plus haute : corrige un défaut visible par l'utilisateur, périmètre fermé, gain mesuré.

### A1. Option B — Google Places [dev]

Aujourd'hui, sur une trace en Alsace, `campground` renvoie **0** résultat et `motel` **0**. Pour une app de bikepacking, ce n'est pas une lenteur, c'est un défaut fonctionnel.

- `google-places.provider.ts` : field mask `places.location,places.displayName,places.types` (SKU **Text Search Pro**), un `textQuery` par type au lieu d'un par calque, suivi du `nextPageToken` jusqu'à épuisement (plafond Google : 3 pages / 60 résultats par type ; `maxResultCount` est plafonné à 20 côté serveur quoi qu'on demande)
- `pois.service.ts` : **suppression du Place Details au prefetch** — les 4 champs nécessaires à un pin arrivent déjà dans la réponse de recherche —, filtre corridor **avant** insertion, marqueur de couverture **par calque** au lieu de par bbox

⚠️ Le marqueur par calque n'est pas optionnel dans ce lot : en SKU Pro, prefetcher les 4 calques quand l'utilisateur n'en a coché qu'un coûte de l'argent réel.

Mesures de référence (bbox `48.197,7.536 → 48.608,7.778`, plage 0-50 km) :

| | appels facturés | coût | POI trouvés | coût/POI | bboxes froides gratuites/mois |
|---|---|---|---|---|---|
| Actuel | 32 Place Details Essentials | 0,16 $ | 32 | 0,0050 $ | ~312 |
| Option B | 10 Text Search Pro | 0,32 $ | 114 | 0,0028 $ | **~500** |

Tarifs : Text Search Pro 32 $/1000 (5 000 gratuits/mois) ; Place Details Essentials 5 $/1000 (10 000/mois) ; Text Search IDs Only gratuit et illimité. La fiche POI garde son Place Details **Pro** à l'ouverture — inchangé.

### A2. Parité mobile du découplage [dev]

Écart mesuré le 2026-08-20 : **6 fichiers web** portent le découplage, **0 fichier mobile**.

- Envoi de `source=google|overpass`, deux requêtes indépendantes, affichage progressif
- Équivalent d'`ExtendedSearchStatus` (attente / lenteur > 5 s / résultats partiels)
- **Planning et live.** En live c'est plus critique : l'utilisateur est sur son vélo.
- À **vérifier** et non porter : l'équivalent du `triggerRepaint`. MapLibre Native est déclaratif, le mécanisme de MapLibre GL JS ne s'y applique peut-être pas.

Historique à ne pas perdre : ce travail avait été proposé en option le 2026-08-19 (« dis-moi si tu veux que je l'y applique aussi ») et la question est restée sans réponse. C'est le mécanisme exact de la divergence — voir section G.

### A3. Réécrire la règle 10 [dev]

`project-context.md` dit « **Parité planning / live obligatoire** ». Formulation ambiguë : elle a été lue comme « web-planning contre web-live » et n'a pas empêché la divergence web/mobile. À remplacer par les **points d'application nommés**, sur le modèle de la règle 9 qui cite ses quatre fichiers.

---

## B. Ce qui ne dépend que de Guillaume

- **Compte Google Play Console** [Guillaume] — blocage bancaire (hérité de MOB-1.2). Chemin critique de la sortie mobile, rien d'autre ne le débloque. Bloque MOB-6.5.
- **Révoquer le PAT GitHub** [Guillaume] — un token `ghp_` est en clair dans l'URL du remote (`.git/config`), il ressort de tout `git remote -v` et est apparu dans une conversation. Révoquer, régénérer, puis passer le remote en SSH.
- **Les 50 fichiers `.design-sync/`** [Guillaume] — stagés depuis le 2026-08-19, jamais commités (outillage claude.ai/design, +4 222 lignes). À versionner ou à sortir de l'index.

---

## C. Finalisation mobile

**Ne pas repartir de zéro.** État réel : 163 fichiers source, 29 102 lignes, 95 fichiers de test / **632 tests verts**, 11 écrans. MOB-5 (mode live) `done`. MOB-1 et MOB-2 ont **toutes** leurs stories `done`. Ce qui reste n'est presque pas du code.

- **13 validations device** [duo] — session unique en batch, l'agent pilote le simulateur et rapporte les écarts
- **MOB-3.4** import Strava [Guillaume] — implémentation complète, statut `review`, attend T8 device
- **MOB-4.7** polyline d'accès [Guillaume] — T1-T6 faits, attend T7 sur Dev Client
- **MOB-6.5** distribution [bloqué] — voir section B
- **MOB-6.6** session replay en prod — explicitement post-v1
- **Comptabilité d'epics** [dev] — MOB-1 et MOB-2 restent « in-progress » alors que toutes leurs stories sont `done` : rétrospectives marquées `optional` et jamais soldées. Faux signal d'avancement, à corriger dans `sprint-status.yaml`.

---

## D. Console d'admin — version descopée

### D1. Préalable bloquant [dev]

**Aucune notion de rôle n'existe** : pas de colonne `role` dans `packages/database/src/schema/`, et Better Auth ne charge que les plugins `jwt` et `genericOAuth`. À créer avant tout le reste.

### D2. Périmètre retenu [dev]

- Vue utilisateurs
- **Purge de cache par utilisateur** : lignes `accommodations_cache` du user **et** marqueurs `pois:google:seg:{segmentId}:bbox:*`. Les deux — supprimer les lignes sans les marqueurs rend la purge *nuisible* : le marqueur continue d'affirmer « bbox déjà prefetchée » pendant 7 jours, donc la recherche suivante renvoie **moins** de résultats qu'avant le clic.
- **Purge globale** `pois:bbox:*` / `pois:live:bbox:*`, réservée admin — c'est l'opération qu'il a fallu faire à la main lors du changement du filtre `shelter`.
- **Table `app_settings`** pour les valeurs réglables (TTL de cache, `MAX_SEARCH_RANGE_KM`, activation d'une source, seuils), lues à l'exécution avec un cache court, modifiables sans redémarrage.
- `pois.repository.ts` n'a aujourd'hui **aucune méthode de suppression** — à ajouter.

Rappel d'architecture utile pour cadrer la purge : les caches globaux (Redis, clés par bbox ou par `placeId`) portent les **réponses des API externes** ; la table `accommodations_cache` porte le **POI accroché à une trace** (`dist_along_route_km`, `dist_from_trace_m`, itinéraires d'accès), donc propre à un utilisateur. Un bouton utilisateur ne doit jamais toucher l'étage global : il dégraderait la latence de tous et referait facturer des Place Details à tout le monde.

### D3. Options supplémentaires à arbitrer [Guillaume]

Santé des sources externes (dernière insertion `overpass`, quota Google) · jobs BullMQ en échec · feedbacks utilisateurs (la table `feedbacks` existe déjà).

### D4. Explicitement hors périmètre

**L'écriture de `.env` depuis le web.** `ecosystem.config.js` lit `/data/.env` au démarrage de PM2 ; un changement exige d'écrire le fichier **et** de relancer le process. Un endpoint capable de faire ça est une exécution de code à distance : le fichier contient `DATABASE_URL`, `BETTER_AUTH_SECRET` et les clés d'API. Un compte admin compromis donnerait l'infrastructure entière. La table `app_settings` (D2) couvre le besoin réel — « ajuster un réglage sans SSH » — sans exposer les secrets.

---

## E. Observabilité

- **Alerte « zéro insertion `source='overpass'` depuis N jours »** — déjà suivi dans `deferred-work.md` § story 17-13. Aurait détecté la panne de cinq mois en quelques jours. Vaut aussi pour le quota Google Places et WeatherAPI.

---

## F. Dette technique

### Nouveaux constats (2026-08-20)

- **56 erreurs `tsc` sur `apps/web`**, préexistantes et indépendantes des correctifs 17.13/17.14 (vérifié par `git stash`). Le typecheck CI ne couvre donc pas le web comme il couvre l'api et le mobile — faux sentiment de propreté.
- **Actions GitHub sur un runtime déprécié** : `actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup` ciblent Node.js 20, déjà forcés sur Node 24 par compatibilité. Cassera quand la bascule sera retirée → bump `@v5`.
- **`mapGoogleTypesToCategory` finit sur `return 'hotel'`** — tout type Google non reconnu est étiqueté hôtel.
- **7 avertissements ESLint** (5 web, 2 mobile ; 0 erreur). Détail : `exhaustive-deps` sur `map-view.tsx`, directive `eslint-disable` devenue inutile, `<img>` au lieu de `next/image` dans `strava-connection-card`, `exhaustive-deps` sur les deux écrans mobile.

  ⚠️ **Un de ces avertissements est porteur** : `apps/mobile/src/app/(app)/map/[id].tsx:356`. Le « corriger » en ajoutant les dépendances et le cleanup associé a **réintroduit** la régression de l'auto-zoom le 2026-06-16. Garde-fou documenté dans `project-context.md`. À ne pas toucher.

### Déjà suivi dans `deferred-work.md` — ne pas dupliquer ici

`staleTime` 30 j sur les queries POI (arbitré non bloquant le 2026-08-20, priorité basse) · `shelter: ['lodging']` entrée morte dans `GOOGLE_PLACE_TYPES` · POI Overpass sans nom affichés « Unknown » · `prefetchAndInsertGooglePois` : valeur `inserted` non exploitée · Jest mobile ne rend pas la main sur `use-live-poi-search.test.tsx` (contourné par `--forceExit`).

---

## G. Méthode — ce qui a produit la divergence web/mobile

Constat vérifié, et il invalide l'explication intuitive. `apps/mobile/CLAUDE.md` importe **déjà** le contexte global (`@AGENTS.md` + `@../../_bmad-output/project-context.md`). Le contexte était donc complet et chargé lors du lot 17.13/17.14 — et le commit `bee89f9` a bel et bien modifié **6 fichiers mobile**. La divergence n'a pas été causée par une instruction manquante.

Causes réelles :

1. **L'unité de travail était le répertoire, pas la fonctionnalité.** « Découpler la recherche POI » est devenu une story web ; le mobile est devenu un suivi optionnel.
2. **La parité a été posée comme une question dans un message** au lieu d'être une tâche. Question sans réponse → écart silencieux.
3. **La règle était floue** (« parité planning / live ») là où elle devait nommer ses fichiers.

Changements à adopter :

- **Scoper par fonctionnalité** : une tâche couvre api + web + mobile et n'est finie que quand les trois le sont.
- **Toute règle durable nomme ses fichiers d'application** — vérifiable en une commande, contrairement à un adjectif comme « obligatoire ».
- **Rendre la parité mécanique** : mutualiser la *logique de décision* dans `packages/` (clés de requête, plan de sources, gate `ready`, mapping de catégories). Le rendu ne peut pas l'être (MapLibre GL JS vs Native), la décision oui — et c'est là que la divergence naît.
- **Garder ce qui capitalise, jeter le cérémonial** : `project-context.md` et les RCA d'incidents réels ont une valeur démontrée (les 11 règles ajoutées le 2026-08-19 ont permis de diagnostiquer une panne de cinq mois). Le cycle `create-story → dev-story → review → deferred-work` appliqué à un changement de deux heures, non. Preuve empirique : les stories 17.13/17.14 ont été menées en RCA → correctif → tests → règles durables → déploiement, sans cérémonial, et ont abouti.

Ordre de grandeur du symptôme : **64 stories** ont différé du travail, **139 entrées** dans `deferred-work.md`, **13 validations device** en attente.

---

## H. Intendance

- Branche `docs/17-13-17-14-prod-validated` — non poussée, à pousser + PR
- Branche `fix/poi-search-17-13` — mergée en squash dans `main` (`822adef`), supprimable. Elle apparaît « non mergée » via `git branch --merged` : normal avec un squash, seul le SHA diffère.

---

## Change Log

| Date | Auteur | Changement |
|---|---|---|
| 2026-08-20 | Claude Opus 5 (dev) | Fichier créé à la demande de Guillaume, pour consolider les chantiers issus des stories 17.13/17.14 et des échanges du jour, sans vider `deferred-work.md` dont une partie reste légitime. |
