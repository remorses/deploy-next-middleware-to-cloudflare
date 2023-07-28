import { NextRequest } from 'next/dist/esm/server/web/spec-extension/request'
import { NextResponse } from 'next/dist/esm/server/web/spec-extension/response'

async function processMiddlewareResp(
    request: Request,
    resp: Response,
    finalUrl: string,
) {
    resp = new NextResponse(resp.body, resp)
    const overrideKey = 'x-middleware-override-headers'
    const overrideHeader = resp.headers.get(overrideKey)
    if (overrideHeader) {
        const overridenHeaderKeys = new Set(
            overrideHeader.split(',').map((h) => h.trim()),
        )

        for (const key of overridenHeaderKeys.keys()) {
            const valueKey = `x-middleware-request-${key}`
            const value = resp.headers.get(valueKey)
            if (request.headers.get(key) !== value) {
                if (value) {
                    request.headers.set(key, value)
                } else {
                    request.headers.delete(key)
                }
            }
            resp.headers.delete(valueKey)
        }
        resp.headers.delete(overrideKey)
    }

    const rewriteKey = 'x-middleware-rewrite'
    const rewriteHeader = resp.headers.get(rewriteKey)
    if (rewriteHeader) {
        resp.headers.delete(rewriteKey)
        if (rewriteHeader.startsWith('/')) {
            const url = new URL(request.url)
            const rewritten = new URL(url.pathname + url.search, finalUrl)
            return withRespHeaders(rewritten, resp)
        }
        const url = safeUrl(rewriteHeader)
        if (url) {
            return withRespHeaders(await fetch(url.toString(), request), resp)
        }
    }

    const middlewareNextKey = 'x-middleware-next'
    const middlewareNextHeader = resp.headers.get(middlewareNextKey)
    if (middlewareNextHeader) {
        resp.headers.delete(middlewareNextKey)
        const url = new URL(request.url)
        const rewritten = new URL(url.pathname + url.search, finalUrl)
        return withRespHeaders(await fetch(rewritten.toString(), request), resp)
    } else if (!rewriteHeader && !resp.headers.has('location')) {
        // We should set the final response body and status to the middleware's if it does not want
        // to continue and did not rewrite/redirect the URL.

        return new Response(resp.body, {
            status: resp.status,
            headers: resp.headers,
        })
    }

    return new Response(null, { status: resp.status, headers: resp.headers })
}

function withRespHeaders(resp1, resp2) {
    applyHeaders(resp1.headers, resp2.headers)
    return resp1
}

function applySearchParams(target: URLSearchParams, source: URLSearchParams) {
    for (const [key, value] of source.entries()) {
        const paramMatch = /^nxtP(.+)$/.exec(key)
        if (paramMatch?.[1]) {
            target.set(key, value)
            target.set(paramMatch[1], value)
        } else if (
            !target.has(key) ||
            (!!value && !target.getAll(key).includes(value))
        ) {
            target.append(key, value)
        }
    }
}

function applyHeaders(
    target: Headers,
    source: Record<string, string> | Headers,
): void {
    const entries =
        source instanceof Headers ? source.entries() : Object.entries(source)
    for (const [key, value] of entries) {
        const lowerKey = key.toLowerCase()

        if (lowerKey === 'set-cookie') {
            target.append(lowerKey, value)
        } else {
            target.set(lowerKey, value)
        }
    }
}

function safeUrl(url: string) {
    try {
        return new URL(url)
    } catch (e) {
        return null
    }
}

export function middlewareAdapter({ middlewareModule, finalUrl }) {
    if (!middlewareModule) {
        throw new Error('Missing middlewareModule')
    }
    if (typeof middlewareModule !== 'function') {
        throw new Error('middlewareModule must be a function')
    }
    const worker: ExportedHandler = {
        async fetch(request, env, context) {
            globalThis.__ENV__ = env
            try {
                // @ts-ignore
                context.sourcePage = new URL(request.url).pathname
                const mod = await middlewareModule()
                const fn = mod.default || mod.middleware
                let resp = await fn(new NextRequest(request, request), context)

                resp =
                    resp ||
                    new Response(null, {
                        status: 200,
                        headers: {
                            'x-middleware-next': '1',
                        },
                    })
                resp = await processMiddlewareResp(request, resp, finalUrl)

                return resp
            } catch (e: any) {
                return new Response(e.stack, { status: 500 })
            }
        },
    }
    return worker
}
