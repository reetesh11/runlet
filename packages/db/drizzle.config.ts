import { defineConfig } from 'drizzle-kit'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'


// Find and load .env.local from the root directory
const candidates = [
  path.resolve(__dirname, "../../.env.local"),
  path.resolve(__dirname, "../../../.env.local"),
  path.resolve(process.cwd(), "../../.env.local"),
  path.resolve(process.cwd(), ".env.local"),
]

for (const c of candidates) {
  if (fs.existsSync(c)) {
    dotenv.config({ path: c })
    break
  }
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
