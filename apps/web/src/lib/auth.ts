import type { NextAuthOptions, User } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GithubProvider from 'next-auth/providers/github'
import { compare } from 'bcryptjs'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@runlet/db'
import { generateId } from '@runlet/utils'

function createAuthDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const client = postgres(url, { max: 1, prepare: false, connect_timeout: 10 })
  return { db: drizzle(client, { schema }), client }
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET ?? '',
    }),
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials?.password) return null
        // Prevent bcrypt DoS — passwords longer than 72 chars are never valid
        if (credentials.password.length > 72) return null

        const { db, client } = createAuthDb()
        try {
          const user = await db.query.users.findFirst({
            where: (u, { eq }) =>
              eq(u.email, credentials.email.toLowerCase().trim()),
          })

          if (!user?.passwordHash) return null

          const passwordMatch = await compare(credentials.password, user.passwordHash)
          if (!passwordMatch) return null

          return {
            id: user.id,
            email: user.email,
            name: user.name ?? null,
            image: user.image ?? null,
          } as User
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
    async jwt({ token, user, account }) {
      if (account && user) {
        if (account.provider === 'github') {
          const { db, client } = createAuthDb()
          try {
            if (!user.email) {
              throw new Error('GitHub account has no public email. Make your email public on GitHub or use a different sign-in method.')
            }

            let dbUser = await db.query.users.findFirst({
              where: (u, { eq }) => eq(u.email, user.email!),
            })

            if (!dbUser) {
              const [newUser] = await db
                .insert(schema.users)
                .values({
                  id: generateId('usr'),
                  email: user.email!,
                  name: user.name ?? null,
                  image: user.image ?? null,
                  emailVerified: new Date(),
                })
                .returning()
              dbUser = newUser
            }

            token.id = dbUser!.id
          } finally {
            await client.end()
          }
        } else {
          token.id = user.id
        }
      }
      return token
    },

    async session({ session, token }) {
      if (token && session.user) {
        (session.user as typeof session.user & { id: string }).id =
          token.id as string
      }
      return session
    },
  },
}
