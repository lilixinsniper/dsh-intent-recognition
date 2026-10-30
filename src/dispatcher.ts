/**
 * Route dispatcher: executes the downstream action attached to a matched
 * intent — a workflow script, a subagent preset, or another plugin's Cordis
 * service. Runs inside the agent tool call, so routing stays deterministic
 * instead of depending on the main model's discretion.
 */
import type { IntentRoute, PredictResult, RouteExecution } from './types.ts'

/** Optional host capabilities, resolved lazily via ctx.get(). */
export interface HostSeams {
  workflowEngine?: {
    start(request: {
      script: string
      meta: { name: string; description: string; whenToUse?: string }
      args?: unknown
      parent: unknown
      signal?: AbortSignal
    }): {
      result: Promise<{ stopReason?: string; value?: unknown; error?: unknown }>
      cancel(reason?: string): void
      dispose(): Promise<void>
    }
  }
  subagents?: {
    startActivation(spec: {
      provider: string
      label: string
      request: {
        prompt: Array<{ type: 'text'; text: string }>
        parent: unknown
        agentPreset?: string
      }
      delivery: 'parent' | 'caller'
      signal: AbortSignal
    }): Promise<{
      result: Promise<unknown>
      dispose(): Promise<void>
    }>
  }
  /** Cordis optional service lookup. */
  get(name: string): unknown
}

/** The caller-side execution context a model tool receives. */
export interface RouteExecContext {
  agent?: unknown
  signal?: AbortSignal
}

function textOfResult(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const v = value as { text?: unknown; structured?: unknown }
    if (typeof v.text === 'string') return v.text
    if (v.structured !== undefined) return JSON.stringify(v.structured)
  }
  return undefined
}

export async function executeRoute(
  host: HostSeams,
  route: IntentRoute,
  result: PredictResult,
  exec: RouteExecContext,
): Promise<RouteExecution> {
  const base = { type: route.type, target: route.target }
  try {
    // ---------------------------------------------------------- workflow
    if (route.type === 'workflow') {
      if (!route.script || route.script.trim() === '') {
        return { ...base, ok: false, error: '路由类型为 workflow 但未配置脚本模板' }
      }
      const engine = host.workflowEngine ?? (host.get('workflowEngine') as HostSeams['workflowEngine'])
      if (!engine) return { ...base, ok: false, error: '宿主未提供 workflowEngine 服务（工作流引擎未启用）' }
      if (!exec.agent) return { ...base, ok: false, error: '缺少父 Agent 上下文，无法启动工作流' }
      const run = engine.start({
        script: route.script,
        meta: {
          name: (route.target || `intent-${result.intent?.code ?? 'run'}`).replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
          description: `意图路由工作流：${result.intent?.name ?? ''}`,
        },
        args: {
          query: result.query,
          intent: result.intent,
          confidence: result.confidence,
          matched_layer: result.matched_layer,
          slots: result.slots ?? {},
          context: [],
        },
        parent: exec.agent,
        signal: exec.signal,
      })
      const settled = await run.result
      await run.dispose().catch(() => {})
      const stopReason = String(settled?.stopReason ?? '')
      if (stopReason && stopReason !== 'completed') {
        return { ...base, ok: false, error: `工作流未正常完成（${stopReason}）: ${JSON.stringify(settled?.error ?? '').slice(0, 300)}` }
      }
      return { ...base, ok: true, value: { outcome: stopReason || 'completed', value: settled?.value ?? null } }
    }

    // ---------------------------------------------------------- subagent
    if (route.type === 'subagent') {
      const subagents = host.subagents ?? (host.get('subagents') as HostSeams['subagents'])
      if (!subagents) return { ...base, ok: false, error: '宿主未提供 subagents 服务' }
      if (!exec.agent) return { ...base, ok: false, error: '缺少父 Agent 上下文，无法派发子代理' }
      if (!exec.signal) return { ...base, ok: false, error: '缺少取消信号，无法派发子代理' }
      const promptText = [
        `用户请求：${result.query}`,
        `已识别意图：${result.intent?.name ?? ''}（${result.intent?.code ?? ''}，置信度 ${result.confidence.toFixed(3)}）`,
        Object.keys(result.slots ?? {}).length > 0 ? `已抽取槽位：${JSON.stringify(result.slots)}` : '',
        '请处理该请求。',
      ].filter(Boolean).join('\n')
      const activation = await subagents.startActivation({
        provider: 'spawn',
        label: `意图路由:${result.intent?.name ?? route.target}`,
        request: {
          prompt: [{ type: 'text', text: promptText }],
          parent: exec.agent,
          agentPreset: route.target || undefined,
        },
        delivery: 'caller',
        signal: exec.signal,
      })
      try {
        const value = await activation.result
        return { ...base, ok: true, value: { text: textOfResult(value) ?? JSON.stringify(value)?.slice(0, 2000) } }
      } finally {
        await activation.dispose().catch(() => {})
      }
    }

    // ---------------------------------------------------------- service
    if (route.type === 'service') {
      const dot = route.target.indexOf('.')
      if (dot <= 0) return { ...base, ok: false, error: `service 路由目标应为 "服务名.方法名"，实际为 "${route.target}"` }
      const svcName = route.target.slice(0, dot)
      const method = route.target.slice(dot + 1)
      const svc = host.get(svcName) as Record<string, unknown> | undefined
      if (!svc) return { ...base, ok: false, error: `宿主中不存在 Cordis 服务 "${svcName}"` }
      const fn = svc[method]
      if (typeof fn !== 'function') return { ...base, ok: false, error: `服务 "${svcName}" 没有方法 "${method}"` }
      const value = await (fn as (p: unknown) => Promise<unknown>).call(svc, {
        query: result.query,
        intent: result.intent,
        confidence: result.confidence,
        slots: result.slots ?? {},
      })
      return { ...base, ok: true, value }
    }

    return { ...base, ok: false, error: `未知路由类型: ${route.type}` }
  } catch (err) {
    return { ...base, ok: false, error: (err as Error).message }
  }
}

/**
 * Should this prediction's route execute in-tool?
 * auto mode: l1/l3/l4 hits execute; l5 stays a suggestion.
 * suggest mode: never executes.
 */
export function shouldExecuteRoute(routeMode: 'auto' | 'suggest', result: PredictResult): boolean {
  if (routeMode === 'suggest') return false
  if (!result.route || result.route.type === 'none') return false
  return result.matched_layer === 'l1' || result.matched_layer === 'l3' || result.matched_layer === 'l4'
}
