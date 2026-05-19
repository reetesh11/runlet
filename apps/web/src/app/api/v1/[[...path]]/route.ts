import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.API_URL ?? 'http://localhost:3001'
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? 'dev-internal-secret'

async function proxyRequest(req: NextRequest, params: { path?: string[] }) {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as { id: string }).id
    const path = params.path?.join('/') ?? ''
    const search = req.nextUrl.search
    const targetUrl = `${API_BASE}/v1/${path}${search}`

    // Forward the request body
    let body: string | undefined
    const contentType = req.headers.get('content-type') ?? ''
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        body = await req.text()
    }

    // Build forwarded headers
    const headers: Record<string, string> = {
        'Content-Type': contentType || 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET,
        'X-User-Id': userId,
        'X-User-Email': session.user.email ?? '',
        'X-Workspace-Id': req.headers.get('X-Workspace-Id') ?? '',
    }

    console.log(`[Proxy] ${req.method} /api/v1/${path} → ${targetUrl} (user: ${userId})`)

    const resp = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
    })

    const respBody = await resp.text()

    return new NextResponse(respBody, {
        status: resp.status,
        headers: {
            'Content-Type': resp.headers.get('Content-Type') ?? 'application/json',
        },
    })
}

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
    return proxyRequest(req, params)
}

export async function POST(req: NextRequest, { params }: { params: { path?: string[] } }) {
    return proxyRequest(req, params)
}

export async function PATCH(req: NextRequest, { params }: { params: { path?: string[] } }) {
    return proxyRequest(req, params)
}

export async function PUT(req: NextRequest, { params }: { params: { path?: string[] } }) {
    return proxyRequest(req, params)
}

export async function DELETE(req: NextRequest, { params }: { params: { path?: string[] } }) {
    return proxyRequest(req, params)
}
