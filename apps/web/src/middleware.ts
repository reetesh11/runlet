import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'


export default withAuth(
    function middleware(req) {
        // if authenticated, allow through
        return NextResponse.next()
    },
    {
        callbacks: {
            // Return true if token exists ( user is logged in)
            authorized: ({ token }) => !!token,
        },
        pages: {
            signIn: '/login',
        },
    }

)

export const config = {
    matcher: [
        '/workspace/:path*',
        '/studio/:path*',
        '/marketplace/:path*',
        '/((?!login(?:/|$)|signup(?:/|$)|accept-invite(?:/|$)|api/auth|_next/static|_next/image|favicon\\.ico).*)'
    ],
}