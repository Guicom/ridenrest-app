import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as authSchema from './schema/auth'
import * as profilesSchema from './schema/profiles'
import * as adventuresSchema from './schema/adventures'
import * as adventureSegmentsSchema from './schema/adventure-segments'
import * as accommodationsCacheSchema from './schema/accommodations-cache'
import * as weatherCacheSchema from './schema/weather-cache'
import * as coverageGapsSchema from './schema/coverage-gaps'

// SSL: localhost connections (local Docker) skip TLS entirely.
// Production (Aiven) uses a custom CA cert (DATABASE_CA_CERT, base64-encoded) for full TLS
// verification. Without a CA cert, NODE_TLS_REJECT_UNAUTHORIZED=0 is set as fallback —
// acceptable for MVP but replace with CA cert before public launch.
const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')

const sslConfig = isLocal
  ? false
  : process.env.DATABASE_CA_CERT
    ? { rejectUnauthorized: true, ca: Buffer.from(process.env.DATABASE_CA_CERT, 'base64').toString() }
    : (() => {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
        return { rejectUnauthorized: false }
      })()

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
