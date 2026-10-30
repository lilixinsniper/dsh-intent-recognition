/**
 * Real-Cordis integration test: mounts the built plugin into an actual Cordis
 * context with stub webServer / tools / workflowEngine / subagents services,
 * then verifies:
 *  - Fiber lifecycle, Config schema defaults, route registration
 *  - ctx.intentRecognition service provision
 *  - per-service tool registration/revocation on start/stop
 *  - in-tool route dispatch: workflow / subagent / service
 *  - route_mode suggest disables dispatch
 */
import { Context, Service } from '@deepseek-ai/cordis'

// Isolate the page-saved connection file so a real user config can never
// hijack the test's bundle-patch URL.
process.env.DSH_INTENT_RECOGNITION_CONFIG = '/tmp/dsh-ir-test-connection.json'

const RUN = Math.random().toString(36).slice(2, 8)
const B = '/dsh-intent-recognition/api'
const DB = 'postgres://postgres@127.0.0.1:54329/dsh_intent'

// Clean slate: stale running services from previous partial runs would
// otherwise register their tools on load and break the counts below.
{
  const pg = await import('pg')
  const pool = new pg.default.Pool({ connectionString: DB })
  try {
    await pool.query('TRUNCATE ir_predict_logs, ir_services, ir_intent_embeddings, ir_intents, ir_models, ir_scenarios CASCADE')
  } catch {
    // fresh database: tables do not exist yet, plugin migrations will create them
  }
  await pool.end()
}
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1) } console.log('ok:', msg) }

// ---- stub host services ----
const registeredTools = new Map()
const calls = { workflow: [], subagent: [], business: [] }

class WebServer extends Service {
  routes = []
  constructor(ctx) { super(ctx, 'webServer') }
  register(route) { this.routes.push(route); return () => { this.routes = this.routes.filter(r => r !== route) } }
}
class Tools extends Service {
  constructor(ctx) { super(ctx, 'tools') }
  register(tool) {
    // Mirror the real host contract (packages/core/tools): output declaration
    // is mandatory and every schema node type must be in the supported subset.
    const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
    const check = (node, path) => {
      if (typeof node !== 'object' || node === null) throw new TypeError(`${path} must be a schema object`)
      if (!SCHEMA_TYPES.has(node.type)) throw new TypeError(`${path}.type must be one of ${[...SCHEMA_TYPES].join('/')}`)
      if (node.properties) for (const [k, v] of Object.entries(node.properties)) check(v, `${path}.${k}`)
      if (node.items) check(node.items, `${path}.items`)
      if (Array.isArray(node.oneOf)) node.oneOf.forEach((v, i) => check(v, `${path}.oneOf[${i}]`))
    }
    if (tool.output === undefined || typeof tool.output.render !== 'function') {
      throw new TypeError(`tool "${tool.name}" must declare output { schema, render }`)
    }
    check(tool.output.schema, 'output.schema')
    check(tool.parameters, 'parameters')
    registeredTools.set(tool.name, tool)
    return () => registeredTools.delete(tool.name)
  }
}
class WorkflowEngine extends Service {
  constructor(ctx) { super(ctx, 'workflowEngine') }
  start(request) {
    calls.workflow.push(request)
    return {
      result: Promise.resolve({ stopReason: 'completed', value: { echoed: request.args } }),
      cancel: () => {},
      dispose: async () => {},
    }
  }
}
class Subagents extends Service {
  constructor(ctx) { super(ctx, 'subagents') }
  async startActivation(spec) {
    calls.subagent.push(spec)
    return {
      result: Promise.resolve({ text: `handled by preset ${spec.request.agentPreset}` }),
      dispose: async () => {},
    }
  }
}
class BusinessService extends Service {
  constructor(ctx) { super(ctx, 'orderService') }
  async createOrder(payload) { calls.business.push(payload); return { orderId: 'A-1' } }
}
class SystemPrompt extends Service {
  sections = []
  constructor(ctx) { super(ctx, 'systemPrompt') }
  section(s) { this.sections.push(s); return () => {} }
}

const root = new Context()
root.plugin(WebServer)
root.plugin(Tools)
root.plugin(WorkflowEngine)
root.plugin(Subagents)
root.plugin(BusinessService)
root.plugin(SystemPrompt)

const plugin = await import('../lib/index.js')
const fiber = root.plugin(plugin, { databaseUrl: DB, embeddingDim: 8 })
await fiber

// ---- basic wiring ----
const ws = root.get('webServer')
assert(ws.routes.length === 1 && ws.routes[0].path === B, 'route registered')
const face = root.get('intentRecognition')
assert(face && typeof face.predict === 'function', 'ctx.intentRecognition provided')
const prompt = root.get('systemPrompt')
assert(prompt.sections.some(s => s.name === 'intent-recognition'), 'system-prompt section registered')

// ---- drive the management API through the registered route handler ----
const call = async (method, path, body) => {
  const chunks = []
  const req = {
    url: B + path, method, headers: {},
    on(ev, cb) { if (ev === 'end') setImmediate(cb); if (ev === 'data') {} },
  }
  // emulate IncomingMessage body delivery
  const listeners = {}
  const req2 = {
    url: B + path, method, headers: {},
    on(ev, cb) { listeners[ev] = cb },
  }
  const res = {
    writeHead(s) { this.status = s },
    end(b) { this.body = b },
  }
  const p = ws.routes[0].handler(req2, res)
  // Fire body events only after the handler chain has subscribed to them:
  // poll for the 'end' listener, then deliver.
  for (let i = 0; i < 200 && listeners.end === undefined; i++) {
    await new Promise(r => setTimeout(r, 5))
  }
  if (body !== undefined) listeners.data?.(Buffer.from(JSON.stringify(body)))
  listeners.end?.()
  await p
  return { status: res.status, data: res.body ? JSON.parse(res.body) : {} }
}

let r = await call('POST', '/scenarios', { name: `路由测试-${RUN}`, description: 'route test' })
assert(r.status === 201, 'create scenario')
const sid = r.data.scenario.id

const mkIntent = (code, keywords, route) =>
  call('POST', `/scenarios/${sid}/intents`, { name: code, code, description: code, keywords, route })
assert((await mkIntent('check_balance', ['余额'], { type: 'workflow', target: 'balance-flow', script: 'return 42' })).status === 201, 'intent with workflow route')
assert((await mkIntent('make_transfer', ['转账'], { type: 'subagent', target: 'transfer-preset' })).status === 201, 'intent with subagent route')
assert((await mkIntent('place_order', ['下单'], { type: 'service', target: 'orderService.createOrder' })).status === 201, 'intent with service route')

r = await call('POST', '/services', { name: `bank router ${RUN}`, scenario_id: sid, route_mode: 'auto' })
assert(r.status === 201, 'create service')
const svc = r.data.service

// start -> tool appears
await call('POST', `/services/${svc.id}/start`)
await new Promise(res => setTimeout(res, 300))
const toolName = [...registeredTools.keys()][0]
assert(registeredTools.size === 1, `one tool registered (${toolName})`)
assert(toolName.startsWith('intent_recognize_bank_router_'), 'tool slug from service name')

// management API exposes the chat-tool registration state
r = await call('GET', '/services')
assert(r.data.services[0].tool.registered === true && r.data.services[0].tool_name === toolName, 'service exposes tool registration state')

const exec = { agent: { id: 'agent-1' }, signal: new AbortController().signal }

// workflow route dispatch (L1 keyword hit, auto mode)
r = await registeredTools.get(toolName).execute({ query: '查一下余额' }, exec)
assert(r.matched_layer === 'l1' && r.intent.code === 'check_balance', 'L1 hit for workflow intent')
assert(r.route_result?.ok === true && calls.workflow.length === 1, 'workflow dispatched in-tool')
assert(calls.workflow[0].script === 'return 42' && calls.workflow[0].args.query === '查一下余额', 'workflow got script + args')
assert(calls.workflow[0].meta.name === 'balance-flow' && calls.workflow[0].parent === exec.agent, 'workflow meta + parent agent')

// subagent route dispatch
r = await registeredTools.get(toolName).execute({ query: '我要转账' }, exec)
assert(r.route_result?.ok === true && calls.subagent.length === 1, 'subagent dispatched in-tool')
assert(calls.subagent[0].request.agentPreset === 'transfer-preset', 'subagent preset passed')
assert(calls.subagent[0].delivery === 'caller', 'subagent delivery caller')

// service route dispatch
r = await registeredTools.get(toolName).execute({ query: '帮我下单' }, exec)
assert(r.route_result?.ok === true && calls.business.length === 1, 'cordis service dispatched in-tool')
assert(r.route_result.value.orderId === 'A-1', 'service return value propagated')

// route_mode=suggest disables dispatch
await call('POST', `/services/${svc.id}/stop`)
await new Promise(res => setTimeout(res, 300))
assert(registeredTools.size === 0, 'tool revoked after stop')
await call('PUT', `/services/${svc.id}`, { route_mode: 'suggest' })
await call('POST', `/services/${svc.id}/start`)
await new Promise(res => setTimeout(res, 300))
const before = calls.workflow.length
r = await registeredTools.get(toolName).execute({ query: '查一下余额' }, exec)
assert(r.route && !r.route_result && calls.workflow.length === before, 'suggest mode returns route without executing')

// prompt section reflects running services
const text = root.get('systemPrompt').sections.find(s => s.name === 'intent-recognition').text()
assert(text.includes('1 intent recognition service'), 'prompt section lists active services')

console.log('\nCORDIS INTEGRATION TEST OK')
process.exit(0)
