/**
 * dsh-intent-recognition — host half.
 *
 * Five-layer intent recognition pipeline plugin for DeepSeek Harness:
 * PostgreSQL + pgvector storage, management REST API, per-service agent tools
 * with in-tool route dispatch (workflow / subagent / Cordis service), a
 * process-local `intentRecognition` service for other plugins, and a dynamic
 * system-prompt section describing the live routing fabric.
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { createConnectionManager } from './connection.ts'
import { IntentDb } from './db.ts'
import type { HostSeams } from './dispatcher.ts'
import { Router, sendError, bearerOf, sendJson } from './http.ts'
import { IntentEngine } from './pipeline/engine.ts'
import { buildRouter } from './routes.ts'
import { ServiceToolManager } from './service-tools.ts'
import type { PredictResult } from './types.ts'

export const name = 'dsh-intent-recognition'
export const inject = ['webServer']

/** Plugin configuration, sourced from the bundle patch / profile config. */
export interface Config {
  /**
   * PostgreSQL connection string (pgvector extension required). Acts as the
   * fallback only — a connection saved from the management page (persisted in
   * the per-user config file) takes priority over this value.
   */
  databaseUrl: string
  /** Embedding dimension; must match the configured vector model. */
  embeddingDim: number
  /** Create tables and indexes automatically on load. */
  autoMigrate: boolean
  /** Optional bearer token for the management API (empty = loopback UI only). */
  adminToken: string
  /** Register per-service agent tools (`intent_recognize_<service>`). */
  registerTool: boolean
  /** Contribute a system-prompt section describing live intent services. */
  contributePrompt: boolean
}

export const Config: Schema<Config> = Schema.object({
  databaseUrl: Schema.string().default('postgres://postgres:postgres@127.0.0.1:5432/dsh_intent'),
  embeddingDim: Schema.number().step(1).min(1).default(1024),
  autoMigrate: Schema.boolean().default(true),
  adminToken: Schema.string().default(''),
  registerTool: Schema.boolean().default(true),
  contributePrompt: Schema.boolean().default(true),
})

const API_PREFIX = '/dsh-intent-recognition/api'

/** Routes that stay available while the database is disconnected. */
const CONNECTION_PATHS = new Set([
  '/health', '/connection', '/connection/test',
  // 数据库维护：当前库缺失/未连接时也必须可用（否则无法页面建库自救）
  '/connection/database/check', '/connection/database/create', '/connection/database/drop',
])

/** Process-local face offered to other plugins as `ctx.intentRecognition`. */
export interface IntentRecognitionFace {
  /** Run the pipeline of a running service by name or id. */
  predict(service: string, query: string, context?: string[]): Promise<PredictResult>
  /** Names of currently running services. */
  listRunning(): Promise<string[]>
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const db = new IntentDb({
    databaseUrl: config.databaseUrl,
    embeddingDim: config.embeddingDim,
    autoMigrate: config.autoMigrate,
  })

  // Page-managed connection: saved file > bundle patch. Never fail plugin
  // load on an unreachable/unconfigured database — the management UI must
  // come up so the user can fix and hot-swap the connection from the page.
  const connection = createConnectionManager({
    makeMigrator: (url: string) => new IntentDb({
      databaseUrl: url,
      embeddingDim: config.embeddingDim,
      autoMigrate: false,
    }),
    bundleUrl: config.databaseUrl,
    db,
    autoMigrate: config.autoMigrate,
    logger: ctx.logger,
  })
  await connection.init()

  const engine = new IntentEngine(db)

  // Lazily-resolved optional host seams (workflow / subagents / any service).
  const host: HostSeams = {
    get: (serviceName: string) => ctx.get(serviceName),
  }

  // ---- 1. Cordis service for other plugins: ctx.intentRecognition ----
  const face: IntentRecognitionFace = {
    async predict(service, query, context = []) {
      const services = await db.listServices()
      const svc = services.find(s => s.name === service || s.id === service)
      if (!svc) throw new Error(`intent service "${service}" not found`)
      if (svc.status !== 'running') throw new Error(`intent service "${service}" is not running`)
      const result = await engine.predict(svc, query, context)
      await db.logPredict(svc.id, query, result, result.matched_layer, result.latency_ms).catch(() => {})
      return result
    },
    async listRunning() {
      return (await db.listServices()).filter(s => s.status === 'running').map(s => s.name)
    },
  }
  ctx.effect(() => ctx.reflect.provide('intentRecognition', face))

  // ---- 2. Per-service agent tools with in-tool route dispatch ----
  const toolManager = new ServiceToolManager(ctx, db, engine, host)
  if (config.registerTool) {
    // Load-order safe: the sub-fiber starts when the host tools service is
    // available (even if it loads after us) and disposes when it goes away.
    ctx.inject(['tools'], (toolCtx) => {
      toolManager.attach((toolCtx as unknown as { tools: { register(tool: unknown): () => void } }).tools)
      void toolManager.reconcile().catch(err =>
        ctx.logger.warn('intent tool reconcile failed: %s', err instanceof Error ? err.message : String(err)))
      return () => toolManager.detach()
    })
  }

  // ---- 3. Management + inference REST API ----
  const router: Router = buildRouter({
    db,
    engine,
    adminToken: config.adminToken,
    connection,
    toolStatus: serviceId => toolManager.statusOf(serviceId),
    onServicesChanged: async () => {
      if (config.registerTool) await toolManager.reconcile().catch(() => {})
    },
  })

  const disposeRoute = ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith(API_PREFIX)) {
          sendJson(res, 404, { error: 'not found' })
          return
        }
        const sub = url.pathname.slice(API_PREFIX.length) || '/'
        if (config.adminToken !== '' && !sub.startsWith('/v1/')) {
          if (bearerOf(req) !== config.adminToken) {
            sendJson(res, 401, { error: '无效的管理令牌' })
            return
          }
        }
        // While the database is down only the recovery surface stays open:
        // health status and the connection management endpoints.
        if (!db.connected && !CONNECTION_PATHS.has(sub)) {
          sendJson(res, 503, {
            error: '数据库未连接：请先在「意图识别 → 数据库」页完成 PostgreSQL 配置（测试通过并保存后即时生效）',
          })
          return
        }
        await router.handle(req, res, sub)
      } catch (err) {
        sendError(res, err)
      }
    },
  })

  // ---- 4. System-prompt section describing the live routing fabric ----
  if (config.contributePrompt) {
    const systemPrompt = ctx.get('systemPrompt') as
      | { section(section: { name: string; order: number; text: () => string }): () => void }
      | undefined
    if (systemPrompt && typeof systemPrompt.section === 'function') {
      ctx.effect(() =>
        systemPrompt.section({
          name: 'intent-recognition',
          order: 850,
          text: () => {
            // Synchronous read of the tool registry keeps assembly sync;
            // the tool descriptions themselves carry the per-scenario detail.
            const names = toolManager.activeToolCount
            if (names === 0) return ''
            return [
              '# Intent routing',
              `This deployment has ${names} intent recognition service(s) active (tools named intent_recognize_*).`,
              'When a user message belongs to one of those scenarios, call the matching intent tool FIRST,',
              'then follow its result: if route_result is present the downstream action already ran — summarize it;',
              'otherwise follow the returned route (dispatch the named subagent preset or workflow) or answer directly.',
            ].join(' ')
          },
        }),
      )
    }
  }

  // Unload cleanup: the effect body returns the disposer; it must NOT run at load.
  ctx.effect(() => () => {
    toolManager.disposeAll()
    disposeRoute()
    return db.close()
  })
  ctx.logger.info('dsh-intent-recognition ready: api at %s', API_PREFIX)
}
