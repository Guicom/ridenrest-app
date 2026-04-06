# Story 15.4: Dashboard Admin `/admin/analytics`

Status: ready-for-dev

## Story

As **Guillaume (admin)**,
I want a protected `/admin/analytics` page in the app that surfaces key metrics for the Booking.com affiliate application,
So that I can quickly generate a snapshot report without navigating Plausible's full interface.

## Acceptance Criteria (BDD)

1. **Given** a user navigates to `/admin/analytics`,
   **When** their session is checked,
   **Then** access is restricted to users with email `guillaume@ridenrest.app` (or a configurable `ADMIN_EMAILS` env var) — non-admin users receive a 403.

2. **Given** the page loads for an admin user,
   **When** the dashboard renders,
   **Then** the following metrics are displayed for the current month and the previous month (for comparison):
   - Total unique visitors
   - Total sessions
   - Total `booking_click` events
   - Booking click rate (booking_clicks / poi_detail_opened x 100%)
   - Top 5 POI types by booking clicks
   - Breakdown by source (booking.com vs airbnb)

3. **Given** the metrics are displayed,
   **When** inspecting the data source,
   **Then** metrics are fetched from Plausible's Stats API (`/api/v1/stats/*`) using a `PLAUSIBLE_API_KEY` server-side environment variable — key never exposed to the browser.

4. **Given** an admin wants to export data for the Booking.com application,
   **When** they click "Exporter CSV",
   **Then** a CSV file is downloaded containing monthly aggregates: month, unique_visitors, sessions, booking_clicks, booking_click_rate — covering all available months since launch.

## Tasks / Subtasks

- [ ] **Task 1: Create admin route group** (AC: #1)
  - [ ] Create `apps/web/src/app/(app)/admin/layout.tsx` — server component with admin guard
  - [ ] Admin check: read session server-side via `auth.api.getSession()` (Better Auth server-side)
  - [ ] Compare `session.user.email` against `ADMIN_EMAILS` env var (comma-separated, default: `guillaume@ridenrest.app`)
  - [ ] Non-admin → `redirect('/adventures')` or render 403 page
  - [ ] `ADMIN_EMAILS` is server-only (no `NEXT_PUBLIC_` prefix) — never exposed to client

- [ ] **Task 2: Create `/admin/analytics` page** (AC: #2)
  - [ ] Create `apps/web/src/app/(app)/admin/analytics/page.tsx` — server component
  - [ ] Fetch metrics server-side from Plausible Stats API (SSR, no client-side fetch)
  - [ ] Display current month and previous month side by side
  - [ ] Use shadcn/ui `Card` components for metric cards (same pattern as settings page)
  - [ ] Metrics layout: 2-column grid on desktop, single column on mobile

- [ ] **Task 3: Plausible Stats API integration** (AC: #3)
  - [ ] Create `apps/web/src/lib/plausible-api.ts` — server-only module
  - [ ] Use `PLAUSIBLE_API_KEY` env var (server-side only)
  - [ ] Base URL: `PLAUSIBLE_HOST` (same as `NEXT_PUBLIC_PLAUSIBLE_HOST` but internal)
  - [ ] Endpoints to call:
    - `GET /api/v1/stats/aggregate` — visitors, visits (sessions)
    - `GET /api/v1/stats/breakdown` — breakdown by event props
  - [ ] Query params: `site_id=ridenrest.app`, `period=month`, `date=YYYY-MM-01`
  - [ ] For custom events: `filters=event:name==booking_click`
  - [ ] For poi_type breakdown: `property=event:props:poi_type`
  - [ ] For source breakdown: `property=event:props:source`

- [ ] **Task 4: Metrics computation** (AC: #2)
  - [ ] Unique visitors: from aggregate API
  - [ ] Sessions: from aggregate API (`visits` metric)
  - [ ] Total `booking_click`: from aggregate API with event filter
  - [ ] Total `poi_detail_opened`: from aggregate API with event filter
  - [ ] Click rate: `(booking_clicks / poi_detail_opened) * 100` — handle division by zero → "N/A"
  - [ ] Top 5 POI types: from breakdown API filtered on `booking_click` events, sorted desc
  - [ ] Source breakdown: from breakdown API with `property=event:props:source`

- [ ] **Task 5: CSV export** (AC: #4)
  - [ ] Create `apps/web/src/app/(app)/admin/analytics/export/route.ts` — Route Handler (GET)
  - [ ] Admin guard (same email check as layout)
  - [ ] Query Plausible Stats API for each month since site creation
  - [ ] Generate CSV: `month,unique_visitors,sessions,booking_clicks,booking_click_rate`
  - [ ] Return with headers: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="ridenrest-analytics-YYYY-MM-DD.csv"`
  - [ ] Button on the page: `<a href="/admin/analytics/export">Exporter CSV</a>` with download attribute

- [ ] **Task 6: Tests** (AC: #1, #2)
  - [ ] Vitest: admin layout — verify redirect for non-admin users
  - [ ] Vitest: plausible-api.ts — verify correct API calls with mocked fetch
  - [ ] Vitest: analytics page — verify metrics render with mocked data
  - [ ] Vitest: CSV route — verify correct CSV format and headers

## Dev Notes

### Admin Guard Pattern

No existing admin pattern in the codebase — this is the first admin page. Pattern to establish:

```typescript
// apps/web/src/app/(app)/admin/layout.tsx
import { auth } from '@/lib/auth/server'
import { redirect } from 'next/navigation'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'guillaume@ridenrest.app').split(',').map(e => e.trim())

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
    redirect('/adventures')
  }
  return <>{children}</>
}
```

### Plausible Stats API v1

Base: `https://stats.ridenrest.app/api/v1/stats`
Auth: `Authorization: Bearer <PLAUSIBLE_API_KEY>`

Key endpoints:
- `/aggregate?site_id=ridenrest.app&period=month&date=2026-04-01&metrics=visitors,visits`
- `/aggregate?site_id=ridenrest.app&period=month&filters=event:name==booking_click&metrics=events`
- `/breakdown?site_id=ridenrest.app&period=month&property=event:props:source&filters=event:name==booking_click`
- `/breakdown?site_id=ridenrest.app&period=month&property=event:props:poi_type&filters=event:name==booking_click&limit=5`

### UI Components

Use existing shadcn/ui `Card`, `CardHeader`, `CardContent` (documented in project-context.md, story 16.6 pattern). No new UI components needed.

```
/admin/analytics layout:
┌─────────────────────────────────────────┐
│ Analytics Dashboard — Booking.com Report│
├──────────────────┬──────────────────────┤
│  This Month      │  Last Month          │
│  ┌────┐ ┌────┐   │  ┌────┐ ┌────┐      │
│  │Vis │ │Sess│   │  │Vis │ │Sess│      │
│  └────┘ └────┘   │  └────┘ └────┘      │
│  ┌────┐ ┌────┐   │  ┌────┐ ┌────┐      │
│  │Clk │ │Rate│   │  │Clk │ │Rate│      │
│  └────┘ └────┘   │  └────┘ └────┘      │
├──────────────────┴──────────────────────┤
│ Top POI Types by Booking Clicks         │
│ 1. hotel (42) 2. hostel (18) ...        │
├─────────────────────────────────────────┤
│ Source Breakdown                        │
│ booking.com: 85%  |  airbnb: 15%       │
├─────────────────────────────────────────┤
│ [Exporter CSV]  [Ouvrir Plausible ↗]   │
└─────────────────────────────────────────┘
```

### Env Vars

- `PLAUSIBLE_API_KEY` — server-only, generated in Plausible dashboard (story 15.1 Task 4)
- `ADMIN_EMAILS` — server-only, comma-separated, default `guillaume@ridenrest.app`
- Both go in VPS `.env` (not in `turbo.json` — server-only, no cache invalidation needed)

### Dependencies

- Depends on Story 15.1 (Plausible running + API key)
- Depends on Story 15.2 and 15.3 (custom events must exist for meaningful data)
- Page works without data (shows zeros/N/A) — graceful if Plausible is empty

### Project Structure Notes

- New route: `apps/web/src/app/(app)/admin/layout.tsx` — admin guard
- New route: `apps/web/src/app/(app)/admin/analytics/page.tsx` — dashboard
- New route: `apps/web/src/app/(app)/admin/analytics/export/route.ts` — CSV export
- New lib: `apps/web/src/lib/plausible-api.ts` — server-only Plausible API client
- Admin route is inside `(app)` group — auth-gated, `noindex`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 15, Story 15.4]
- [Source: apps/web/src/app/(app)/settings/page.tsx — existing auth-gated page pattern]
- [Source: project-context.md — Next.js App Router rules, Card component pattern]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
