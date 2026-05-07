import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '.env.local') })
config({ path: path.join(__dirname, '../../.env.local') })



const nextConfig = {
  transpilePackages: ['@runlet/db', '@runlet/schemas', '@runlet/types', '@runlet/utils'],
  experimental: { serverComponentsExternalPackages: ['@neondatabase/serverless', 'postgres'] },
}
export default nextConfig
