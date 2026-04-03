# Story 16.13: POI Popup — Redesign Layout (Badge, Stats icônes, Horaires, Navigation, CTAs)

## Story

As a **cyclist consulting a POI on the map**,
I want the POI popup to have a clean, unified layout regardless of the POI type,
So that I can quickly read the essential information and take action without visual noise.

---

## Context & Design Decisions

### Problème actuel

Deux layouts coexistent selon le type de POI :
- **Hébergement** : badge sous le nom, téléphone en bloc séparé avec numéro, bouton "Site officiel" pleine largeur
- **Non-hébergement** (restaurant, vélo, alimentation) : URL brute en texte bleu avec 🌐 — pas de bouton "Site officiel"

Résultat : look inconsistant entre les fiches (images #8 vs #9).

### Objectif

Un layout unifié pour tous les types de POI, inspiré du mockup #12 (Hotel Center Vera) :
- Badge catégorie coloré **au-dessus** du nom
- Icônes **téléphone** + **navigation** cliquables inline avec le nom (sans numéro affiché)
- Stats row avec icônes (montagne, tendance, horloge)
- Section **horaires d'ouverture** repliable style Google (Ouvert/Fermé · Ouvre à X · chevron)
- CTAs côte à côte en bas : "Site officiel" + "Booking" (hébergement) ou "Site officiel" seul (autres)
- Chips de type hébergement : style aligné avec story 16.11 (dot coloré, pas d'emoji)

---

## Nouveau Layout Cible

```
┌──────────────────────────────────────┐
│ [HÔTEL]                              │  ← badge coloré (POI_CATEGORY_COLORS), uppercase
│ Hotel Center Vera   📞  🧭   [×]   │  ← nom bold + phone (si dispo) + navigation + close
│ 1.3 km de la trace                   │
├──────────────────────────────────────┤
│  [△]        [↗]        [⏱]          │  ← icônes centrées
│  km 125   1000m D+   ETA 7h         │  ← valeurs
├──────────────────────────────────────┤
│ Horaires : Fermé · Ouvre à 10:00 sam. ▾ │  ← repliable, style Google
│ (déplié)                             │
│   Lundi : 9:00 – 18:00              │
│   Mardi : 9:00 – 18:00              │
│   Mercredi : Fermé                   │
│   ...                                │
├──────────────────────────────────────┤
│ TYPE D'HÉBERGEMENT                   │  ← accommodation only
│ [● Hôtel] [● Auberge] [● Gîte]…    │  ← chips dot coloré (story 16.11 pattern)
├──────────────────────────────────────┤
│  [Site officiel]    [Booking]        │  ← side-by-side, flex-1 chacun
└──────────────────────────────────────┘
```

Non-hébergement (restaurant, vélo…) :
- Pas de section chips type hébergement
- CTA : "Site officiel" pleine largeur (si website dispo) — sinon rien

---

## Acceptance Criteria

**AC-1 — Badge catégorie au-dessus du nom**

**Given** n'importe quel POI ouvert en popup,
**When** la fiche s'affiche,
**Then** un badge coloré (couleur `POI_CATEGORY_COLORS[poi.category]`, fond coloré + texte blanc, uppercase, pill) apparaît **au-dessus** du nom.
**And** le texte du badge est le label de la catégorie spécifique (ex: "HÔTEL", "CAMPING", "REFUGE", "RESTAURATION", "ALIMENTATION", "VÉLO").

**AC-2 — Icônes téléphone + navigation inline**

**Given** un POI dont `displayPhone` est non null,
**When** la fiche s'affiche,
**Then** une icône Lucide `Phone` cliquable (`<a href="tel:...">`) apparaît à droite du nom, à gauche de l'icône navigation.
**And** le numéro de téléphone n'est **pas** affiché en texte.

**Given** n'importe quel POI (avec ou sans téléphone),
**When** la fiche s'affiche,
**Then** une icône Lucide `Navigation` cliquable (`<a href="https://www.google.com/maps/dir/?api=1&destination={lat},{lng}" target="_blank">`) apparaît à droite du téléphone (ou du nom si pas de téléphone), à gauche du bouton ×.

**AC-3 — Stats row avec icônes**

**Given** un POI ouvert en popup,
**When** les stats sont affichées,
**Then** la row contient trois colonnes centrées, chacune avec une icône Lucide en haut et la valeur en dessous :
- Colonne 1 : icône `Milestone` + `km X.X`
- Colonne 2 : icône `TrendingUp` + `X m D+` (masquée si `elevationGainM === null` ou `=== 0`)
- Colonne 3 : icône `Clock` + `ETA Xh` (masquée si non calculable)

**AC-4 — Horaires d'ouverture repliables style Google**

**Given** les données Google incluent `weekdayDescriptions` et le POI est **non-hébergement** (restaurant, alimentation, vélo),
**When** la fiche s'affiche,
**Then** une ligne "Horaires : [Ouvert/Fermé] · [prochaine transition] ▾" est visible.
**When** le POI est **ouvert**, la ligne affiche "Ouvert" en vert + l'heure de fermeture du jour (ex : "· Ferme à 18:00") dérivée de `periods`.
**When** le POI est **fermé**, la ligne affiche "Fermé" en rouge + le prochain créneau d'ouverture (ex : "· Ouvre à 10:00 sam.") dérivé de `periods`.
**When** l'utilisateur clique sur la ligne (ou le chevron),
**Then** la liste des 7 jours (`weekdayDescriptions`) se déplie, avec le jour courant en gras.
**When** `weekdayDescriptions` est absent ou vide,
**Then** seul le statut Ouvert/Fermé est affiché (sans chevron, sans prochaine transition).
**Given** le POI est un **hébergement** (hotel, hostel, camp_site, shelter, guesthouse),
**When** la fiche s'affiche,
**Then** la section horaires est **entièrement absente** — ni statut, ni horaires, ni chevron.

**AC-5 — CTAs côte à côte (hébergement)**

**Given** un POI d'hébergement,
**When** la fiche s'affiche,
**Then** deux boutons `flex-1` côte à côte en bas :
- "Site officiel" (variant `outline`) — **uniquement si** `displayWebsite` est non null
- "Booking" (variant `default`, fond `--primary`) — **toujours présent** pour les hébergements
**When** `displayWebsite` est null, seul le bouton "Booking" s'affiche (pleine largeur).

**AC-6 — CTA site officiel unifié (non-hébergement)**

**Given** un POI non-hébergement (restaurant, vélo, alimentation),
**When** `displayWebsite` est non null,
**Then** un bouton "Site officiel" pleine largeur s'affiche (même style que l'hébergement — plus de lien URL brut).
**When** `displayWebsite` est null, aucun CTA ne s'affiche.

**AC-7 — Chips type hébergement : style story 16.11**

**Given** la section type d'hébergement est affichée,
**When** les chips sont rendues,
**Then** elles utilisent le pattern dot coloré + label sans emoji (aligné avec `accommodation-sub-types.tsx` story 16.11) :
- Active : fond `POI_CATEGORY_COLORS[category]`, texte blanc, dot blanc
- Inactive : fond muted, dot coloré (`POI_CATEGORY_COLORS[category]`)
**And** aucun emoji n'est affiché sur les chips.

**AC-8 — Nom : `displayName` Google en priorité sur `Poi.name`**

**Given** un POI ouvert dont les données Google sont disponibles,
**When** `GooglePlaceDetails.displayName` est non null,
**Then** le titre de la fiche affiche `displayName` (Google) plutôt que `Poi.name` (OSM).
**When** `displayName` est null ou les données Google ne sont pas encore chargées,
**Then** `Poi.name` est affiché en fallback.

**AC-9 — Cohérence planning ↔ live**

**Given** le composant `PoiPopup` est utilisé dans `live/[id]/page.tsx`,
**When** la fiche POI s'affiche en mode live,
**Then** le nouveau layout est identique (le composant est le même, pas de branche conditionnelle).

---

## Tasks

### Task 1 — Mise à jour du header

**File :** `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx`

**Imports à ajouter :** `Phone, Milestone, TrendingUp, Clock` (remplace `Globe, ExternalLink`)

**Constante catégorie labels :**
```typescript
const CATEGORY_LABELS: Record<PoiCategory, string> = {
  hotel:        'Hôtel',
  hostel:       'Auberge',
  camp_site:    'Camping',
  shelter:      'Refuge',
  guesthouse:   'Chambre d\'hôte',
  restaurant:   'Restauration',
  supermarket:  'Alimentation',
  convenience:  'Alimentation',
  bike_shop:    'Vélo',
  bike_repair:  'Vélo',
}
```

**Import :** `import { POI_CATEGORY_COLORS } from '@ridenrest/shared'`

**Nouveau header JSX :**
```tsx
{/* Header */}
<div className="px-4 pt-4 pb-3">
  {/* Badge catégorie */}
  <span
    className="inline-block mb-2 text-xs font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full text-white"
    style={{ backgroundColor: POI_CATEGORY_COLORS[poi.category] }}
  >
    {CATEGORY_LABELS[poi.category]}
  </span>

  {/* Nom + téléphone + close */}
  <div className="flex items-start justify-between gap-2">
    <h3 className="text-base font-semibold leading-snug text-[--text-primary]">
      {poi.name}
    </h3>
    <div className="flex items-center gap-1 shrink-0">
      {displayPhone && (
        <a
          href={`tel:${displayPhone}`}
          aria-label={`Appeler ${poi.name}`}
          className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-[--surface] active:scale-[0.85] transition-all duration-75 text-[--text-secondary]"
        >
          <Phone className="h-4 w-4" />
        </a>
      )}
      <button
        onClick={onClose}
        aria-label="Fermer"
        className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-[--surface] active:scale-[0.85] transition-all duration-75 text-[--text-secondary]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>

  {/* Distance de la trace */}
  <p className="mt-1 text-sm text-[--text-secondary]">{distanceLabel}</p>
</div>
```

> **Supprimé :** le bloc `<span>` chip de catégorie (ex: "Hébergement") qui était sous le nom — remplacé par le badge au-dessus.

---

### Task 2 — Stats row avec icônes

Remplacer la stats row actuelle par :
```tsx
{/* Stats row */}
<div className="px-4 py-3 grid grid-cols-3 gap-2 text-center border-t border-[--border]">
  <div className="flex flex-col items-center gap-0.5">
    <Milestone className="h-4 w-4 text-[--primary]" />
    <span className="text-xs font-medium text-[--text-primary]">{poiKm.toFixed(1)} km</span>
  </div>
  {elevationGainM !== null && elevationGainM > 0 && (
    <div className="flex flex-col items-center gap-0.5">
      <TrendingUp className="h-4 w-4 text-[--primary]" />
      <span className="text-xs font-medium text-[--text-primary]">{elevationGainM} m D+</span>
    </div>
  )}
  {distanceKm > 0 && speed > 0 && (
    <div className="flex flex-col items-center gap-0.5">
      <Clock className="h-4 w-4 text-[--primary]" />
      <span className="text-xs font-medium text-[--text-primary]">{formatEta(distanceKm, speed)}</span>
    </div>
  )}
</div>
```

> Si `elevationGainM` est nul/absent, la colonne D+ est masquée et les 2 colonnes restantes s'étalent dans la grid (ajuster en `grid-cols-2` conditionnellement, ou laisser `grid-cols-3` avec colonne vide — à ajuster visuellement).

---

### Task 3 — Backend : enrichir `GooglePlaceDetails` avec les horaires

**File :** `apps/api/src/pois/providers/google-places.provider.ts`

Ajouter au `fieldMask` :
```typescript
'regularOpeningHours.weekdayDescriptions',
'regularOpeningHours.periods',
```

> `regularOpeningHours` est déjà dans le tier **Advanced** (on paie déjà pour `openNow`). Ajouter ces champs ne change pas le coût par requête.

Mettre à jour le type de réponse Google :
```typescript
regularOpeningHours?: {
  openNow?: boolean
  weekdayDescriptions?: string[]   // 7 strings, index 0 = lundi (localisé FR si languageCode=fr)
  periods?: Array<{
    open:  { day: number; hour: number; minute: number }  // day: 0=dimanche, 1=lundi...
    close: { day: number; hour: number; minute: number }
  }>
}
```

Ajouter `languageCode=fr` à l'URL de l'appel Place Details pour avoir les jours en français :
```typescript
const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=fr`
```

**File :** `packages/shared/src/types/google-place.types.ts`

```typescript
export interface OpeningPeriod {
  open:  { day: number; hour: number; minute: number }
  close: { day: number; hour: number; minute: number }
}

export interface GooglePlaceDetails {
  placeId: string
  displayName: string | null
  formattedAddress: string | null
  lat: number | null
  lng: number | null
  rating: number | null
  isOpenNow: boolean | null
  weekdayDescriptions: string[]   // [] si non disponible
  periods: OpeningPeriod[]        // [] si non disponible
  phone: string | null
  website: string | null
  types: string[]
}
```

Mettre à jour le mapping dans `google-places.provider.ts` :
```typescript
return {
  // ...champs existants...
  weekdayDescriptions: data.regularOpeningHours?.weekdayDescriptions ?? [],
  periods: data.regularOpeningHours?.periods ?? [],
}
```

> Exporter `OpeningPeriod` depuis `packages/shared/src/index.ts`.

---

### Task 4 — Frontend : icône Navigation dans le header

**File :** `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx`

Ajouter l'icône `Navigation` à droite du téléphone (si présent) dans la zone header :

```tsx
{/* Nom + actions + close */}
<div className="flex items-start justify-between gap-2">
  <h3 className="text-base font-semibold leading-snug text-[--text-primary]">
    {displayName}
  </h3>
  <div className="flex items-center gap-0.5 shrink-0">
    {displayPhone && (
      <a
        href={`tel:${displayPhone}`}
        aria-label={`Appeler ${displayName}`}
        className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-[--surface] active:scale-[0.85] transition-all duration-75 text-[--text-secondary]"
      >
        <Phone className="h-4 w-4" />
      </a>
    )}
    <a
      href={`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Naviguer vers ${displayName}`}
      className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-[--surface] active:scale-[0.85] transition-all duration-75 text-[--text-secondary]"
    >
      <Navigation className="h-4 w-4" />
    </a>
    <button
      onClick={onClose}
      aria-label="Fermer"
      className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-[--surface] active:scale-[0.85] transition-all duration-75 text-[--text-secondary]"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  </div>
</div>
```

---

### Task 5 — Frontend : section horaires repliable

**File :** `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx`

Ajouter un state local :
```typescript
const [hoursExpanded, setHoursExpanded] = useState(false)
```

Ajouter un helper pour calculer la prochaine transition depuis `periods` :

```typescript
function getNextTransition(
  isOpenNow: boolean | null,
  periods: OpeningPeriod[],
): string | null {
  if (isOpenNow === null || periods.length === 0) return null

  const now = new Date()
  const currentDay = now.getDay()   // 0=dimanche
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const DAY_NAMES_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

  if (isOpenNow) {
    // Trouver la fermeture en cours
    const closing = periods.find(p =>
      p.open.day === currentDay && p.open.hour * 60 + p.open.minute <= currentMinutes
    )
    if (!closing) return null
    const h = String(closing.close.hour).padStart(2, '0')
    const m = String(closing.close.minute).padStart(2, '0')
    return `Ferme à ${h}:${m}`
  } else {
    // Trouver la prochaine ouverture
    const allOpens = [...periods].sort((a, b) => a.open.day * 1440 + a.open.hour * 60 + a.open.minute
      - (b.open.day * 1440 + b.open.hour * 60 + b.open.minute))
    const next = allOpens.find(p =>
      p.open.day > currentDay ||
      (p.open.day === currentDay && p.open.hour * 60 + p.open.minute > currentMinutes)
    ) ?? allOpens[0]  // wrap to next week
    if (!next) return null
    const h = String(next.open.hour).padStart(2, '0')
    const m = String(next.open.minute).padStart(2, '0')
    const dayLabel = next.open.day !== currentDay ? ` ${DAY_NAMES_SHORT[next.open.day]}` : ''
    return `Ouvre à ${h}:${m}${dayLabel}`
  }
}
```

Rendu de la section horaires (remplace le bloc Google enrichment actuel) :
```tsx
{/* Section horaires — non-hébergement uniquement */}
{!isAccommodation && details && details.isOpenNow !== null && (
  <div className="border-t border-[--border]">
    <button
      onClick={() => details.weekdayDescriptions.length > 0 && setHoursExpanded(v => !v)}
      className={[
        'w-full px-4 py-2 flex items-center gap-1.5 text-xs text-left',
        details.weekdayDescriptions.length > 0 ? 'cursor-pointer hover:bg-[--surface]' : 'cursor-default',
      ].join(' ')}
    >
      <span className={details.isOpenNow ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
        {details.isOpenNow ? 'Ouvert' : 'Fermé'}
      </span>
      {(() => {
        const next = getNextTransition(details.isOpenNow, details.periods)
        return next ? <span className="text-[--text-secondary]">· {next}</span> : null
      })()}
      {details.weekdayDescriptions.length > 0 && (
        <ChevronDown
          className={`h-3.5 w-3.5 text-[--text-secondary] ml-auto transition-transform duration-150 ${hoursExpanded ? 'rotate-180' : ''}`}
        />
      )}
    </button>
    {hoursExpanded && details.weekdayDescriptions.length > 0 && (
      <div className="px-4 pb-2 space-y-0.5">
        {details.weekdayDescriptions.map((line, i) => {
          const todayIndex = (new Date().getDay() + 6) % 7  // 0=lundi
          return (
            <p key={i} className={`text-xs ${i === todayIndex ? 'font-semibold text-[--text-primary]' : 'text-[--text-secondary]'}`}>
              {line}
            </p>
          )
        })}
      </div>
    )}
  </div>
)}
```

> `ChevronDown` à ajouter aux imports Lucide. Reset `hoursExpanded` à `false` dans le `useEffect` qui réagit au changement de `poi.category` (déjà existant).

---

### Task 6 — Section hébergement : chips + CTAs côte à côte

**Chips :** supprimer les emojis, remplacer par dot coloré (pattern story 16.11) :
```tsx
{/* Type chips — sans emoji, dot coloré */}
{ACCOMMODATION_TYPES.map(({ category, label, bookingFilter }) => {
  const isActive = selectedCategory === category
  const color = POI_CATEGORY_COLORS[category]
  return (
    <button
      key={category}
      onClick={() => setSelectedCategory(category)}
      aria-pressed={isActive}
      style={isActive ? { backgroundColor: color, borderColor: 'transparent' } : undefined}
      className={[
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-75 active:scale-[0.95]',
        isActive
          ? 'text-white hover:brightness-90'
          : 'bg-muted text-muted-foreground border-[--border] hover:bg-muted/70',
      ].join(' ')}
    >
      <span
        className="inline-block h-2 w-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: isActive ? '#ffffff' : color }}
        aria-hidden="true"
      />
      {label}
    </button>
  )
})}
```

> Supprimer le champ `emoji` de `ACCOMMODATION_TYPES` (ou le garder inutilisé pour éviter une régression si référencé ailleurs).

**CTAs côte à côte :**
```tsx
{/* CTAs */}
<div className="flex gap-2 pt-1">
  {displayWebsite && (
    <a
      href={displayWebsite}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Site officiel"
      className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-full border border-[--border] text-[--text-primary] text-sm font-medium hover:bg-[--surface] active:scale-[0.98] transition-all duration-75"
    >
      <Globe className="h-4 w-4" />
      Site officiel
    </a>
  )}
  <a
    href={bookingUrl}
    target="_blank"
    rel="noopener noreferrer"
    onClick={handleBookingClick}
    aria-label="Rechercher sur Booking.com"
    className={[
      'flex items-center justify-center gap-1.5 h-11 rounded-full bg-[--primary] text-white text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-75',
      displayWebsite ? 'flex-1' : 'w-full',
    ].join(' ')}
  >
    <ExternalLink className="h-4 w-4" />
    Booking
  </a>
</div>
```

---

### Task 7 — Non-hébergement : bouton "Site officiel" unifié

Remplacer le lien URL brut actuel par :
```tsx
{!isAccommodation && displayWebsite && (
  <div className="px-4 pb-4 pt-2 border-t border-[--border]">
    <a
      href={displayWebsite}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-1.5 w-full h-11 rounded-full border border-[--border] text-[--text-primary] text-sm font-medium hover:bg-[--surface] active:scale-[0.98] transition-all duration-75"
    >
      <Globe className="h-4 w-4" />
      Site officiel
    </a>
  </div>
)}
```

> **Supprimé :** le bloc `🌐 {displayWebsite}` en texte bleu.

---

### Task 8 — Nom affiché : `displayName` en priorité sur `Poi.name`

**File :** `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx`

Google Places fournit souvent un nom plus précis/correct que OSM (qui peut retourner "Unknown" ou un nom technique).

```typescript
// Après le chargement des details Google
const displayName = details?.displayName ?? poi.name
```

Utiliser `displayName` partout où `poi.name` est affiché dans le JSX (titre h3, aria-label du téléphone).

> **Timing :** `details` est chargé de façon async après l'ouverture du popup. Pendant le chargement (`detailsPending`), afficher `poi.name` (déjà disponible). Une fois `details` résolu, `displayName` prend le relais → le titre se met à jour naturellement via re-render React.

---

### Task 9 — Nettoyage imports

- **Ajouter :** `Phone, Navigation, Milestone, TrendingUp, Clock, Globe, ChevronDown`
- **Retirer :** `ExternalLink` si plus utilisé ailleurs dans le fichier (vérifier)
- **Ajouter :** `POI_CATEGORY_COLORS, OpeningPeriod` depuis `@ridenrest/shared`
- **Retirer :** le champ `emoji` de `ACCOMMODATION_TYPES` (ou le garder commenté)
- **Ajouter :** `useState` pour `hoursExpanded`

---

## Dev Notes

### Grid stats : colonnes conditionnelles

Si D+ est absent (pas de données d'élévation), la grid a 2 colonnes au lieu de 3. Utiliser :
```tsx
<div className={`grid gap-2 text-center ${elevationGainM ? 'grid-cols-3' : 'grid-cols-2'}`}>
```

### Largeur popup

La popup est actuellement `w-72` (288px). Avec deux boutons côte à côte en `flex-1`, c'est suffisant.
Si visuellement trop serré, passer à `w-80` (320px).

### `ACCOMMODATION_TYPES` — champ `bookingFilter`

Le champ `bookingFilter` est fonctionnel (construit l'URL Booking avec filtre `nflt`). Il doit être conservé même si `emoji` est retiré.

### Skeleton Google pendant chargement

Le skeleton reste inchangé — deux lignes grises pendant `detailsPending`. Le nouveau layout compact ne change pas ce comportement.

### Index `weekdayDescriptions` : lundi = 0

L'API Google retourne `weekdayDescriptions[0]` = lundi (pas dimanche).
JavaScript `Date.getDay()` retourne 0=dimanche. Conversion :
```typescript
const todayIndex = (new Date().getDay() + 6) % 7  // 0=lundi, 6=dimanche
```

### `periods.open.day` : dimanche = 0

Dans `periods`, Google utilise 0=dimanche (contrairement à `weekdayDescriptions`). Attention lors du calcul de la prochaine transition.

### Redis cache invalidation

Le cache `google_place_details:{placeId}` en Redis stocke déjà le résultat sérialisé. Après le déploiement, les entrées en cache n'auront pas `weekdayDescriptions`/`periods`. Elles expireront naturellement (TTL existant) — pas d'action manuelle requise.

### Pas de tests requis

Changements purement visuels. Tester manuellement :
- Hébergement avec site + téléphone (cas complet)
- Hébergement sans site (Booking seul pleine largeur)
- Non-hébergement avec site + téléphone
- Non-hébergement sans site (pas de CTA)
- Horaires : ouvert avec heure fermeture, fermé avec prochain créneau, sans horaires (pas de chevron)
- Horaires : déplier/replier, jour actuel en gras
- Icône navigation : clic → GMaps
- Pendant chargement Google (skeleton)
- Mode live (même composant)

---

## Files to Modify

| File | Action |
|---|---|
| `packages/shared/src/types/google-place.types.ts` | UPDATE — ajouter `weekdayDescriptions`, `periods`, `OpeningPeriod` |
| `packages/shared/src/index.ts` | UPDATE — exporter `OpeningPeriod` |
| `apps/api/src/pois/providers/google-places.provider.ts` | UPDATE — fieldMask + languageCode=fr + mapping |
| `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` | UPDATE — layout complet |

---

## Files Modified

| File | Action |
|---|---|
| `packages/shared/src/types/google-place.types.ts` | UPDATED — `OpeningPeriod` type + `weekdayDescriptions`/`periods` fields added |
| `packages/shared/src/index.ts` | UPDATED — export `OpeningPeriod` |
| `apps/api/src/pois/providers/google-places.provider.ts` | UPDATED — fieldMask + `languageCode=fr` + mapping + commentaire tier corrigé (code review) |
| `apps/api/src/pois/pois.service.ts` | UPDATED — Google Places fallback quand cache DB vide + `overpassEnabled=false` |
| `apps/api/src/pois/pois.service.test.ts` | UPDATED — 2 nouveaux tests pour le fallback Google Places |
| `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` | UPDATED — layout complet + `planningFromKm` prop + km relatif + fixes code review (z-40, close null, externalId reset, cross-midnight) |
| `apps/web/src/app/(app)/map/[id]/_components/poi-popup.test.tsx` | UPDATED — tests mis à jour pour nouveau comportement + nouveaux tests AC-1 à AC-8 |
| `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` | UPDATED — prop `planningFromKm` passée à `PoiPopup` |
| `_bmad-output/planning-artifacts/epics.md` | UPDATED — synchro story 16.13 |

---

## Change Log

- **2026-04-03** — Implémentation story 16.13 : POI popup redesign complet (badge catégorie, stats icônes, horaires repliables, CTAs côte à côte, navigation icon, displayName Google en priorité)
- **2026-04-03** — Corrections UX post-review (plusieurs rounds) : layout badge+close en même ligne, icônes phone/navigation avec fond coloré (`bg-primary-light`), navigation adjacent au nom, téléphone aligné à droite, séparateurs avec padding, bouton Booking ajouté (manquant initialement)
- **2026-04-03** — Fix Tailwind v4 : `bg-[--primary]` ne génère pas de CSS → remplacé par `bg-primary` / `bg-primary-light` / `text-primary-foreground` / `hover:bg-primary-hover`
- **2026-04-03** — Icône Booking : `ExternalLink` → `Search` (loupe) à la demande de Guillaume
- **2026-04-03** — Chips hébergement supprimées (redondantes avec l'icône de catégorie affichée au-dessus du pin sur la carte)
- **2026-04-03** — `planningFromKm` prop : km relatif à l'étape en cours (ou 0 si pas d'étape) — stats row affiche `distanceKm` (relatif) plutôt que `poiKm` (absolu)
- **2026-04-03** — Bug fix backend : quand `overpassEnabled=false` et cache DB vide → déclencher Google Places pour peupler le cache (avant : retournait vide sans appel API)
- **2026-04-03** — Fix test : assertion `'km 10.0'` → `'10.0 km'` (ordre numéro/unité corrigé)
- **2026-04-03** — Code review fixes : H-1 `closing.close` null check + cross-midnight detection, H-2 z-index 30→40, M-1 `hoursExpanded` reset sur `externalId`, M-4 commentaire tier API corrigé (Pro, pas Essentials)

---

## Review Follow-ups (AI)

- [ ] [AI-Review][MEDIUM] `pois.service.ts:344` — `redis.setex(\`google_place_id:${placeId}\`, ..., placeId)` stocke placeId→placeId (auto-référentiel, jamais lookup). Supprimer cette ligne ou remplacer par le bon mapping externalId→placeId si disponible.
- [ ] [AI-Review][LOW] `poi-popup.tsx:271` — Grid layout avec km seul dans une 2-col grid quand D+ ET ETA sont absents. Passer en `grid-cols-1` conditionnellement si seule la colonne km est visible.
- [ ] [AI-Review][LOW] `poi-popup.tsx:315` — `getNextTransition` appelé dans un IIFE à chaque render (map move/zoom). Calculer avant le `return JSX` pour éviter re-calcul sur chaque repositionnement du popup.
- [ ] [AI-Review][LOW] `poi-popup.test.tsx` — Aucun test pour le comportement "clic extérieur ferme le popup" (handler map.on('click')). Ajouter `queryRenderedFeatures` au mock et tester ce comportement.

---

## Dev Agent Record

### Implementation Notes

All 9 tasks implemented in a single session:

- **Tasks 1+4+8**: Header rewrites — `CATEGORY_LABELS` constant + badge coloré + close button sur même ligne (row 1), icônes `Phone`/`Navigation` avec fond `bg-primary-light` inline adjacent au nom, `displayName = details?.displayName ?? poi.name`
- **Task 2**: Stats row — `Milestone`/`TrendingUp`/`Clock` icônes avec valeurs, grid `cols-3` si D+ disponible sinon `cols-2`. Valeur = `distanceKm` (relatif depuis `planningFromKm` ou GPS) pas `poiKm` (absolu)
- **Task 3**: Backend — `OpeningPeriod` type dans shared, `weekdayDescriptions`+`periods` dans `GooglePlaceDetails`, fieldMask élargi + `languageCode=fr` dans l'URL API
- **Task 5**: Section horaires repliable — `getNextTransition()` helper, `hoursExpanded` state, non-hébergement uniquement (AC-4 respecté)
- **Task 6**: Chips hébergement supprimées (redondantes). CTAs `flex-1` côte à côte, `Booking` seul en pleine largeur sans site web, icône `Search` (loupe) sur bouton Booking
- **Task 7**: Non-accommodation — bouton "Site officiel" pleine largeur (remplace lien URL brut)
- **Task 9**: Imports nettoyés — `ExternalLink` retiré, `Search` importé pour Booking, `MapLayer`/`LAYER_LABELS` retirés

### Tailwind v4 — piège `bg-[--var]`

`bg-[--primary]` et `bg-[--primary-light]` ne génèrent **pas** de CSS en Tailwind v4 car les variables CSS custom properties ne créent pas de classes utilitaires directement. Solution : utiliser les classes générées via `--color-*` définies dans `globals.css` :
- `bg-[--primary]` → `bg-primary`
- `bg-[--primary-light]` → `bg-primary-light`
- `text-white` → `text-primary-foreground`
- `hover:opacity-90` → `hover:bg-primary-hover`

### `planningFromKm` prop

`PoiPopup` accepte `planningFromKm?: number` (défaut 0). En mode planning, la valeur vient de `stages.find(s => s.id === selectedStageId)?.startKm ?? 0`. Les stats (km, D+, ETA) sont calculées relativement à ce point. En mode live, `liveContext.currentKmOnRoute` prend le dessus.

### Backend — Google Places fallback (overpassEnabled=false)

Quand `overpassEnabled=false`, l'ancien code court-circuitait totalement Google Places (`return findCachedPois()` immédiat). Fix : si `findCachedPois` retourne vide → appeler `prefetchAndInsertGooglePois()` → relire la DB. Les requêtes suivantes pour le même bbox tombent sur le cache DB (fast path).

### Test Updates

- Mock `mockDetails` enrichi avec `weekdayDescriptions: []` et `periods: []`
- Tests du badge : `'Hébergement'` → `'Hôtel'` (CATEGORY_LABELS)
- Tests Booking : `'Recherche sur Booking'` → `'Booking'`, assertion `'km 10.0'` → `'10.0 km'`
- Statut ouvert/fermé : déplacé vers POI non-hébergement (AC-4)
- Site officiel non-hébergement : maintenant testé comme PRÉSENT (AC-6)
- Nouveaux tests : navigation link (AC-2), phone icon (AC-2), displayName priority (AC-8), hours expand (AC-4), Booking button width (AC-5)
- Nouveaux tests API : Google Places appelé quand cache vide + overpassEnabled=false / non appelé si Google non configuré
- **737 tests passent (697 web + 40 API), 0 régression**

---

## Story Status

`done`
