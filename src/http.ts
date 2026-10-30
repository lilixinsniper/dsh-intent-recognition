/**
 * Minimal HTTP helpers over node:http req/res — the webServer route handler
 * contract gives us raw IncomingMessage/ServerResponse.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(text)
}

export function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof HttpError) {
    sendJson(res, err.status, { error: err.message })
    return
  }
  const message = err instanceof Error ? err.message : String(err)
  // UNIQUE violations read as conflicts to the caller.
  if (typeof message === 'string' && message.includes('duplicate key')) {
    sendJson(res, 409, { error: '名称或编码已存在（唯一约束冲突）' })
    return
  }
  sendJson(res, 500, { error: message })
}

const MAX_BODY = 20 * 1024 * 1024

export function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new HttpError(413, '请求体过大'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new HttpError(400, '请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

export function bearerOf(req: IncomingMessage): string | null {
  const h = req.headers.authorization
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : null
}

export type RouteHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: RouteHandler
}

/** Tiny router: patterns like '/scenarios/:id/intents'. */
export class Router {
  private routes: Route[] = []

  add(method: string, pattern: string, handler: RouteHandler): void {
    const keys: string[] = []
    const re = new RegExp(
      '^' +
        pattern
          .split('/')
          .map(seg => {
            if (seg.startsWith(':')) {
              keys.push(seg.slice(1))
              return '([^/]+)'
            }
            return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          })
          .join('/') +
        '$',
    )
    this.routes.push({ method, pattern: re, keys, handler })
  }

  get(p: string, h: RouteHandler): void { this.add('GET', p, h) }
  post(p: string, h: RouteHandler): void { this.add('POST', p, h) }
  put(p: string, h: RouteHandler): void { this.add('PUT', p, h) }
  delete(p: string, h: RouteHandler): void { this.add('DELETE', p, h) }

  async handle(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const method = req.method ?? 'GET'
    for (const r of this.routes) {
      if (r.method !== method) continue
      const m = r.pattern.exec(pathname)
      if (!m) continue
      const params: Record<string, string> = {}
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]) })
      await r.handler(req, res, params)
      return
    }
    throw new HttpError(404, `接口不存在: ${method} ${pathname}`)
  }
}
