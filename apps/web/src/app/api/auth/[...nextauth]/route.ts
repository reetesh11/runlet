import NextAuth, { type NextAuthOptions, type User } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GithubProvider from 'next-auth/providers/github'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@runlet/db'
import { generateId } from '@runlet/utils'

function createDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const client = postgres(url, { max: 1, prepare: false })
  return { db: drizzle(client, { schema }), client }
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? 'placeholder',
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET ?? 'placeholder',
    }),
    CredentialsProvider({
      name: 'Dev Login',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'admin@runlet.ai' },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email) return null

        console.log('[Auth] Attempting login for:', credentials.email)

        const { db, client } = createDb()
        try {
          let user = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.email, credentials.email),
          })

          if (!user) {
            console.log('[Auth] Creating new user for:', credentials.email)
            const [newUser] = await db.insert(schema.users).values({
              id: generateId('usr'),
              email: credentials.email,
              name: credentials.email.split('@')[0],
              emailVerified: new Date(),
            }).returning()
            user = newUser

            const name = user!.name ?? credentials.email.split('@')[0]
            const wsId = generateId('ws')
            const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + wsId.slice(-4)
            await db.insert(schema.workspaces).values({
              id: wsId,
              name: `${name}'s Workspace`,
              slug,
            })
            await db.insert(schema.workspaceMembers).values({
              id: generateId('wm'),
              workspaceId: wsId,
              userId: user!.id,
              role: 'owner',
            })
          } else {
            console.log('[Auth] Found existing user:', user.id)
          }

          await client.end()

          return {
            id: user!.id,
            email: user!.email,
            name: user!.name ?? null,
          } as User

        } catch (err) {
          console.error('[Auth] Error in authorize:', err)
          await client.end()
          return null
        }
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as typeof session.user & { id: string }).id = token.id as string
      }
      return session
    },
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
