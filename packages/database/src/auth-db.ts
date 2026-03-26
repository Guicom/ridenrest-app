import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as authSchema from './schema/auth'

// Dedicated pool for Next.js / Better Auth (previously serverless/Vercel, now VPS).
// max: 2 — conservative default; local Docker has no connection limit.
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

const authPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: sslConfig,
})

export const authDb = drizzle(authPool, { schema: authSchema })
