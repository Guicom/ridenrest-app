import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as authSchema from './schema/auth'

// Dedicated pool for serverless contexts (e.g., Next.js / Better Auth on Vercel).
// max: 2 — Aiven free tier budget: NestJS max:10 + this max:2 + CI/CD max:5 = 17/25 connections.
// Do NOT use the shared `db` (max:10) from NestJS in serverless — concurrent Vercel function
// instances would each spin up a max:10 pool and exhaust Aiven's 25-connection limit.
const sslConfig = process.env.DATABASE_CA_CERT
  ? { rejectUnauthorized: true, ca: Buffer.from(process.env.DATABASE_CA_CERT, 'base64').toString() }
  : { rejectUnauthorized: false }

const authPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: sslConfig,
})

export const authDb = drizzle(authPool, { schema: authSchema })
