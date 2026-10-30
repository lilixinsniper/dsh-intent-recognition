/**
 * Offline-boot test (no database required): with an unreachable PostgreSQL
 * the plugin must still load, answer /health and /connection*, and 503-guard
 * every other management route so the UI can recover from the page.
 */
import { rmSync } from 'node:fs'

const CONFIG_PATH = '/tmp/dsh-ir-offline-connection.json'
rmSync(CONFIG_PATH, { force: true })
process.env.DSH_INTENT_RECOGNITION_CONFIG = CONFIG_PATH

const B = '/dsh-intent-recognition/api'
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1) } console.log('ok:', msg) }

const mod = await import('../lib/index.js')
const routes = []
const ctx = {
  webServer: { register(route) { routes.push(route); return () => {} } },
  logger: { info: () => {}, warn: () => {} },
  effect: () => {},
  get: () => undefined,
  on: () => {},
}

// Must resolve (not reject) even though the target refuses connections.
await mod.apply(ctx, {
  databaseUrl: 'postgres://postgres@127.0.0.1:59998/nope',
  embeddingDim: 8,
  autoMigrate: true,
  adminToken: '',
  registerTool: false,
  contributePrompt: false,
})
assert(routes.length === 1 && routes[0].path === B, 'plugin loads with unreachable database')

const call = async (method, path, body) => {
  const listeners = {}
  const req = { url: B + path, method, headers: {}, on(ev, cb) { listeners[ev] = cb } }
  const res = { writeHead(s) { this.status = s }, end(b) { this.body = b } }
  const p = routes[0].handler(req, res)
  for (let i = 0; i < 200 && listeners.end === undefined; i++) await new Promise(r => setTimeout(r, 5))
  if (body !== undefined) listeners.data?.(Buffer.from(JSON.stringify(body)))
  listeners.end?.()
  await p
  return { status: res.status, data: res.body ? JSON.parse(res.body) : {} }
}

let r = await call('GET', '/health')
assert(r.status === 200 && r.data.ok === false && r.data.connected === false, 'health reports disconnected (200, not error)')

r = await call('GET', '/connection')
assert(r.status === 200 && r.data.source === 'bundle' && r.data.connected === false, 'connection state readable offline')
assert(r.data.filePath === CONFIG_PATH, 'config file path reported')
assert(typeof r.data.error === 'string' && r.data.error.length > 0, 'error message surfaced')

r = await call('GET', '/scenarios')
assert(r.status === 503, 'management routes 503-guarded while disconnected')
r = await call('POST', '/v1/predict', { query: 'hi' })
assert(r.status === 503, 'inference route 503-guarded while disconnected')

r = await call('POST', '/connection/test', { host: '127.0.0.1', port: 59998, database: 'x', user: 'u', password: '' })
assert(r.status === 400 && typeof r.data.error === 'string', 'test endpoint rejects unreachable target')

r = await call('PUT', '/connection', { databaseUrl: 'postgres://u@127.0.0.1:59998/x' })
assert(r.status === 400, 'update rejects unreachable target')
r = await call('GET', '/connection')
assert(r.data.connected === false && r.data.source === 'bundle', 'state unchanged after failed update')

r = await call('PUT', '/connection', { databaseUrl: 'mysql://u@127.0.0.1/x' })
assert(r.status === 400, 'non-postgres URL rejected')

console.log('\nOFFLINE BOOT TEST OK')
process.exit(0)
