// Pool config lives in packages/database/src/db.ts (shared, single source of truth).
// This file re-exports db so NestJS feature modules have a stable import path within apps/api.
// IMPORTANT: pool max:10 — Aiven free tier cap (25 total = 10 NestJS + 5 CI + 10 margin)
export { db } from '@ridenrest/database'
