import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'


function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL environment variable is required')

  const client = postgres(url, { prepare: false })
  return drizzle(client, { schema })
}


// Singleton for server-side usage
let _db: ReturnType<typeof getDb> | undefined

export function getDatabase() {
  if (!_db) _db = getDb()
  return _db
}

export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop) {
    return getDatabase()[prop as keyof ReturnType<typeof getDb>]
  },
})

export type Database = ReturnType<typeof getDb>
