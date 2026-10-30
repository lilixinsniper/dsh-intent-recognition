/**
 * Per-service agent tools. Every running service gets a dedicated tool
 * (`intent_recognize_<slug>`); stopping or deleting the service revokes it.
 * Tool execution runs the five-layer pipeline and — in `auto` route mode —
 * executes the matched intent's route (workflow / subagent / service) inline.
 *
 * The ToolDefinition is constructed directly (no runtime dependency on the
 * dsh-tools defineTool helper): `parameters` is plain JSON Schema and
 * `output.schema` uses only the host-supported subset — that is exactly what
 * first-party tools hand to ctx.tools.register() across all supported hosts.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IntentDb } from './db.ts'
import { executeRoute, shouldExecuteRoute } from './dispatcher.ts'
import type { HostSeams } from './dispatcher.ts'
import type { IntentEngine } from './pipeline/engine.ts'
import type { PredictResult, ServiceRow } from './types.ts'

interface ToolsService {
  register(tool: unknown): () => void
}

/** Tool-name-safe slug of a service name; falls back to the id. */
export function toolNameOf(service: ServiceRow): string {
  const slug = service.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const core = slug !== '' && !/^[0-9]/.test(slug) ? slug : `svc_${service.id.replace(/-/g, '').slice(0, 8)}`
  return `intent_recognize_${core}`
}

/**
 * Canonical-output declaration. Permissive object root on purpose: the schema
 * is enforced against every successful value, and PredictResult carries
 * nullable/dynamic fields (slots, trace detail) that the closed schema subset
 * cannot express. This schema is never model-visible.
 */
const OUTPUT_SCHEMA = { type: 'object', additionalProperties: true } as const

export interface ToolStatus {
  registered: boolean
  error?: string
}

export class ServiceToolManager {
  private toolsService: ToolsService | null = null
  private readonly registered = new Map<string, () => void>()
  private readonly errors = new Map<string, string>()

  constructor(
    private readonly ctx: Context,
    private readonly db: IntentDb,
    private readonly engine: IntentEngine,
    private readonly host: HostSeams,
  ) {}

  /** Called (via ctx.inject) when the host tools service becomes available. */
  attach(tools: ToolsService): void {
    this.toolsService = tools
  }

  /** Called when the tools service goes away (or the plugin unloads). */
  detach(): void {
    this.toolsService = null
    this.disposeAll()
  }

  /** Registration state for one service, surfaced through the API. */
  statusOf(serviceId: string): ToolStatus {
    if (this.registered.has(serviceId)) return { registered: true }
    const error = this.errors.get(serviceId)
    return error !== undefined ? { registered: false, error } : { registered: false }
  }

  /** Diff running services against registered tools; register/revoke as needed. */
  async reconcile(): Promise<void> {
    const tools = this.toolsService
    if (!tools) return
    const services = await this.db.listServices()
    const running = new Map(services.filter(s => s.status === 'running').map(s => [s.id, s]))

    // Revoke tools of stopped/deleted services.
    for (const [id, dispose] of this.registered) {
      if (!running.has(id)) {
        dispose()
        this.registered.delete(id)
        this.errors.delete(id)
        this.ctx.logger.info('intent tool revoked for service %s', id)
      }
    }
    // Register tools for newly running services.
    for (const [id, service] of running) {
      if (this.registered.has(id)) continue
      try {
        const dispose = tools.register(await this.buildTool(service))
        this.registered.set(id, dispose)
        this.errors.delete(id)
        this.ctx.logger.info('intent tool registered: %s (service %s)', toolNameOf(service), service.name)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.errors.set(id, message)
        this.ctx.logger.warn('intent tool registration failed for %s: %s', service.name, message)
      }
    }
  }

  disposeAll(): void {
    for (const dispose of this.registered.values()) dispose()
    this.registered.clear()
  }

  /** Number of currently registered per-service tools. */
  get activeToolCount(): number {
    return this.registered.size
  }

  private async buildTool(service: ServiceRow): Promise<Record<string, unknown>> {
    const scenario = await this.db.getScenario(service.scenario_id)
    const intents = await this.db.listIntents(service.scenario_id)
    const catalog = intents.slice(0, 40).map(i => `- ${i.code}: ${i.name}（${i.description || '无描述'}）`).join('\n')
    const toolName = toolNameOf(service)
    const description = [
      `Recognize the intent of a user utterance in the "${service.name}" scenario` +
        (scenario?.description ? ` (${scenario.description})` : '') +
        ', through a five-layer pipeline (rules → vector → jev → fine-tuned → llm).',
      'Call this BEFORE answering domain questions in this scenario.',
      'The result contains the matched intent, confidence, matched layer, extracted slots,',
      'and a route. When route_result is present, the downstream action already ran —',
      'summarize it to the user. When only route is present, follow it (dispatch the named',
      'subagent preset / workflow) or handle the intent yourself.',
      catalog ? `Known intents:\n${catalog}` : '',
    ].filter(Boolean).join(' ')

    return {
      name: toolName,
      description,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', description: 'The user utterance to classify.' },
          context: {
            type: 'array',
            description: 'Optional prior conversation turns for cross-turn context.',
            items: { type: 'string' },
          },
        },
        required: ['query'],
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args: unknown, value: PredictResult) => [{
          type: 'text',
          text: value.intent
            ? `Intent: ${value.intent.name} (${value.confidence.toFixed(3)}, layer ${value.matched_layer ?? '-'})` +
              (value.route_result ? ` | route ${value.route_result.ok ? 'executed' : 'failed: ' + (value.route_result.error ?? '')}` : '')
            : 'No intent matched.',
        }],
      },
      execute: async (args: { query: string; context?: string[] }, exec: { agent?: unknown; signal?: AbortSignal }) => {
        // Re-read the service so start/stop/config edits apply immediately.
        const current = await this.db.getService(service.id)
        if (!current || current.status !== 'running') {
          throw new Error(`intent service "${service.name}" is not running`)
        }
        const result = await this.engine.predict(current, args.query, args.context ?? [])
        if (shouldExecuteRoute(current.route_mode, result) && result.route) {
          result.route_result = await executeRoute(this.host, result.route, result, exec)
        }
        await this.db.logPredict(current.id, args.query, result, result.matched_layer, result.latency_ms).catch(() => {})
        return result
      },
      isConcurrencySafe: () => true,
    }
  }
}
