import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as authSchema from './schema/auth'
import * as profilesSchema from './schema/profiles'
import * as adventuresSchema from './schema/adventures'
import * as adventureSegmentsSchema from './schema/adventure-segments'
import * as accommodationsCacheSchema from './schema/accommodations-cache'
import * as weatherCacheSchema from './schema/weather-cache'
import * as coverageGapsSchema from './schema/coverage-gaps'

// SSL: Aiven uses a custom CA. Set DATABASE_CA_CERT (base64-encoded Aiven CA cert) in production
// for full TLS verification. Without it, rejectUnauthorized: false is used as fallback —
// acceptable for MVP but replace with CA cert before public launch.
// Note: NODE_TLS_REJECT_UNAUTHORIZED=0 in db:migrate scripts is the same workaround for drizzle-kit.
const sslConfig = process.env.DATABASE_CA_CERT
  ? { rejectUnauthorized: true, ca: Buffer.from(process.env.DATABASE_CA_CERT, 'base64').toString() }
  : { rejectUnauthorized: false }

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: sslConfig,
})

export const db = drizzle(pool, {
  schema: {
    ...authSchema,
    ...profilesSchema,
    ...adventuresSchema,
    ...adventureSegmentsSchema,
    ...accommodationsCacheSchema,
    ...weatherCacheSchema,
    ...coverageGapsSchema,
  },
})
