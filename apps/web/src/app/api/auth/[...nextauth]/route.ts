import NextAuth, { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GithubProvider from 'next-auth/providers/github'
import GoogleProvider from 'next-auth/providers/google'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@runlet/db'
import { generateId } from '@runlet/utils'

function createDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is missing')

  const client = postgres(url, { max: 1, prepare: false })
  return { db: drizzle(client, { schema }), client }
}


export const authOptions: NextAuthOptions = {
  // Use JWT strategy - no DB writes needed for sessions 
  // Much simpler for dev, can switch to databse strategy later if needed

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },

  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET ?? '',
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
    CredentialsProvider({
      name: 'Dev Login',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'admin@runlet.ai' },
      },
      async authorize(credentials) {
        // check if the email is there or not
        if (!credentials?.email) return null

        console.log('[Auth] Attempting login for:', credentials.email)

        const { db, client } = createDb()

        try {
          // find or create user
          let user = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.email, credentials.email),
          })

          if (!user) {
            console.log('[Auth] Creating new user:', credentials.email)

            const [newUser] = await db.insert(schema.users).values({
              id: generateId('usr'),
              email: credentials.email,
              name: credentials.email.split('@')[0],
              emailVerified: new Date(),
            }).returning()

            user = newUser

            //Create a workspace for the new use 
            const name = user!.name ?? credentials.email.split('@')[0]
            const wsId = generateId('ws')
            const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + wsId.slice(-4)
            await db.insert(schema.workspaces).values({
              id: wsId,
              name: `${name}'s Workspace`,
              slug,
            }).catch(() => { })
            await db.insert(schema.workspaceMembers).values({
              id: generateId('wm'),
              workspaceId: wsId,
              userId: user!.id,
              role: 'owner',
            }).catch(() => { })
            console.log('[Auth] Created workspace and membership', wsId, 'for user', user!.id)
          } else {
            console.log('[Auth] User already exists, skipping workspace creation')
          }

          return {
            id: user!.id,
            email: user!.email,
            name: user!.name,
          }
        } catch (error) {
          console.error('[Auth] Error creating workspace and membership:', error)
        } finally {
          await client.end()
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
      // on first signin, user object is available - persist id to token
      if (user) {
        token.id = user.id
        console.log('[Auth] JWT created for user:', user.id)
      }
      return token
    },
    async session({ session, token }) {
      // Make user.id available in sessions
      if (token && session.user) {
        (session.user as typeof session.user & { id: string }).id = token.id as string
        console.log('[Auth] Session created for user:', token.id)
      }
      return session
    },
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
