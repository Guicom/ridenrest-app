import pg from 'pg'
const { Pool } = pg
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
await pool.query('ALTER TABLE adventures ADD COLUMN IF NOT EXISTS density_progress integer NOT NULL DEFAULT 0')
console.log('✓ density_progress column added')
await pool.end()
