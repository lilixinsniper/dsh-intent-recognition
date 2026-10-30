/**
 * End-to-end smoke test (not shipped): loads lib/index.js with a mock Cordis
 * ctx, serves the registered routes on a real port, and exercises the API
 * against a real PostgreSQL + pgvector plus mock model endpoints.
 */
import http from 'node:http'
import { rmSync } from 'node:fs'
import pg from 'pg'

// Isolate the page-saved connection file so a real user config can never
// hijack the test's bundle-patch URL.
const SAVED_CONFIG = '/tmp/dsh-ir-smoke-connection.json'
rmSync(SAVED_CONFIG, { force: true })
process.env.DSH_INTENT_RECOGNITION_CONFIG = SAVED_CONFIG

const RUN = Math.random().toString(36).slice(2, 8)
const PORT_API = 18081
const PORT_MOCK = 18082

// ---------- mock model server ----------
const DIM = 8
function embed(texts) {
  // Deterministic bag-of-chars vector: similar texts -> similar vectors.
  return texts.map(t => {
    const v = new Array(DIM).fill(0)
    for (const ch of t) v[ch.codePointAt(0) % DIM] += 1
    const n = Math.hypot(...v) || 1
    return v.map(x => x / n)
  })
}
const mock = http.createServer((req, res) => {
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => {
    const data = JSON.parse(body || '{}')
    const url = req.url
    if (url === '/v1/embeddings') {
      return res.end(JSON.stringify({ data: embed(data.input).map(e => ({ embedding: e })) }))
    }
    if (url === '/jev') {
      if (data.questions) {
        const single = data.questions.intent_recognition
        if (single) {
          // v0.6.0 single-question wire style: one intent_recognition question per mode
          if (single.type === 'choice') {
            // 真实 Jev 应答：对象带 choice 标签 + probabilities 概率表 + type
            return res.end(JSON.stringify({
              answers: {
                intent_recognition: {
                  choice: '查询余额', confidence: 1,
                  probabilities: { 查询余额: 1, 转账汇款: 0 }, type: 'choice',
                },
              },
            }))
          }
          if (single.type === 'noul') {
            const yes = Object.entries(single.map || {}).find(([, code]) => code === 'query_balance')?.[0] || '是'
            return res.end(JSON.stringify({ answers: { intent_recognition: yes } }))
          }
          // score: array aligned with intent_order
          const order = single.intent_order || ['query_balance', 'transfer']
          return res.end(JSON.stringify({
            answers: { intent_recognition: order.map(c => (c === 'query_balance' ? 0.9 : 0.1)) },
          }))
        }
        // legacy per-intent wire style: { model, state, questions } -> { answers: {code: value} }
        const t = data.questions.query_balance?.type
        if (t === 'choice') {
          return res.end(JSON.stringify({ answers: { query_balance: '明确属于该意图', transfer: '不属于该意图' } }))
        }
        if (t === 'noul') {
          return res.end(JSON.stringify({ answers: { query_balance: '是', transfer: '否' } }))
        }
        return res.end(JSON.stringify({ answers: { query_balance: 0.9, transfer: 0.1 } }))
      }
      // candidates style: score candidates by char-overlap with the query.
      const q = new Set(data.text)
      const scores = data.candidates.map(c => {
        const hit = [...new Set(c.name + c.description)].filter(ch => q.has(ch)).length
        return { code: c.code, score: Math.min(0.95, 0.2 + hit / 8) }
      })
      return res.end(JSON.stringify({ scores }))
    }
    if (url === '/ft') {
      const q = new Set(data.text)
      let best = data.candidates[0], bestScore = 0
      for (const c of data.candidates) {
        const hit = [...new Set(c.name)].filter(ch => q.has(ch)).length
        if (hit > bestScore) { best = c; bestScore = hit }
      }
      return res.end(JSON.stringify({ label: best.code, confidence: Math.min(0.96, 0.5 + bestScore / 5) }))
    }
    if (url === '/v1/chat/completions') {
      const content = JSON.stringify({
        intents: [{ code: 'query_balance', confidence: 0.72 }],
        slots: { 账户: '储蓄卡' }, need_clarification: false, reasoning: 'mock',
      })
      return res.end(JSON.stringify({ choices: [{ message: { content } }] }))
    }
    res.statusCode = 404
    res.end('{}')
  })
})
await new Promise(r => mock.listen(PORT_MOCK, r))

// ---------- load plugin host half with a mock ctx ----------
const mod = await import('../lib/index.js')
const routes = []
const ctx = {
  webServer: { register(route) { routes.push(route); return () => {} } },
  logger: { info: (...a) => console.log('[info]', ...a), warn: (...a) => console.log('[warn]', ...a) },
  effect: () => {},
  get: () => undefined,
  on: () => {},
  inject: () => {},
}
await mod.apply(ctx, {
  databaseUrl: 'postgres://postgres@127.0.0.1:54329/dsh_intent',
  embeddingDim: DIM,
  autoMigrate: true,
  adminToken: '',
  registerTool: false,
})

const api = http.createServer((req, res) => {
  const route = routes.find(r => req.url.startsWith(r.path))
  if (!route) { res.statusCode = 404; res.end('no route'); return }
  route.handler(req, res)
})
await new Promise(r => api.listen(PORT_API, r))

// ---------- exercise the API ----------
const B = `http://127.0.0.1:${PORT_API}/dsh-intent-recognition/api`
const M = `http://127.0.0.1:${PORT_MOCK}`
const j = async (method, path, body, key) => {
  const res = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1) } console.log('ok:', msg) }

let r = await j('GET', '/health')
assert(r.status === 200 && r.data.ok, 'health')

// page-managed connection: state / test / rejected update keeps pool / hot-swap / reset
r = await j('GET', '/connection')
assert(r.status === 200 && r.data.connected === true && r.data.source === 'bundle', 'connection state: bundle source, connected')
assert(typeof r.data.filePath === 'string' && r.data.filePath.length > 0, 'config file path reported')

r = await j('POST', '/connection/test', { host: '127.0.0.1', port: 59998, database: 'dsh_intent', user: 'postgres', password: '' })
assert(r.status === 400, 'connection test rejects unreachable target')

r = await j('PUT', '/connection', { databaseUrl: 'postgres://postgres@127.0.0.1:59998/dsh_intent' })
assert(r.status === 400, 'update rejects unreachable target')
r = await j('GET', '/health')
assert(r.data.ok === true, 'old pool kept after failed update')

r = await j('PUT', '/connection', { host: '127.0.0.1', port: 54329, database: 'dsh_intent', user: 'postgres', password: '' })
assert(r.status === 200 && r.data.connection.source === 'page' && r.data.connection.connected, 'update hot-swaps to page-saved config')
r = await j('GET', '/scenarios')
assert(r.status === 200, 'management API works after hot-swap')
r = await j('PUT', '/connection', { host: '127.0.0.1', port: 54329, database: 'dsh_intent', user: 'postgres', password: '***' })
assert(r.status === 200, 'masked password keeps current credentials')
r = await j('DELETE', '/connection')
assert(r.status === 200 && r.data.connection.source === 'bundle', 'reset falls back to bundle config')
r = await j('GET', '/health')
assert(r.data.ok === true, 'still connected after reset')

// 数据库维护：检查 / 创建（建库 + pgvector + 全部表一次完成）/ 谨慎删除
const TMP_DB = `ir_tmp_${RUN}`
const CONN = { host: '127.0.0.1', port: 54329, user: 'postgres', password: '' }
r = await j('POST', '/connection/database/check', { ...CONN, database: 'dsh_intent' })
assert(r.status === 200 && r.data.exists === true, 'database check: dsh_intent exists')
r = await j('POST', '/connection/database/check', { ...CONN, database: TMP_DB })
assert(r.status === 200 && r.data.exists === false, 'database check: temp db missing before create')
r = await j('POST', '/connection/database/create', { ...CONN, database: TMP_DB })
assert(r.status === 200 && r.data.created === true && r.data.vector === true && r.data.tables === true,
  `database create: db + pgvector + tables in one shot (got ${JSON.stringify(r.data)})`)
r = await j('POST', '/connection/database/create', { ...CONN, database: TMP_DB })
assert(r.status === 409, 'database create: existing db rejected')
// 新库中的插件表已就绪
{
  const client = new pg.Client({ host: '127.0.0.1', port: 54329, user: 'postgres', database: TMP_DB })
  await client.connect()
  const qr = await client.query("SELECT tablename FROM pg_tables WHERE tablename LIKE 'ir\_%'")
  assert(qr.rows.length >= 5, `created db has ir_* tables (got ${qr.rows.length})`)
  const er = await client.query("SELECT extname FROM pg_extension WHERE extname = 'vector'")
  assert(er.rows.length === 1, 'created db has vector extension')
  await client.end()
}
r = await j('POST', '/connection/database/drop', { ...CONN, database: TMP_DB, confirm: 'wrong-name' })
assert(r.status === 400, 'database drop: wrong confirm rejected')
r = await j('POST', '/connection/database/drop', { ...CONN, database: 'postgres', confirm: 'postgres' })
assert(r.status === 400, 'database drop: system database rejected')
r = await j('POST', '/connection/database/drop', { ...CONN, database: TMP_DB, confirm: TMP_DB })
assert(r.status === 200 && r.data.dropped === true, 'database drop: confirmed drop succeeds')
r = await j('POST', '/connection/database/check', { ...CONN, database: TMP_DB })
assert(r.status === 200 && r.data.exists === false, 'database check: temp db gone after drop')
r = await j('GET', '/health')
assert(r.data.ok === true, 'current connection unaffected by maintenance ops')

r = await j('POST', '/scenarios', {
  name: `银行客服-${RUN}`, description: '银行场景',
  rule_config: { greeting_keywords: ['你好', 'hi'], exit_keywords: ['再见'], command_patterns: ['^/help\\b'] },
})
assert(r.status === 201, 'create scenario')
const sid = r.data.scenario.id

r = await j('POST', `/scenarios/${sid}/intents`, {
  name: '查询余额', code: 'query_balance', description: '查询账户余额',
  examples: ['我的余额是多少', '帮我查一下卡里还有多少钱', '查一下余额'],
  keywords: ['余额'], blacklist: [], whitelist: [],
  route: { type: 'none', target: '' },
})
assert(r.status === 201, 'create intent query_balance')
r = await j('POST', `/scenarios/${sid}/intents`, {
  name: '转账汇款', code: 'transfer', description: '转账给别人',
  examples: ['我要转账', '给别人打钱', '转一千块给我妈'],
  keywords: ['转账'], blacklist: [], whitelist: [],
  route: { type: 'workflow', target: 'transfer-flow', script: 'return { transferred: true, to: args.slots.to ?? null, q: args.query }' },
})
assert(r.status === 201, 'create intent transfer')

// models
const mk = async body => (await j('POST', '/models', body)).data.model.id
const embId = await mk({ kind: 'embedding', name: `mock-emb-${RUN}`, base_url: M, model: 'mock', api_style: 'openai' })
const jevId = await mk({ kind: 'jev', name: `mock-jev-${RUN}`, base_url: `${M}/jev`, model: 'mock', api_style: 'http' })
const ftId = await mk({ kind: 'finetune', name: `mock-ft-${RUN}`, base_url: `${M}/ft`, model: 'mock', api_style: 'http' })
const llmId = await mk({ kind: 'llm', name: `mock-llm-${RUN}`, base_url: M, model: 'mock', api_style: 'openai' })
assert(embId && jevId && ftId && llmId, 'create 4 models')

r = await j('POST', `/models/${embId}/test`)
assert(r.status === 200 && r.data.dimension === DIM, 'test embedding model')

r = await j('POST', `/scenarios/${sid}/embeddings/rebuild`, { model_id: embId })
assert(r.status === 200 && r.data.embedded === 6, 'rebuild embeddings')

// 向量检索实验室
r = await j('GET', '/vector/overview')
assert(r.status === 200, 'vector overview')
const ov = r.data.scenarios.find(o => o.scenario_id === sid)
assert(ov && ov.chunks === 6 && ov.embedded_intents === 2 && ov.examples === 6, 'overview counts chunks/examples/coverage')
assert(ov.models.length === 1, 'overview records the building model')
r = await j('GET', `/vector/chunks?scenario_id=${sid}&page=1&size=20`)
assert(r.status === 200 && r.data.total === 6 && r.data.chunks.length === 6, 'list chunks')
assert(r.data.chunks.every(c => c.dims === DIM && c.model_name), 'chunks carry dims and model provenance')
r = await j('GET', `/vector/chunks?scenario_id=${sid}&page=1&size=4`)
assert(r.data.chunks.length === 4 && r.data.total === 6, 'chunks paginate')
const qbIntent = (await j('GET', `/scenarios/${sid}/intents`)).data.intents.find(i => i.code === 'query_balance')
r = await j('GET', `/vector/chunks?scenario_id=${sid}&intent_id=${qbIntent.id}`)
assert(r.data.total === 3, 'chunks filter by intent')
// 召回测试：复刻层2 检索，应把「查询余额」排在最优
r = await j('POST', '/vector/test', { scenario_id: sid, query: '帮我查一下卡里还有多少钱', model_id: embId })
assert(r.status === 200 && r.data.chunks.length > 0, 'vector test returns chunk hits')
assert(r.data.intents_all[0].intent_code === 'query_balance' && r.data.intents_all[0].pass === true, 'vector test top intent is query_balance')
assert(r.data.candidates.every(c => c.score >= r.data.min_score), 'candidates all pass threshold')
assert(r.data.dims === DIM && r.data.latency_ms >= 0, 'vector test reports dims and latency')
r = await j('POST', '/vector/test', { scenario_id: sid, query: 'x', model_id: embId, min_score: 0.999 })
assert(r.status === 200 && r.data.candidates.length === 0 && r.data.intents_all.length > 0, 'high threshold filters all candidates but keeps diagnostics')
r = await j('POST', '/vector/test', { scenario_id: sid, query: 'x' })
assert(r.status === 400, 'vector test requires a model when no service referenced')
// 删除一个脏切片
const victim = (await j('GET', `/vector/chunks?scenario_id=${sid}&intent_id=${qbIntent.id}`)).data.chunks[0]
r = await j('DELETE', `/vector/chunks?intent_id=${victim.intent_id}&example=${encodeURIComponent(victim.example)}`)
assert(r.status === 200, 'delete a chunk')
r = await j('GET', `/vector/chunks?scenario_id=${sid}`)
assert(r.data.total === 5, 'chunk count drops after delete')
r = await j('POST', `/scenarios/${sid}/embeddings/rebuild`, { model_id: embId })
assert(r.data.embedded === 6, 'rebuild restores deleted chunk')

// service: all layers on
r = await j('POST', '/services', {
  name: `svc-full-${RUN}`, scenario_id: sid,
  models: { embedding: embId, jev: jevId, finetune: ftId, llm: llmId },
})
assert(r.status === 201, 'create service')
const svc = r.data.service
r = await j('POST', `/services/${svc.id}/start`)
assert(r.data.service.status === 'running', 'start service')

// L1: greeting
r = await j('POST', '/v1/predict', { query: '你好' }, svc.api_key)
assert(r.data.matched_layer === 'l1' && r.data.intent.code === '__greeting__', 'L1 greeting')
// L1: keyword
r = await j('POST', '/v1/predict', { query: '查一下我的余额' }, svc.api_key)
assert(r.data.matched_layer === 'l1' && r.data.intent.code === 'query_balance', 'L1 keyword')
// L2+L3: paraphrase hits vector retrieval and jev high band
r = await j('POST', '/v1/predict', { query: '帮我查一下卡里还有多少钱' }, svc.api_key)
assert(['l3', 'l4', 'l5'].includes(r.data.matched_layer), `L2/L3 paraphrase (got ${r.data.matched_layer})`)
console.log('  -> trace:', JSON.stringify(r.data.trace.map(t => [t.layer, t.hit, t.detail])))
// L5 fallback: off-domain query
r = await j('POST', '/v1/predict', { query: '明天天气怎么样' }, svc.api_key)
assert(r.data.matched_layer === 'l5' || r.data.intent === null, 'L5 fallback')
console.log('  -> l5 result:', JSON.stringify({ layer: r.data.matched_layer, intents: r.data.intents, slots: r.data.slots }))

// layer toggles: only L5 on
r = await j('POST', `/services/${svc.id}/stop`)
r = await j('PUT', `/services/${svc.id}`, {
  layers: { l1: { enabled: false }, l2: { enabled: false }, l3: { enabled: false }, l4: { enabled: false }, l5: { enabled: true } },
})
r = await j('POST', `/services/${svc.id}/start`)
r = await j('POST', '/v1/predict', { query: '你好' }, svc.api_key)
assert(r.data.matched_layer !== 'l1', 'L1 disabled is skipped')
console.log('  -> l5-only result:', JSON.stringify({ layer: r.data.matched_layer, intent: r.data.intent }))

// service lifecycle: copy / stop / delete
r = await j('POST', `/services/${svc.id}/copy`)
assert(r.status === 201, 'copy service')
const copy = r.data.service
r = await j('DELETE', `/services/${copy.id}`)
assert(r.status === 200, 'delete stopped copy')
r = await j('GET', `/services/${svc.id}/logs`)
assert(r.status === 200 && r.data.logs.length > 0, 'predict logs recorded')

// route roundtrip + validation
r = await j('GET', `/scenarios/${sid}/intents`)
const transfer = r.data.intents.find(i => i.code === 'transfer')
assert(transfer.route.type === 'workflow' && transfer.route.script.includes('transferred'), 'structured route persisted')
r = await j('POST', `/scenarios/${sid}/intents`, { name: '坏路由', code: 'bad_route', route: { type: 'workflow', target: 'x' } })
assert(r.status === 400, 'workflow route without script rejected')
r = await j('POST', `/scenarios/${sid}/intents`, { name: '坏路由2', code: 'bad_route2', route: { type: 'subagent', target: '' } })
assert(r.status === 400, 'subagent route without target rejected')

// route_mode on services
r = await j('POST', `/services/${svc.id}/stop`)
r = await j('PUT', `/services/${svc.id}`, { route_mode: 'suggest' })
assert(r.status === 200 && r.data.service.route_mode === 'suggest', 'route_mode update')
r = await j('PUT', `/services/${svc.id}`, { route_mode: 'banana' })
assert(r.status === 400, 'invalid route_mode rejected')

// jev 扩展配置自动生成：mock LLM 输出不含 questions → 回退规则生成，覆盖全部意图
r = await j('POST', '/jev/draft-config', { scenario_id: sid, model: 'jev-latest' })
assert(r.status === 200 && r.data.source === 'rule', 'jev draft falls back to rule generation')
const jevDraftExtra = r.data.extra
const modes = r.data.extra.modes
// v0.6.0: 每种判定方式只有一个 intent_recognition 问题
const qScore = modes?.score?.questions?.intent_recognition
const qChoice = modes?.choice?.questions?.intent_recognition
const qNoul = modes?.noul?.questions?.intent_recognition
assert(Object.keys(modes?.score?.questions || {}).length === 1 && qScore?.type === 'score', 'draft score has a single intent_recognition question')
assert(Object.keys(modes?.choice?.questions || {}).length === 1 && qChoice?.type === 'choice', 'draft choice has a single intent_recognition question')
assert(Array.isArray(qScore.criteria) && qScore.criteria.length === 2
  && qScore.criteria.every(c => typeof c === 'string' && c.includes('意图判定描述')),
  'score criteria are per-intent 判定描述 strings')
assert(Array.isArray(qScore.intent_order) && qScore.intent_order.length === 2
  && qScore.intent_order.includes('query_balance') && qScore.intent_order.includes('transfer'),
  'score intent_order covers all intent codes')
assert(qScore.criteria[qScore.intent_order.indexOf('query_balance')].includes('查询账户余额'),
  'score criteria embed the full intent description in intent_order order')
assert(qChoice.criteria && typeof qChoice.criteria === 'object' && !Array.isArray(qChoice.criteria)
  && Object.keys(qChoice.criteria).includes('查询余额') && Object.keys(qChoice.criteria).includes('转账汇款')
  && Object.values(qChoice.criteria).every(v => typeof v === 'string' && v.length > 0),
  'choice criteria map 意图名 -> 判定描述')
assert(qNoul?.type === 'noul', 'noul generated for the 2-intent scenario')
const noulMapValues = Object.values(qNoul.map || {})
assert(noulMapValues.length === 2 && new Set(noulMapValues).size === 2
  && noulMapValues.includes('query_balance') && noulMapValues.includes('transfer'),
  'noul map maps 是/否 to the two intent codes')
assert(String(qScore.instructions).includes('intent_order'), 'score instructions explain intent_order alignment')
assert(String(qNoul.instructions).includes('查询余额') && String(qNoul.instructions).includes('转账汇款'),
  'noul instructions cite both intents')
// 显式 source=rule：不依赖 LLM，直接规则生成
r = await j('POST', '/jev/draft-config', { scenario_id: sid, model: 'jev-latest', source: 'rule' })
assert(r.status === 200 && r.data.source === 'rule', 'explicit rule source returns rule draft')
// 显式 source=llm：mock LLM 输出不含 questions → 502 报错而非静默回退
r = await j('POST', '/jev/draft-config', { scenario_id: sid, model: 'jev-latest', source: 'llm' })
assert(r.status === 502, `explicit llm source surfaces LLM failure (got ${r.status})`)
r = await j('POST', '/jev/draft-config', { scenario_id: sid, source: 'banana' })
assert(r.status === 400, 'invalid source rejected')
r = await j('POST', '/jev/draft-config', { scenario_id: '00000000-0000-0000-0000-000000000000' })
assert(r.status === 404, 'jev draft rejects unknown scenario')

// jev systemone wire style: extra.questions -> {model,state,questions} 报文 + answers 归一化
const sysJevId = await mk({ kind: 'jev', name: `mock-jev-sys-${RUN}`, base_url: `${M}/jev`, model: 'mock', api_style: 'http', extra: jevDraftExtra })
r = await j('POST', '/services', {
  name: `svc-sys-${RUN}`, scenario_id: sid,
  models: { embedding: embId, jev: sysJevId },
  layers: { l4: { enabled: false }, l5: { enabled: false } },
})
assert(r.status === 201, 'create systemone jev service')
const svcSys = r.data.service
await j('POST', `/services/${svcSys.id}/start`)
r = await j('POST', '/v1/predict', { query: '帮我查一下卡里还有多少钱' }, svcSys.api_key)
assert(r.data.matched_layer === 'l3' && r.data.intent.code === 'query_balance', `systemone jev answers drive layer 3 (got ${r.data.matched_layer})`)
assert(r.data.trace.find(t => t.layer === 'l3')?.detail?.mode === 'score', 'l3 trace records score mode')
// 层2 trace 暴露实际阈值与原始切片
const l2t = r.data.trace.find(t => t.layer === 'l2')?.detail
assert(typeof l2t?.minScore === 'number' && Array.isArray(l2t?.chunks) && l2t.chunks.length > 0
  && l2t.chunks.every(c => typeof c.pass === 'boolean'), 'l2 trace exposes thresholds and raw chunks')
// 切换到 choice 模式：选项原文应答按顺序折算分数（运行中的服务不可改配置，先停再改）
await j('POST', `/services/${svcSys.id}/stop`)
r = await j('PUT', `/services/${svcSys.id}`, { layers: { l3: { enabled: true, mode: 'choice' }, l4: { enabled: false }, l5: { enabled: false } } })
assert(r.status === 200, 'switch l3 to choice mode')
await j('POST', `/services/${svcSys.id}/start`)
r = await j('POST', '/v1/predict', { query: '帮我查一下卡里还有多少钱' }, svcSys.api_key)
assert(r.data.matched_layer === 'l3' && r.data.intent.code === 'query_balance', `choice mode answers drive layer 3 (got ${r.data.matched_layer})`)
assert(r.data.trace.find(t => t.layer === 'l3')?.detail?.mode === 'choice', 'l3 trace records choice mode')
// 切换到 noul 模式：是/否应答
await j('POST', `/services/${svcSys.id}/stop`)
r = await j('PUT', `/services/${svcSys.id}`, { layers: { l3: { enabled: true, mode: 'noul' }, l4: { enabled: false }, l5: { enabled: false } } })
assert(r.status === 200, 'switch l3 to noul mode')
await j('POST', `/services/${svcSys.id}/start`)
r = await j('POST', '/v1/predict', { query: '帮我查一下卡里还有多少钱' }, svcSys.api_key)
assert(r.data.matched_layer === 'l3' && r.data.intent.code === 'query_balance', `noul mode answers drive layer 3 (got ${r.data.matched_layer})`)
// 非法判定方式被拒绝
await j('POST', `/services/${svcSys.id}/stop`)
r = await j('PUT', `/services/${svcSys.id}`, { layers: { l3: { enabled: true, mode: 'banana' } } })
assert(r.status === 400, 'invalid l3 mode rejected')

// excel export/import roundtrip
const exp = await fetch(`${B}/scenarios/${sid}/intents/export`)
assert(exp.status === 200, 'export xlsx')
const buf = Buffer.from(await exp.arrayBuffer())
assert(buf.length > 2000, 'xlsx bytes')
r = await j('POST', '/scenarios', { name: `银行客服-导入-${RUN}` })
const sid2 = r.data.scenario.id
r = await j('POST', `/scenarios/${sid2}/intents/import`, { file_base64: buf.toString('base64'), mode: 'replace' })
assert(r.status === 200 && r.data.imported === 2, 'import xlsx roundtrip')
r = await j('GET', `/scenarios/${sid2}/intents`)
assert(r.data.intents.some(i => i.code === 'transfer' && i.examples.length === 3), 'imported examples intact')

// admin token auth check
console.log('\nALL SMOKE TESTS PASSED')
process.exit(0)
