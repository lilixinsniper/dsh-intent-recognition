/**
 * Shared row types for dsh-intent-recognition.
 */

export type ModelKind = 'embedding' | 'jev' | 'finetune' | 'llm'

/** What happens after an intent is matched. */
export type RouteType = 'none' | 'workflow' | 'subagent' | 'service'

export interface IntentRoute {
  type: RouteType
  /**
   * workflow: display name of the run (script lives in `script`).
   * subagent: agent preset id to dispatch.
   * service:  `serviceName.method` on another plugin's Cordis service.
   */
  target: string
  /** workflow only: the workflow script template (plain JS, top-level await). */
  script?: string
}

export const DEFAULT_ROUTE: IntentRoute = { type: 'none', target: '' }

/** Service-level routing policy for matched intents. */
export type RouteMode = 'auto' | 'suggest'

export interface ScenarioRow {
  id: string
  name: string
  description: string
  /** Scenario-level layer-1 system rules (greeting / exit / command). */
  rule_config: {
    greeting_keywords?: string[]
    exit_keywords?: string[]
    command_patterns?: string[]
  }
  created_at: string
  updated_at: string
}

export interface IntentRow {
  id: string
  scenario_id: string
  /** Display name, e.g. "查余额". */
  name: string
  /** Stable machine code used by routes and model output, e.g. "query_balance". */
  code: string
  description: string
  examples: string[]
  /** Layer-1 strong-match keywords (word-boundary regex). */
  keywords: string[]
  /** Layer-1: query containing any blacklist term can never match this intent. */
  blacklist: string[]
  /** Layer-1: when non-empty, at least one whitelist term must appear. */
  whitelist: string[]
  /** Downstream dispatch executed (or suggested) when this intent matches. */
  route: IntentRoute
  created_at: string
  updated_at: string
}

export interface ModelRow {
  id: string
  kind: ModelKind
  name: string
  base_url: string
  api_key: string
  model: string
  /** openai = OpenAI-compatible endpoints; http = plain JSON classify endpoint. */
  api_style: 'openai' | 'http'
  /** Extra options: headers, dimension, temperature, thresholds, prompt override... */
  extra: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface LayerConfig {
  enabled: boolean
  [key: string]: unknown
}

/** Jev（层3）判定方式：score 评分 / choice 单选 / noul 是非判断。 */
export type JevMode = 'score' | 'choice' | 'noul'
export const JEV_MODES: JevMode[] = ['score', 'choice', 'noul']

export interface ServiceLayers {
  l1: LayerConfig & { confidence?: number }
  l2: LayerConfig & { topK?: number; minScore?: number }
  l3: LayerConfig & { high?: number; mid?: number; mode?: JevMode }
  l4: LayerConfig & { threshold?: number }
  l5: LayerConfig
}

export interface ServiceRow {
  id: string
  name: string
  description: string
  scenario_id: string
  layers: ServiceLayers
  /** Per-role model ids: { embedding, jev, finetune, llm } (uuid or null). */
  models: { embedding: string | null; jev: string | null; finetune: string | null; llm: string | null }
  status: 'running' | 'stopped'
  /**
   * auto: high-confidence layer hits (l1/l3/l4) execute the intent route
   * in-tool; l5 results are always suggestions for the calling agent.
   * suggest: never execute routes, return them for the caller to decide.
   */
  route_mode: RouteMode
  api_key: string
  created_at: string
  updated_at: string
}

export interface Candidate {
  intent_id: string
  code: string
  name: string
  score: number
  source: 'l1' | 'l2' | 'l3' | 'l4' | 'l5'
}

export interface LayerTrace {
  layer: 'l1' | 'l2' | 'l3' | 'l4' | 'l5'
  enabled: boolean
  hit: boolean
  detail: Record<string, unknown>
  latency_ms: number
}

export interface PredictResult {
  service_id: string
  query: string
  /** Final decision. code === null means no intent matched. */
  intent: { code: string; name: string; route_target?: string } | null
  confidence: number
  matched_layer: 'l1' | 'l2' | 'l3' | 'l4' | 'l5' | null
  /** Multi-intent results, present when layer 5 detects composition. */
  intents?: Array<{ code: string; name: string; confidence: number }>
  slots?: Record<string, unknown>
  need_clarification?: boolean
  /** The route attached to the matched intent (if any). */
  route?: IntentRoute
  /** Present when the route was executed in-tool (see RouteExecution). */
  route_result?: RouteExecution
  trace: LayerTrace[]
  latency_ms: number
}

/** Outcome of an in-tool route dispatch. */
export interface RouteExecution {
  type: RouteType
  target: string
  ok: boolean
  /** workflow: {outcome, value}; subagent: {text?, structured?}; service: method return value. */
  value?: unknown
  error?: string
}
