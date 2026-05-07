// import { neon } from '@neondatabase/serverless'
import postgres from 'postgres'
import path from 'path'
import fs from "fs"


async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("\n DATABASE_URL is not set")
    console.error("\n Please set DATABASE_URL in your .env.local file")
    console.error(" Make sure .env.local exists in the monorepo root")
    process.exit(1)
  }
  console.log("Connecting to database...")
  // const sql = neon(url)
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => { } })

  // read and applky migration files directly - no drizzle migrator needed
  const migrationsDir = path.join(__dirname, '../migrations')
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  if (migrationFiles.length === 0) {
    console.error("No migration files found in ", migrationsDir)
    process.exit(1)
  }

  console.log("Migrations to be applied: ", migrationFiles)
  // create a simple migrations tracking table if not exists
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `)


  for (const file of migrationFiles) {
    // check if already applied
    const already = await client`
    SELECT id from __drizzle_migrations where filename = ${file}
    `
    if (already.length > 0) {
      console.log(`Migration ${file} already applied`)
      continue
    }

    console.log(`Applying migration ${file}`)
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')

    //split on ---> statement-breakpoint if present, otherwise run as whole
    const statements = sql.includes('--- statement-breakpoint') ? sql.split('--- statement-breakpoint').map(s => s.trim()).filter(Boolean) : [sql]

    for (const stmt of statements) {
      await client.unsafe(stmt)
    }

    // mark as applied
    await client`
    INSERT INTO __drizzle_migrations (filename) VALUES (${file})
    `
    console.log(`Applied migration ${file}`)
  }

  console.log("\n All migrations completed")
  await client.end()
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
