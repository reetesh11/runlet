import { config } from 'dotenv'
import { existsSync } from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import postgres from 'postgres'

const envLocal = path.resolve(__dirname, '../../../.env.local')
if (existsSync(envLocal)) config({ path: envLocal })

async function main() {
  const url = process.env.DATABASE_URL
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed')
    return
  }
  if (!url) throw new Error('DATABASE_URL is not set')

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
  const passwordHash = await bcrypt.hash(password, 12)

  await client`
    INSERT INTO users (id, email, name, password_hash, email_verified)
    VALUES ('user_seed_001', ${email}, 'Runlet Admin', ${passwordHash}, NOW())
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      email_verified = COALESCE(users.email_verified, NOW())
  `

  console.log(`✅ Admin user upserted: ${email}`)
  await client.end()
}

main().catch(err => { console.error(err); process.exit(1) })
