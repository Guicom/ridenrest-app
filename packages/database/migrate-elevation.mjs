import pg from 'pg'
const { Pool } = pg
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
await pool.query('ALTER TABLE adventures ADD COLUMN IF NOT EXISTS total_elevation_gain_m real')
console.log('✓ total_elevation_gain_m column added')
await pool.end()
