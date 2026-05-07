import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'

async function reset() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot reset production database!')
  }
  const sqlFn = neon(process.env.DATABASE_URL!)
  const db = drizzle(sqlFn)
  console.log('Dropping all tables...')
  await db.execute(sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`)
  console.log('Done. Run pnpm db:migrate && pnpm db:seed to restore.')
  process.exit(0)
}

reset().catch(err => { console.error(err); process.exit(1) })
