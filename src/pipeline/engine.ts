/**
 * Five-layer intent recognition pipeline.
 *
 *   L1 rule hard filter  — greeting/exit/command + keyword strong match
 *   L2 vector retrieval  — pgvector top-K candidate compression
 *   L3 Jev probabilistic — score candidates; high → route, mid → L4, low → L5
 *   L4 fine-tuned model  — boundary-case arbitration
 *   L5 LLM structured fallback — multi-intent / context / slots
 *
 * Every layer is toggleable per service; a disabled layer is skipped.
 */
import type { IntentDb } from '../db.ts'
import { ModelCallError, classifyFineTuned, classifyJev, embedTexts, llmFallback } from '../models.ts'
import { DEFAULT_ROUTE, JEV_MODES } from '../types.ts'
import type { Candidate, IntentRow, IntentRoute, JevMode, LayerTrace, ModelRow, PredictResult, ScenarioRow, ServiceRow } from '../types.ts'

const SYSTEM_INTENTS = {
  greeting: { code: '__greeting__', name: '问候' },
  exit: { code: '__exit__', name: '退出' },
  command: { code: '__command__', name: '指令' },
} as const

/** Escape user-supplied keyword into a safe literal regex fragment. */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Word-boundary match that also works for CJK: ASCII keywords demand a
 * non-alphanumeric boundary; CJK keywords match as plain substrings.
 */
function keywordHit(keyword: string, text: string): boolean {
  if (keyword === '') return false
  const esc = escapeRe(keyword)
  if (/^[\x20-\x7e]+$/.test(keyword)) {
    return new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, 'i').test(text)
  }
  return text.toLowerCase().includes(keyword.toLowerCase())
}

interface LayerOutcome {
  hit: boolean
  trace: LayerTrace
  candidates?: Candidate[]
  final?: {
    intent: IntentRow | { code: string; name: string } | null
    confidence: number
    route?: IntentRoute
  }
}

export class IntentEngine {
  constructor(private readonly db: IntentDb) {}

  async predict(service: ServiceRow, query: string, context: string[] = []): Promise<PredictResult> {
    const started = Date.now()
    const scenario = await this.db.getScenario(service.scenario_id)
    if (!scenario) throw new Error(`scenario ${service.scenario_id} not found`)
    const intents = await this.db.listIntents(scenario.id)
    const trace: LayerTrace[] = []

    // Resolve referenced model rows once.
    const modelRefs = service.models ?? { embedding: null, jev: null, finetune: null, llm: null }
    const models: Partial<Record<'embedding' | 'jev' | 'finetune' | 'llm', ModelRow>> = {}
    for (const kind of ['embedding', 'jev', 'finetune', 'llm'] as const) {
      const id = modelRefs[kind]
      if (id) {
        const row = await this.db.getModel(id)
        if (row) models[kind] = row
      }
    }

    let candidates: Candidate[] | undefined

    // ---------- L1: rule hard filter ----------
    const l1 = await this.layer1(service, scenario, intents, query)
    trace.push(l1.trace)
    if (l1.hit && l1.final) return this.finish(service, query, l1.final, 'l1', trace, started)

    // ---------- L2: vector retrieval ----------
    const l2 = await this.layer2(service, scenario, intents, query, models.embedding)
    trace.push(l2.trace)
    if (l2.candidates) candidates = l2.candidates
    // L2 never routes by itself; it only compresses the candidate set.
    if (!candidates) {
      candidates = intents.map(i => ({ intent_id: i.id, code: i.code, name: i.name, score: 0, source: 'l2' as const }))
    }

    // ---------- L3: Jev probabilistic ----------
    const l3 = await this.layer3(service, query, candidates, models.jev)
    trace.push(l3.trace)
    if (l3.hit && l3.final) return this.finish(service, query, this.withRoute(l3.final, intents), 'l3', trace, started)
    if (l3.candidates) candidates = l3.candidates

    // ---------- L4: fine-tuned arbitration ----------
    const l4 = await this.layer4(service, query, candidates, models.finetune)
    trace.push(l4.trace)
    if (l4.hit && l4.final) return this.finish(service, query, this.withRoute(l4.final, intents), 'l4', trace, started)

    // ---------- L5: LLM structured fallback ----------
    const l5 = await this.layer5(service, query, intents, context, models.llm)
    trace.push(l5.trace)
    if (l5.hit && l5.final) {
      const result = this.finish(service, query, l5.final, 'l5', trace, started)
      if (l5.extraIntents) result.intents = l5.extraIntents
      if (l5.slots) result.slots = l5.slots
      if (l5.needClarification) result.need_clarification = true
      return result
    }

    return this.finish(service, query, { intent: null, confidence: 0 }, null, trace, started)
  }

  // ------------------------------------------------------------------ L1
  private async layer1(service: ServiceRow, scenario: ScenarioRow, intents: IntentRow[], query: string): Promise<LayerOutcome> {
    const cfg = service.layers?.l1 ?? { enabled: true }
    const t0 = Date.now()
    if (!cfg.enabled) return { hit: false, trace: this.trace('l1', false, false, { reason: 'disabled' }, t0) }
    const q = query.trim()
    const confidence = Number(cfg.confidence ?? 0.99)
    const rc = scenario.rule_config ?? {}

    // System intents: greeting / exit / command.
    const greeting = (rc.greeting_keywords ?? []).some(k => keywordHit(k, q))
    if (greeting) {
      return {
        hit: true,
        final: { intent: { ...SYSTEM_INTENTS.greeting }, confidence },
        trace: this.trace('l1', true, true, { system: 'greeting' }, t0),
      }
    }
    const exit = (rc.exit_keywords ?? []).some(k => keywordHit(k, q))
    if (exit) {
      return {
        hit: true,
        final: { intent: { ...SYSTEM_INTENTS.exit }, confidence },
        trace: this.trace('l1', true, true, { system: 'exit' }, t0),
      }
    }
    for (const pattern of rc.command_patterns ?? []) {
      try {
        if (new RegExp(pattern, 'i').test(q)) {
          return {
            hit: true,
            final: { intent: { ...SYSTEM_INTENTS.command }, confidence },
            trace: this.trace('l1', true, true, { system: 'command', pattern }, t0),
          }
        }
      } catch {
        /* invalid scenario regex: ignored */
      }
    }

    // Business intents: blacklist → whitelist → keywords.
    const matched: Candidate[] = []
    for (const intent of intents) {
      if (intent.blacklist.some(k => keywordHit(k, q))) continue
      if (intent.whitelist.length > 0 && !intent.whitelist.some(k => keywordHit(k, q))) continue
      const kw = intent.keywords.find(k => keywordHit(k, q))
      if (kw !== undefined) matched.push({ intent_id: intent.id, code: intent.code, name: intent.name, score: confidence, source: 'l1' })
    }
    if (matched.length === 1) {
      const intent = intents.find(i => i.id === matched[0].intent_id)!
      return {
        hit: true,
        final: { intent: { code: intent.code, name: intent.name }, confidence, route: intent.route ?? DEFAULT_ROUTE },
        trace: this.trace('l1', true, true, { matched: matched[0].code }, t0),
      }
    }
    // Ambiguous keyword hit: demote to candidates for the probabilistic layers.
    return {
      hit: false,
      trace: this.trace('l1', true, false, { candidates: matched.map(m => m.code) }, t0),
    }
  }

  // ------------------------------------------------------------------ L2
  private async layer2(
    service: ServiceRow,
    scenario: ScenarioRow,
    intents: IntentRow[],
    query: string,
    embedding: ModelRow | undefined,
  ): Promise<LayerOutcome> {
    const cfg = service.layers?.l2 ?? { enabled: true }
    const t0 = Date.now()
    if (!cfg.enabled) return { hit: false, trace: this.trace('l2', false, false, { reason: 'disabled' }, t0) }
    if (!embedding) return { hit: false, trace: this.trace('l2', true, false, { reason: 'no embedding model configured' }, t0) }
    const topK = Number(cfg.topK ?? 8)
    const minScore = Number(cfg.minScore ?? 0.5)
    try {
      const [vector] = await embedTexts(embedding, [query])
      const rows = await this.db.searchSimilar(scenario.id, vector, topK * 3)
      const best = new Map<string, { score: number; example: string }>()
      for (const row of rows) {
        const cur = best.get(row.intent_id)
        if (!cur || row.score > cur.score) best.set(row.intent_id, { score: row.score, example: row.example })
      }
      const candidates: Candidate[] = [...best.entries()]
        .map(([intentId, v]): Candidate | null => {
          const intent = intents.find(i => i.id === intentId)
          return intent
            ? { intent_id: intentId, code: intent.code, name: intent.name, score: v.score, source: 'l2' }
            : null
        })
        .filter((c): c is Candidate => c !== null && c.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
      return {
        hit: false,
        candidates: candidates.length > 0 ? candidates : undefined,
        // 暴露实际生效的阈值与原始召回切片：被 minScore 过滤掉或聚合截断的
        // 切片也能在 trace 里看到，便于复盘“召回了但没被采用”。
        trace: this.trace('l2', true, false, {
          minScore,
          topK,
          chunks: rows.map(r => ({
            code: intents.find(i => i.id === r.intent_id)?.code ?? '?',
            example: r.example.length > 60 ? `${r.example.slice(0, 60)}…` : r.example,
            score: Number(r.score.toFixed(4)),
            pass: r.score >= minScore,
          })),
          candidates: candidates.map(c => ({ code: c.code, score: Number(c.score.toFixed(4)) })),
        }, t0),
      }
    } catch (e) {
      return {
        hit: false,
        trace: this.trace('l2', true, false, { error: (e as Error).message }, t0),
      }
    }
  }

  // ------------------------------------------------------------------ L3
  private async layer3(service: ServiceRow, query: string, candidates: Candidate[], jev: ModelRow | undefined): Promise<LayerOutcome> {
    const cfg = service.layers?.l3 ?? { enabled: true }
    const t0 = Date.now()
    if (!cfg.enabled) return { hit: false, trace: this.trace('l3', false, false, { reason: 'disabled' }, t0) }
    if (!jev) return { hit: false, trace: this.trace('l3', true, false, { reason: 'no jev model configured' }, t0) }
    if (candidates.length === 0) return { hit: false, trace: this.trace('l3', true, false, { reason: 'no candidates' }, t0) }
    const high = Number(cfg.high ?? 0.85)
    const mid = Number(cfg.mid ?? 0.5)
    const mode: JevMode = JEV_MODES.includes(cfg.mode as JevMode) ? (cfg.mode as JevMode) : 'score'
    try {
      const scores = await classifyJev(
        jev,
        query,
        candidates.map(c => ({ code: c.code, name: c.name, description: '' })),
        mode,
      )
      const byCode = new Map(scores.map(s => [s.code, s.score]))
      const ranked = candidates
        .map(c => ({ ...c, score: byCode.get(c.code) ?? 0, source: 'l3' as const }))
        .sort((a, b) => b.score - a.score)
      const top = ranked[0]
      if (top && top.score >= high) {
        return {
          hit: true,
          final: { intent: { code: top.code, name: top.name }, confidence: top.score },
          trace: this.trace('l3', true, true, { mode, top: top.code, score: top.score, band: 'high' }, t0),
        }
      }
      if (top && top.score >= mid) {
        // Mid band: forward the compressed set to layer 4 for arbitration.
        return {
          hit: false,
          candidates: ranked.slice(0, 5),
          trace: this.trace('l3', true, false, { mode, top: top.code, score: top.score, band: 'mid' }, t0),
        }
      }
      return {
        hit: false,
        trace: this.trace('l3', true, false, { mode, top: top?.code, score: top?.score, band: 'low' }, t0),
      }
    } catch (e) {
      if (!(e instanceof ModelCallError)) throw e
      return { hit: false, trace: this.trace('l3', true, false, { error: e.message }, t0) }
    }
  }

  // ------------------------------------------------------------------ L4
  private async layer4(service: ServiceRow, query: string, candidates: Candidate[], finetune: ModelRow | undefined): Promise<LayerOutcome> {
    const cfg = service.layers?.l4 ?? { enabled: true }
    const t0 = Date.now()
    if (!cfg.enabled) return { hit: false, trace: this.trace('l4', false, false, { reason: 'disabled' }, t0) }
    if (!finetune) return { hit: false, trace: this.trace('l4', true, false, { reason: 'no finetune model configured' }, t0) }
    if (candidates.length === 0) return { hit: false, trace: this.trace('l4', true, false, { reason: 'no candidates' }, t0) }
    const threshold = Number(cfg.threshold ?? 0.7)
    try {
      const { code, confidence } = await classifyFineTuned(
        finetune,
        query,
        candidates.map(c => ({ code: c.code, name: c.name, description: '' })),
      )
      const chosen = candidates.find(c => c.code === code)
      if (chosen && confidence >= threshold) {
        return {
          hit: true,
          final: { intent: { code: chosen.code, name: chosen.name }, confidence },
          trace: this.trace('l4', true, true, { top: code, confidence }, t0),
        }
      }
      return {
        hit: false,
        trace: this.trace('l4', true, false, { top: code, confidence, below: threshold }, t0),
      }
    } catch (e) {
      if (!(e instanceof ModelCallError)) throw e
      return { hit: false, trace: this.trace('l4', true, false, { error: e.message }, t0) }
    }
  }

  // ------------------------------------------------------------------ L5
  private async layer5(
    service: ServiceRow,
    query: string,
    intents: IntentRow[],
    context: string[],
    llm: ModelRow | undefined,
  ): Promise<LayerOutcome & {
    extraIntents?: Array<{ code: string; name: string; confidence: number }>
    slots?: Record<string, unknown>
    needClarification?: boolean
  }> {
    const cfg = service.layers?.l5 ?? { enabled: true }
    const t0 = Date.now()
    if (!cfg.enabled) return { hit: false, trace: this.trace('l5', false, false, { reason: 'disabled' }, t0) }
    if (!llm) return { hit: false, trace: this.trace('l5', true, false, { reason: 'no llm model configured' }, t0) }
    try {
      const out = await llmFallback(
        llm,
        query,
        intents.map(i => ({ code: i.code, name: i.name, description: i.description, examples: i.examples })),
        context,
      )
      const primary = out.intents[0]
      const byCode = new Map(intents.map(i => [i.code, i]))
      const named = out.intents
        .filter(i => byCode.has(i.code))
        .map(i => ({ code: i.code, name: byCode.get(i.code)!.name, confidence: i.confidence }))
      if (!primary || named.length === 0) {
        return {
          hit: false,
          needClarification: out.need_clarification,
          slots: out.slots,
          trace: this.trace('l5', true, false, { need_clarification: out.need_clarification }, t0),
        }
      }
      const intent = byCode.get(primary.code)!
      return {
        hit: true,
        final: { intent: { code: intent.code, name: intent.name }, confidence: primary.confidence, route: intent.route ?? DEFAULT_ROUTE },
        extraIntents: named,
        slots: out.slots,
        needClarification: out.need_clarification,
        trace: this.trace('l5', true, true, { intents: named.map(n => n.code) }, t0),
      }
    } catch (e) {
      if (!(e instanceof ModelCallError)) throw e
      return { hit: false, trace: this.trace('l5', true, false, { error: e.message }, t0) }
    }
  }

  // ------------------------------------------------------------------ misc
  /** Attach the catalog route to a final decision that only carries a code. */
  private withRoute(final: NonNullable<LayerOutcome['final']>, intents: IntentRow[]): NonNullable<LayerOutcome['final']> {
    if (final.route !== undefined || final.intent === null) return final
    const row = intents.find(i => i.code === (final.intent as { code: string }).code)
    return { ...final, route: row?.route ?? DEFAULT_ROUTE }
  }

  private trace(layer: LayerTrace['layer'], enabled: boolean, hit: boolean, detail: Record<string, unknown>, t0: number): LayerTrace {
    return { layer, enabled, hit, detail, latency_ms: Date.now() - t0 }
  }

  private finish(
    service: ServiceRow,
    query: string,
    final: NonNullable<LayerOutcome['final']>,
    matchedLayer: PredictResult['matched_layer'],
    trace: LayerTrace[],
    started: number,
  ): PredictResult {
    const result: PredictResult = {
      service_id: service.id,
      query,
      intent: final.intent === null
        ? null
        : {
            code: (final.intent as { code: string }).code,
            name: (final.intent as { name: string }).name,
            ...(final.route && final.route.type !== 'none' ? { route_target: final.route.target } : {}),
          },
      confidence: final.confidence,
      matched_layer: matchedLayer,
      trace,
      latency_ms: Date.now() - started,
    }
    if (final.route !== undefined && final.route.type !== 'none') result.route = final.route
    return result
  }
}
