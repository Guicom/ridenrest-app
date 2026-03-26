import type { Config } from 'drizzle-kit'

// NODE_TLS_REJECT_UNAUTHORIZED=0 bypass for self-signed certs (dev/VPS)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

export default {
  schema: './src/schema/*.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  },
  verbose: true,
  strict: true,
} satisfies Config
