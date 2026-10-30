/**
 * REST API. All management routes live under /dsh-intent-recognition/api;
 * the external inference endpoint is /dsh-intent-recognition/api/v1/predict
 * authenticated with the per-service API key.
 */
import { randomBytes } from 'node:crypto'
import type { ConnectionManager } from './connection.ts'
import type { IntentDb } from './db.ts'
import { buildIntentWorkbook, intentTemplateFilename, parseIntentWorkbook } from './excel.ts'
import { HttpError, Router, bearerOf, readBody, sendJson } from './http.ts'
import { draftJevConfigRuleBased, draftJevConfigWithLlm } from './jev-draft.ts'
import { embedTexts } from './models.ts'
import type { IntentEngine } from './pipeline/engine.ts'
import { toolNameOf } from './service-tools.ts'
import { JEV_MODES } from './types.ts'
import type { IntentRoute, ModelKind, ModelRow, RouteMode, ServiceLayers } from './types.ts'

export interface ApiDeps {
  db: IntentDb
  engine: IntentEngine
  adminToken: string
  /** Page-managed PostgreSQL connection (health, test, hot-swap). */
  connection: ConnectionManager
  /** Agent-tool registration state per service (chat-integration visibility). */
  toolStatus?: (serviceId: string) => { registered: boolean; error?: string }
  /** Called after any service mutation so agent tools can reconcile. */
  onServicesChanged?: () => void | Promise<void>
}

const ROUTE_TYPES = ['none', 'workflow', 'subagent', 'service'] as const

function normalizeRoute(v: unknown): IntentRoute {
  if (typeof v !== 'object' || v === null) return { type: 'none', target: '' }
  const src = v as Record<string, unknown>
  const type = (ROUTE_TYPES as readonly string[]).includes(String(src.type)) ? (src.type as IntentRoute['type']) : 'none'
  const route: IntentRoute = { type, target: typeof src.target === 'string' ? src.target : '' }
  if (typeof src.script === 'string') route.script = src.script
  if (type === 'workflow' && !route.script) throw new HttpError(400, '路由类型为 workflow 时必须提供 script 脚本模板')
  if ((type === 'subagent' || type === 'service') && route.target.trim() === '') {
    throw new HttpError(400, `路由类型为 ${type} 时必须提供 target`)
  }
  return route
}

function normalizeRouteMode(v: unknown): RouteMode | undefined {
  if (v === undefined) return undefined
  if (v === 'auto' || v === 'suggest') return v
  throw new HttpError(400, `非法 route_mode: ${String(v)}（应为 auto 或 suggest）`)
}

const DEFAULT_LAYERS: ServiceLayers = {
  l1: { enabled: true, confidence: 0.99 },
  l2: { enabled: true, topK: 8, minScore: 0.5 },
  l3: { enabled: true, high: 0.85, mid: 0.5, mode: 'score' },
  l4: { enabled: true, threshold: 0.7 },
  l5: { enabled: true },
}

const MODEL_KINDS: ModelKind[] = ['embedding', 'jev', 'finetune', 'llm']

function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new HttpError(400, `缺少必填字段: ${field}`)
  return v.trim()
}

function normalizeLayers(v: unknown): ServiceLayers {
  const src = (v ?? {}) as Record<string, Record<string, unknown>>
  const layer = (key: keyof ServiceLayers): ServiceLayers[typeof key] => {
    const base = { ...DEFAULT_LAYERS[key], ...(src[key] ?? {}) }
    base.enabled = Boolean(base.enabled)
    return base as ServiceLayers[typeof key]
  }
  const layers = { l1: layer('l1'), l2: layer('l2'), l3: layer('l3'), l4: layer('l4'), l5: layer('l5') }
  const mode = layers.l3.mode as string | undefined
  if (mode !== undefined && !JEV_MODES.includes(mode as ServiceLayers['l3']['mode'] & string)) {
    throw new HttpError(400, `非法层3 判定方式: ${String(layers.l3.mode)}（应为 ${JEV_MODES.join('/')}）`)
  }
  return layers
}

function normalizeModelRefs(v: unknown): { embedding: string | null; jev: string | null; finetune: string | null; llm: string | null } {
  const src = (v ?? {}) as Record<string, unknown>
  const ref = (k: string): string | null => (typeof src[k] === 'string' && src[k] !== '' ? String(src[k]) : null)
  return { embedding: ref('embedding'), jev: ref('jev'), finetune: ref('finetune'), llm: ref('llm') }
}

export function buildRouter(deps: ApiDeps): Router {
  const { db, engine } = deps
  const r = new Router()

  // ---------- health & connection (available even while disconnected) ----------
  r.get('/health', async (_req, res) => {
    const s = deps.connection.state()
    sendJson(res, 200, {
      ok: s.connected,
      name: 'dsh-intent-recognition',
      connected: s.connected,
      source: s.source,
      ...(s.error !== undefined ? { error: s.error } : {}),
    })
  })

  r.get('/connection', async (_req, res) => {
    sendJson(res, 200, deps.connection.state())
  })

  r.post('/connection/test', async (req, res) => {
    const body = await readBody(req)
    sendJson(res, 200, await deps.connection.test(body))
  })

  r.put('/connection', async (req, res) => {
    const body = await readBody(req)
    const connection = await deps.connection.update(body)
    await deps.onServicesChanged?.()
    sendJson(res, 200, { connection })
  })

  r.delete('/connection', async (_req, res) => {
    const connection = await deps.connection.reset()
    sendJson(res, 200, { connection })
  })

  // 数据库维护：按页面表单指向的服务器检查/创建/删除数据库（当前库不可用时也可用）
  r.post('/connection/database/check', async (req, res) => {
    sendJson(res, 200, await deps.connection.databaseInfo(await readBody(req)))
  })
  r.post('/connection/database/create', async (req, res) => {
    sendJson(res, 200, await deps.connection.databaseCreate(await readBody(req)))
  })
  r.post('/connection/database/drop', async (req, res) => {
    sendJson(res, 200, await deps.connection.databaseDrop(await readBody(req)))
  })

  // ---------- scenarios ----------
  r.get('/scenarios', async (_req, res) => {
    const scenarios = await db.listScenarios()
    const withCounts = await Promise.all(
      scenarios.map(async s => ({
        ...s,
        intent_count: (await db.listIntents(s.id)).length,
        embedding_count: await db.embeddingCount(s.id),
      })),
    )
    sendJson(res, 200, { scenarios: withCounts })
  })

  r.post('/scenarios', async (req, res) => {
    const body = (await readBody(req)) as Record<string, unknown>
    const row = await db.createScenario({
      name: requireString(body.name, 'name'),
      description: typeof body.description === 'string' ? body.description : '',
      rule_config: typeof body.rule_config === 'object' && body.rule_config !== null ? body.rule_config as never : {},
    })
    sendJson(res, 201, { scenario: row })
  })

  r.put('/scenarios/:id', async (req, res, p) => {
    const body = (await readBody(req)) as Record<string, unknown>
    const row = await db.updateScenario(p.id, body as never)
    if (!row) throw new HttpError(404, '场景不存在')
    sendJson(res, 200, { scenario: row })
  })

  r.delete('/scenarios/:id', async (_req, res, p) => {
    if (!(await db.deleteScenario(p.id))) throw new HttpError(404, '场景不存在')
    sendJson(res, 200, { ok: true })
  })

  // ---------- intents ----------
  r.get('/scenarios/:id/intents', async (_req, res, p) => {
    sendJson(res, 200, { intents: await db.listIntents(p.id) })
  })

  r.post('/scenarios/:id/intents', async (req, res, p) => {
    if (!(await db.getScenario(p.id))) throw new HttpError(404, '场景不存在')
    const body = (await readBody(req)) as Record<string, unknown>
    const row = await db.createIntent(p.id, {
      name: requireString(body.name, 'name'),
      code: requireString(body.code, 'code'),
      description: typeof body.description === 'string' ? body.description : '',
      examples: Array.isArray(body.examples) ? body.examples.map(String) : [],
      keywords: Array.isArray(body.keywords) ? body.keywords.map(String) : [],
      blacklist: Array.isArray(body.blacklist) ? body.blacklist.map(String) : [],
      whitelist: Array.isArray(body.whitelist) ? body.whitelist.map(String) : [],
      route: normalizeRoute(body.route),
    })
    sendJson(res, 201, { intent: row })
  })

  r.put('/intents/:id', async (req, res, p) => {
    const body = (await readBody(req)) as Record<string, unknown>
    if (body.route !== undefined) body.route = normalizeRoute(body.route)
    delete body.route_target
    const row = await db.updateIntent(p.id, body as never)
    if (!row) throw new HttpError(404, '意图不存在')
    sendJson(res, 200, { intent: row })
  })

  r.delete('/intents/:id', async (_req, res, p) => {
    if (!(await db.deleteIntent(p.id))) throw new HttpError(404, '意图不存在')
    sendJson(res, 200, { ok: true })
  })

  // ---------- intents: excel import/export ----------
  r.get('/scenarios/:id/intents/export', async (_req, res, p) => {
    const scenario = await db.getScenario(p.id)
    if (!scenario) throw new HttpError(404, '场景不存在')
    const intents = await db.listIntents(p.id)
    const buf = await buildIntentWorkbook(scenario.name, intents)
    res.writeHead(200, {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(intentTemplateFilename(scenario.name))}`,
    })
    res.end(buf)
  })

  r.post('/scenarios/:id/intents/import', async (req, res, p) => {
    if (!(await db.getScenario(p.id))) throw new HttpError(404, '场景不存在')
    const body = (await readBody(req)) as { file_base64?: string; mode?: string }
    if (typeof body.file_base64 !== 'string' || body.file_base64 === '') throw new HttpError(400, '缺少 file_base64')
    const buf = Buffer.from(body.file_base64, 'base64')
    const rows = await parseIntentWorkbook(buf)
    const mode = body.mode === 'replace' ? 'replace' : 'merge'
    const count = mode === 'replace' ? await db.replaceIntents(p.id, rows) : await db.upsertIntents(p.id, rows)
    sendJson(res, 200, { ok: true, imported: count, mode })
  })

  // ---------- embeddings ----------
  r.get('/scenarios/:id/embeddings/status', async (_req, res, p) => {
    sendJson(res, 200, { count: await db.embeddingCount(p.id) })
  })

  r.post('/scenarios/:id/embeddings/rebuild', async (req, res, p) => {
    const body = (await readBody(req)) as { model_id?: string }
    const modelId = requireString(body.model_id, 'model_id')
    const model = await db.getModel(modelId)
    if (!model || model.kind !== 'embedding') throw new HttpError(400, 'model_id 必须指向一个向量模型')
    const intents = await db.listIntents(p.id)
    let embedded = 0
    for (const intent of intents) {
      embedded += await db.rebuildIntentEmbeddings(intent.id, intent.examples, texts => embedTexts(model, texts), model.id)
    }
    sendJson(res, 200, { ok: true, embedded })
  })

  // ---------- vector lab（向量检索实验室） ----------
  r.get('/vector/overview', async (_req, res) => {
    sendJson(res, 200, { scenarios: await db.embeddingOverview() })
  })

  r.get('/vector/chunks', async (req, res) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const scenarioId = requireString(url.searchParams.get('scenario_id'), 'scenario_id')
    const intentId = url.searchParams.get('intent_id') || undefined
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
    const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size') ?? 20) || 20))
    const { total, rows } = await db.listEmbeddingChunks(scenarioId, {
      intentId, limit: size, offset: (page - 1) * size,
    })
    sendJson(res, 200, { total, page, size, chunks: rows })
  })

  r.delete('/vector/chunks', async (req, res) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const intentId = requireString(url.searchParams.get('intent_id'), 'intent_id')
    const example = requireString(url.searchParams.get('example'), 'example')
    const ok = await db.deleteEmbeddingChunk(intentId, example)
    if (!ok) throw new HttpError(404, '切片不存在')
    sendJson(res, 200, { ok: true })
  })

  /**
   * 召回测试：复刻层2 的真实检索逻辑（同一 searchSimilar + 按意图取最优 +
   * minScore 过滤 + topK 截断），返回原始切片命中与意图聚合两重视图，
   * 用于复盘「这个问题为什么召回不准」。
   */
  r.post('/vector/test', async (req, res) => {
    const body = (await readBody(req)) as Record<string, unknown>
    const scenarioId = requireString(body.scenario_id, 'scenario_id')
    const query = requireString(body.query, 'query')
    const scenario = await db.getScenario(scenarioId)
    if (!scenario) throw new HttpError(404, '场景不存在')

    // 模型与参数来源：显式指定 > 引用服务的层2 配置 > 场景默认值
    let model: ModelRow | undefined
    let topK = 8
    let minScore = 0.5
    if (typeof body.service_id === 'string' && body.service_id.trim() !== '') {
      const svc = await db.getService(body.service_id.trim())
      if (!svc) throw new HttpError(404, '服务不存在')
      if (svc.scenario_id !== scenarioId) throw new HttpError(400, '服务不属于所选场景')
      topK = Number(svc.layers?.l2?.topK ?? topK)
      minScore = Number(svc.layers?.l2?.minScore ?? minScore)
      const mid = (svc.models as Record<string, unknown>)?.embedding
      if (typeof mid === 'string' && mid !== '') model = (await db.getModel(mid)) ?? undefined
    }
    if (typeof body.model_id === 'string' && body.model_id.trim() !== '') {
      model = (await db.getModel(body.model_id.trim())) ?? undefined
    }
    if (typeof body.top_k === 'number' && body.top_k > 0) topK = Math.min(50, Math.floor(body.top_k))
    if (typeof body.min_score === 'number') minScore = Math.max(0, Math.min(1, body.min_score))
    if (!model || model.kind !== 'embedding') {
      throw new HttpError(400, '未找到可用的向量模型：请指定 model_id 或引用一个配置了向量模型的服务')
    }

    const t0 = Date.now()
    const [vector] = await embedTexts(model, [query])
    // 原始切片命中：取比最终 topK 更大的窗口，便于观察被聚合/截断掉的切片
    const rows = await db.searchSimilar(scenarioId, vector, Math.min(50, Math.max(topK * 3, 20)))
    const intents = await db.listIntents(scenarioId)
    const byId = new Map(intents.map(i => [i.id, i]))
    const chunks = rows.map(row => ({
      intent_code: byId.get(row.intent_id)?.code ?? '?',
      intent_name: byId.get(row.intent_id)?.name ?? '?',
      example: row.example,
      score: Number(row.score.toFixed(4)),
      pass: row.score >= minScore,
    }))
    // 意图聚合视图：与引擎层2 一致——每意图取最优切片，minScore 过滤，topK 截断
    const best = new Map<string, { score: number; example: string }>()
    for (const row of rows) {
      const cur = best.get(row.intent_id)
      if (!cur || row.score > cur.score) best.set(row.intent_id, { score: row.score, example: row.example })
    }
    const all = [...best.entries()]
      .map(([intentId, v]) => ({
        intent_code: byId.get(intentId)?.code ?? '?',
        intent_name: byId.get(intentId)?.name ?? '?',
        score: Number(v.score.toFixed(4)),
        best_example: v.example,
        pass: v.score >= minScore,
      }))
      .sort((a, b) => b.score - a.score)
    sendJson(res, 200, {
      model: { id: model.id, name: model.name, model: model.model },
      dims: vector.length,
      top_k: topK,
      min_score: minScore,
      latency_ms: Date.now() - t0,
      candidates: all.filter(c => c.pass).slice(0, topK),
      intents_all: all,
      chunks,
    })
  })

  // ---------- models ----------
  r.get('/models', async (req, res) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const kind = url.searchParams.get('kind')
    if (kind !== null && !MODEL_KINDS.includes(kind as ModelKind)) throw new HttpError(400, `非法 kind: ${kind}`)
    const models = (await db.listModels(kind === null ? undefined : (kind as ModelKind)))
      .map(m => ({ ...m, api_key: m.api_key === '' ? '' : '***' }))
    sendJson(res, 200, { models })
  })

  r.post('/models', async (req, res) => {
    const body = (await readBody(req)) as Record<string, unknown>
    const kind = requireString(body.kind, 'kind') as ModelKind
    if (!MODEL_KINDS.includes(kind)) throw new HttpError(400, `非法 kind: ${kind}`)
    const row = await db.createModel({
      kind,
      name: requireString(body.name, 'name'),
      base_url: requireString(body.base_url, 'base_url'),
      api_key: typeof body.api_key === 'string' ? body.api_key : '',
      model: requireString(body.model, 'model'),
      api_style: body.api_style === 'http' ? 'http' : 'openai',
      extra: typeof body.extra === 'object' && body.extra !== null ? (body.extra as Record<string, unknown>) : {},
    })
    sendJson(res, 201, { model: { ...row, api_key: row.api_key === '' ? '' : '***' } })
  })

  r.put('/models/:id', async (req, res, p) => {
    const body = (await readBody(req)) as Record<string, unknown>
    // Masked key from the UI means "keep the stored one".
    if (body.api_key === '***') delete body.api_key
    const row = await db.updateModel(p.id, body as never)
    if (!row) throw new HttpError(404, '模型不存在')
    sendJson(res, 200, { model: { ...row, api_key: row.api_key === '' ? '' : '***' } })
  })

  r.delete('/models/:id', async (_req, res, p) => {
    if (!(await db.deleteModel(p.id))) throw new HttpError(404, '模型不存在')
    sendJson(res, 200, { ok: true })
  })

  // ---------- jev 扩展配置自动生成（LLM 优先，规则兜底，交由用户审核） ----------
  r.post('/jev/draft-config', async (req, res) => {
    const body = (await readBody(req)) as Record<string, unknown>
    const scenarioId = requireString(body.scenario_id, 'scenario_id')
    const scenario = await db.getScenario(scenarioId)
    if (!scenario) throw new HttpError(404, '场景不存在')
    const intents = await db.listIntents(scenarioId)
    if (intents.length === 0) throw new HttpError(400, '该场景还没有意图，请先在「意图管理」中创建意图')
    const modelName =
      typeof body.model === 'string' && body.model.trim() !== '' ? body.model.trim() : 'jev-latest'
    const source = typeof body.source === 'string' ? body.source : 'auto'
    if (!['auto', 'llm', 'rule'].includes(source)) {
      throw new HttpError(400, 'source 仅支持 auto / llm / rule')
    }

    if (source === 'rule') {
      const extra = draftJevConfigRuleBased(scenario, intents, modelName)
      sendJson(res, 200, { extra, source: 'rule', note: '已按规则模板生成 score/choice/noul 草稿（单一 intent_recognition 问题，意图描述全文已嵌入，noul 仅二分类场景），请审核后保存' })
      return
    }

    const llms = await db.listModels('llm')
    if (llms.length === 0) {
      if (source === 'llm') {
        throw new HttpError(400, '未配置 LLM 模型，无法使用 AI 生成；请先在模型配置中添加 LLM，或改用规则模板生成')
      }
      const extra = draftJevConfigRuleBased(scenario, intents, modelName)
      sendJson(res, 200, { extra, source: 'rule', note: '未配置 LLM，已根据意图名称/描述按规则生成 score/choice/noul 草稿（noul 仅二分类场景），请审核后保存' })
      return
    }
    try {
      const extra = await draftJevConfigWithLlm(llms[0], scenario, intents, modelName)
      sendJson(res, 200, { extra, source: 'llm', note: `已使用 LLM「${llms[0].name}」生成 score/choice/noul 草稿（noul 仅二分类场景），请审核后保存` })
    } catch (e) {
      if (source === 'llm') {
        throw new HttpError(502, `LLM 生成失败：${e instanceof Error ? e.message : String(e)}；可重试或改用规则模板生成`)
      }
      const extra = draftJevConfigRuleBased(scenario, intents, modelName)
      sendJson(res, 200, { extra, source: 'rule', note: 'LLM 生成失败，已回退为规则生成 score/choice/noul 草稿，请审核后保存' })
    }
  })

  r.post('/models/:id/test', async (_req, res, p) => {    const model = await db.getModel(p.id)
    if (!model) throw new HttpError(404, '模型不存在')
    const t0 = Date.now()
    if (model.kind === 'embedding') {
      const [v] = await embedTexts(model, ['ping'])
      sendJson(res, 200, { ok: true, latency_ms: Date.now() - t0, dimension: v.length })
      return
    }
    // jev / finetune / llm all accept a chat-style ping for openai style.
    if (model.api_style === 'openai') {
      const { llmFallback } = await import('./models.ts')
      const out = await llmFallback(model, '你好', [{ code: 'greeting', name: '问候', description: '打招呼' }], [])
      sendJson(res, 200, { ok: true, latency_ms: Date.now() - t0, sample: out })
      return
    }
    sendJson(res, 200, { ok: true, latency_ms: 0, note: 'http 样式模型请在服务测试中验证' })
  })

  // ---------- services ----------
  r.get('/services', async (_req, res) => {
    const services = await db.listServices()
    const scenarios = new Map((await db.listScenarios()).map(s => [s.id, s.name]))
    sendJson(res, 200, {
      services: services.map(s => ({
        ...s,
        scenario_name: scenarios.get(s.scenario_id) ?? '',
        tool_name: toolNameOf(s),
        tool: deps.toolStatus?.(s.id) ?? { registered: false },
      })),
    })
  })

  r.post('/services', async (req, res) => {
    const body = (await readBody(req)) as Record<string, unknown>
    const scenarioId = requireString(body.scenario_id, 'scenario_id')
    if (!(await db.getScenario(scenarioId))) throw new HttpError(404, '场景不存在')
    const row = await db.createService({
      name: requireString(body.name, 'name'),
      description: typeof body.description === 'string' ? body.description : '',
      scenario_id: scenarioId,
      layers: normalizeLayers(body.layers),
      models: normalizeModelRefs(body.models),
      route_mode: normalizeRouteMode(body.route_mode) ?? 'auto',
      api_key: `ir_${randomBytes(24).toString('hex')}`,
    })
    await deps.onServicesChanged?.()
    sendJson(res, 201, { service: row })
  })

  r.get('/services/:id', async (_req, res, p) => {
    const row = await db.getService(p.id)
    if (!row) throw new HttpError(404, '服务不存在')
    sendJson(res, 200, { service: row })
  })

  r.put('/services/:id', async (req, res, p) => {
    const svc = await db.getService(p.id)
    if (!svc) throw new HttpError(404, '服务不存在')
    if (svc.status === 'running') throw new HttpError(409, '服务运行中，请先停止再修改配置')
    const body = (await readBody(req)) as Record<string, unknown>
    const row = await db.updateService(p.id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      scenario_id: typeof body.scenario_id === 'string' ? body.scenario_id : undefined,
      layers: body.layers !== undefined ? normalizeLayers(body.layers) : undefined,
      models: body.models !== undefined ? normalizeModelRefs(body.models) : undefined,
      route_mode: normalizeRouteMode(body.route_mode),
    })
    await deps.onServicesChanged?.()
    sendJson(res, 200, { service: row })
  })

  r.delete('/services/:id', async (_req, res, p) => {
    const svc = await db.getService(p.id)
    if (!svc) throw new HttpError(404, '服务不存在')
    if (svc.status === 'running') throw new HttpError(409, '服务运行中，请先停止再删除')
    await db.deleteService(p.id)
    await deps.onServicesChanged?.()
    sendJson(res, 200, { ok: true })
  })

  r.post('/services/:id/start', async (_req, res, p) => {
    const svc = await db.getService(p.id)
    if (!svc) throw new HttpError(404, '服务不存在')
    const row = await db.updateService(p.id, { status: 'running' })
    await deps.onServicesChanged?.()
    sendJson(res, 200, { service: row })
  })

  r.post('/services/:id/stop', async (_req, res, p) => {
    const svc = await db.getService(p.id)
    if (!svc) throw new HttpError(404, '服务不存在')
    const row = await db.updateService(p.id, { status: 'stopped' })
    await deps.onServicesChanged?.()
    sendJson(res, 200, { service: row })
  })

  r.post('/services/:id/copy', async (_req, res, p) => {
    const svc = await db.getService(p.id)
    if (!svc) throw new HttpError(404, '服务不存在')
    const row = await db.createService({
      name: `${svc.name}-副本-${randomBytes(2).toString('hex')}`,
      description: svc.description,
      scenario_id: svc.scenario_id,
      layers: svc.layers,
      models: svc.models,
      route_mode: svc.route_mode,
      api_key: `ir_${randomBytes(24).toString('hex')}`,
    })
    await deps.onServicesChanged?.()
    sendJson(res, 201, { service: row })
  })

  // Management-side test call: allowed while stopped, so the UI can dry-run.
  r.post('/services/:id/predict', async (req, res, p) => {
    const svc = await db.getService(p.id)
    if (!svc) throw new HttpError(404, '服务不存在')
    const body = (await readBody(req)) as { query?: string; context?: unknown }
    const query = requireString(body.query, 'query')
    const context = Array.isArray(body.context) ? body.context.map(String) : []
    const t0 = Date.now()
    const result = await engine.predict(svc, query, context)
    await db.logPredict(svc.id, query, result, result.matched_layer, Date.now() - t0).catch(() => {})
    sendJson(res, 200, result)
  })

  r.get('/services/:id/logs', async (_req, res, p) => {
    sendJson(res, 200, { logs: await db.listLogs(p.id) })
  })

  // ---------- external inference ----------
  r.post('/v1/predict', async (req, res) => {
    const key = bearerOf(req)
    if (!key) throw new HttpError(401, '缺少 Authorization: Bearer <api_key>')
    const svc = await db.getServiceByKey(key)
    if (!svc) throw new HttpError(401, '无效的 API Key')
    if (svc.status !== 'running') throw new HttpError(409, `服务「${svc.name}」未运行`)
    const body = (await readBody(req)) as { query?: string; context?: unknown }
    const query = requireString(body.query, 'query')
    const context = Array.isArray(body.context) ? body.context.map(String) : []
    const t0 = Date.now()
    const result = await engine.predict(svc, query, context)
    await db.logPredict(svc.id, query, result, result.matched_layer, Date.now() - t0).catch(() => {})
    sendJson(res, 200, result)
  })

  return r
}
