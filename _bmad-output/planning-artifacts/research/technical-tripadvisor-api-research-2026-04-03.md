---
stepsCompleted: [1, 2]
inputDocuments: []
workflowType: 'research'
lastStep: 2
research_type: 'technical'
research_topic: 'TripAdvisor API — POIs hôtels et restaurants pour Ride''n''Rest'
research_goals: 'Évaluer l''API TripAdvisor comme source de POIs (hôtels + restaurants) : coûts, capacités de recherche géolocalisée, compatibilité avec le modèle corridor GPX, contraintes de licence, et valeur ajoutée vs Overpass + Google Places'
user_name: 'Guillaume'
date: '2026-04-03'
web_research_enabled: true
source_verification: true
---

# Research Report: TripAdvisor Content API for Ride'n'Rest

**Date:** 2026-04-03
**Author:** Guillaume
**Research Type:** Technical
**Topic:** Évaluation de l'API TripAdvisor comme source de POIs (hôtels + restaurants)

---

## Research Overview

This report evaluates the TripAdvisor Content API as a potential additional POI source (hotels and restaurants) for the Ride'n'Rest bikepacking application. The research covers pricing, technical capabilities, licensing constraints, and value comparison against the current stack (Overpass API + Google Places).

**Methodology:** Parallel web research with multi-source verification across official TripAdvisor documentation, developer portals, and independent technical analyses.

---

## Technical Research Scope Confirmation

**Research Topic:** TripAdvisor API — POIs hôtels et restaurants pour Ride'n'Rest
**Research Goals:** Évaluer coûts, capacités géolocalisées, compatibilité corridor GPX, contraintes de licence, valeur ajoutée vs stack actuel

**Technical Research Scope:**

- Pricing & tiers — free tier, cost per request, monthly quotas
- API endpoints & capabilities — geo search, data fields, authentication
- License & display constraints — commercial use, attribution, caching
- Compatibility with corridor search model
- Comparison vs Overpass + Google Places

**Scope Confirmed:** 2026-04-03

---

## Technology Stack Analysis

### TripAdvisor Content API — Overview

The TripAdvisor Content API (v1) provides access to TripAdvisor's travel-focused POI database covering hotels, restaurants, and attractions. It is designed for B2C consumer-facing websites and apps that drive traffic back to TripAdvisor.

_API Base URL: `https://api.content.tripadvisor.com/api/v1/`_
_Authentication: API Key (query parameter `key`)_
_Response Format: JSON_
_Source: [TripAdvisor Content API Overview](https://tripadvisor-content-api.readme.io/reference/overview)_

### Pricing & Rate Limits

| Tier | Cost | Limits |
|------|------|--------|
| **Free (Dev/QA)** | $0 (credit card required) | 50 calls/sec, 1,000 calls/day |
| **Free (Production)** | $0 (first 5,000 calls/month) | 10,000 calls/day for Search APIs |
| **Pay-as-you-go** | Volume-based (undisclosed per-call rate) | Tiered discounts with volume |
| **Enterprise** | Contact sales | 500,000+ calls/month |

**Key details:**
- First 5,000 API calls/month included free after signup
- Credit card required at registration
- Overages billed automatically (pay-as-you-go)
- Rate limiting via 24-hour rolling window, resets at midnight UTC
- HTTP 429 response on overage
- User-configurable daily budget controls
- **Requires "approved partner" status** (application/approval process)

_Source: [TripAdvisor API FAQ](https://tripadvisor-content-api.readme.io/reference/faq), [Rate Limits](https://tripadvisor-content-api.readme.io/reference/rate-limits)_

### Endpoints for POI Search

**Two relevant endpoints:**

#### 1. Nearby Search (geo-based)
`GET /location/nearby_search`
- **Parameters:** `latLong`, `radius`, `radiusUnit` (km/mi/m), `category` (hotels, restaurants, attractions, geos)
- **Returns:** Up to **10 results per request**
- **Fields:** location_id, name, distance, bearing, address_obj (street, city, state, country, postal_code, full_address)

#### 2. Location Search (text-based)
`GET /location/search`
- **Parameters:** `searchQuery`, optional `latLong` for relevance sorting, `category`
- **Returns:** Up to **10 results per request**

**Additional endpoints (separate calls per location):**
- `/location/{id}/details` — Full details (description, rating, price_level, hours, website, phone)
- `/location/{id}/photos` — Photos
- `/location/{id}/reviews` — Reviews

_Source: [Nearby Search](https://tripadvisor-content-api.readme.io/reference/searchfornearbylocations), [Location Search](https://tripadvisor-content-api.readme.io/reference/searchforlocations)_

### Licensing & Display Constraints

#### Commercial Use
- ✅ Allowed for **B2C consumer-facing** websites and apps
- ❌ Cannot use with AI/machine learning (training/fine-tuning)
- ❌ Cannot resell or transfer data to third parties
- ❌ Cannot use alongside "competitive products" (ambiguous — could include Booking.com links)
- API granted "solely for traffic acquiring purposes" — must drive users to TripAdvisor

#### Attribution Requirements (Mandatory)
- **TripAdvisor logo** on every display (min 20px height, specific color rules)
- **Bubble ratings** from API only (min 55px wide), with Ollie logo
- **Link back** to TripAdvisor website for each location
- **Date citations** for rankings
- All content must be **non-indexable by search engines**

#### Data Caching Policy (Highly Restrictive)
- ✅ `location_id` can be cached indefinitely
- ❌ **NO caching** of reviews, ratings, photos, or details
- ❌ Cannot store or index non-ID data locally
- ❌ Must serve TripAdvisor logos from their URLs (no local storage)
- Recommended cache for ratings: up to 7 days only

_Source: [API Master Terms](https://tripadvisor-content-api.readme.io/reference/api-master-terms-new), [Display Requirements](https://tripadvisor-content-api.readme.io/reference/display-requirements), [Caching Policy](https://tripadvisor-content-api.readme.io/reference/caching-policy)_

### TripAdvisor Affiliate Program (Separate from API)

- **Commission:** 50% minimum (up to 80% with higher conversion)
- **Model:** Pay-per-click-out (no booking required for commission)
- **Cookie window:** 14 days
- **Network:** Commission Junction
- **NOT integrated with Content API** — must manage affiliate links separately
- Free to join

_Source: [TripAdvisor Affiliates](https://www.tripadvisor.com/affiliates), [GetLasso Review](https://getlasso.co/affiliate/tripadvisor/)_

### Compatibility with Ride'n'Rest Corridor Search

**Critical limitations for corridor-based search:**

| Requirement | TripAdvisor API | Impact |
|-------------|-----------------|--------|
| Geo search (lat/lng + radius) | ✅ Supported | Compatible |
| Results per query | ⚠️ **Max 10** | Requires many calls along corridor |
| Caching results | ❌ **Forbidden** (except location_id) | Incompatible with `accommodations_cache` table |
| Pagination | ❌ Not available | Cannot get more than 10 results per point |
| Corridor/polyline search | ❌ Not supported | Must sample points along route |

**API call estimation for a typical corridor search:**
- 200km route, sampled every 5km = 40 points
- 2 categories (hotels + restaurants) = 80 API calls per search
- 3 searches/month (free tier) = 240 calls → fits in 5,000/month
- **BUT:** Cannot cache results in DB → must re-fetch every time user views the route

### Comparison: TripAdvisor vs Current Stack

| Criterion | Overpass (OSM) | Google Places | TripAdvisor |
|-----------|---------------|---------------|-------------|
| **Cost** | 100% free | Per-request billing | 5,000 free/month |
| **Commercial license** | ✅ ODbL | ✅ | ⚠️ B2C + traffic referral required |
| **Geo search** | ✅ Bounding box/radius | ✅ lat/lng + radius | ✅ lat/lng + radius |
| **Results per query** | Unlimited | 20+ | **10 max** |
| **Data caching** | ✅ Allowed | ⚠️ 30 days | ❌ **Forbidden** |
| **Hotels coverage** | Good (Europe++) | Excellent | Very good (tourism focus) |
| **Restaurants coverage** | Good | Excellent | Very good |
| **Unique data** | Community-maintained | Real-time popularity | Traveler reviews, ratings |
| **Attribution** | "© OSM contributors" | Google logo | Logo + ratings + links + non-indexable |
| **Setup complexity** | Low | Medium | High (approval process) |
| **Corridor compatibility** | ✅ Excellent (ST_DWithin) | ✅ Good | ⚠️ Poor (10 results, no cache) |

### Key Findings

1. **Pricing is deceptively affordable** — 5,000 free calls/month sounds generous, but the **no-caching policy** means every route view requires fresh API calls, burning through quota fast.

2. **10 results max per query** is a hard limitation — for corridor searches along a 200km route, you'd miss POIs in dense areas and waste calls in sparse ones.

3. **Caching prohibition kills the architecture** — Ride'n'Rest's `accommodations_cache` table with `dist_from_trace_m` and `dist_along_route_km` is core to the UX. TripAdvisor data cannot be stored this way.

4. **"Traffic acquiring" license** creates tension — the API exists to drive users TO TripAdvisor, but Ride'n'Rest drives users to Booking.com/Expedia. The "no competitive products" clause is a risk.

5. **Marginal data value** — Hotels and restaurants already well-covered by Overpass + Google Places. TripAdvisor's unique value (reviews/ratings) is explicitly NOT what Guillaume wants.

6. **Heavy branding requirements** add UI complexity — mandatory logos, bubble ratings, and non-indexable content constraints are significant for a mobile-first app.

<!-- Content will be appended sequentially through research workflow steps -->
