/**
 * Model invocation clients. Every model (embedding / jev / fine-tuned / llm)
 * is a page-configured row; this module turns a ModelRow into calls.
 * Two wire styles:
 *  - openai: OpenAI-compatible /embeddings and /chat/completions
 *  - http:   plain JSON POST classify endpoints (for jev / fine-tuned services)
 */
import type { JevMode, ModelRow } from './types.ts'

export class ModelCallError extends Error {}

function headersOf(m: ModelRow): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' }
  if (m.api_key) h.authorization = `Bearer ${m.api_key}`
  const extra = (m.extra?.headers ?? {}) as Record<string, string>
  for (const [k, v] of Object.entries(extra)) h[k] = String(v)
  return h
}

function baseOf(m: ModelRow): string {
  return m.base_url.replace(/\/+$/, '')
}

async function postJson(m: ModelRow, path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseOf(m)}${path}`, {
      method: 'POST',
      headers: headersOf(m),
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) throw new ModelCallError(`${m.kind} model ${m.name} HTTP ${res.status}: ${text.slice(0, 300)}`)
    try {
      return JSON.parse(text)
    } catch {
      throw new ModelCallError(`${m.kind} model ${m.name} returned non-JSON: ${text.slice(0, 300)}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

const timeoutOf = (m: ModelRow): number => {
  const t = Number(m.extra?.timeout_ms)
  return Number.isFinite(t) && t > 0 ? t : 30_000
}

/** Embed a batch of texts. Returns one vector per input. */
export async function embedTexts(m: ModelRow, texts: string[]): Promise<number[][]> {
  if (m.api_style === 'http') {
    // Plain endpoint: POST base_url { model, texts } -> { embeddings: number[][] }
    const data = (await postJson(m, '', { model: m.model, texts }, timeoutOf(m))) as { embeddings?: number[][] }
    if (!Array.isArray(data?.embeddings)) throw new ModelCallError(`embedding model ${m.name}: missing "embeddings" array`)
    return data.embeddings
  }
  const path = typeof m.extra?.embeddings_path === 'string' ? m.extra.embeddings_path : '/v1/embeddings'
  const data = (await postJson(m, path, { model: m.model, input: texts }, timeoutOf(m))) as {
    data?: Array<{ embedding?: number[] }>
  }
  if (!Array.isArray(data?.data)) throw new ModelCallError(`embedding model ${m.name}: malformed openai-style response`)
  return data.data.map(d => {
    if (!Array.isArray(d.embedding)) throw new ModelCallError(`embedding model ${m.name}: missing embedding vector`)
    return d.embedding
  })
}

export interface CandidateInput {
  code: string
  name: string
  description: string
}

export interface ScoredIntent {
  code: string
  score: number
}

/**
 * Layer-3 Jev-class probabilistic classifier.
 * http style (default): POST base_url { model, text, candidates:[{code,name,description}] }
 *   accepts { scores: [{code, score}] } | { results: [{label|code, score|probability}] }
 * http style (systemone): when the extra config carries question sets, POST
 *   base_url { model, state: text, questions } and read an answers map keyed by
 *   intent code. Question-set resolution order:
 *     extra.modes[mode].questions  →  extra.questions (legacy, 视为 score)
 *   mode 来自服务层3 的「判定方式」（score 评分 / choice 单选 / noul 是非）。
 *   应答取值兼容：数值、布尔、"是/否/true/false" 文本、{score|probability|confidence}
 *   对象，以及 choice 模式下回答选项原文（按选项顺序线性折算分数）。
 * openai style: chat completion that must answer a JSON object
 *   { "scores": [{ "code": "...", "score": 0..1 }] } over the given candidates.
 */
export async function classifyJev(m: ModelRow, text: string, candidates: CandidateInput[], mode: JevMode = 'score'): Promise<ScoredIntent[]> {
  if (m.api_style === 'http') {
    const legacy = m.extra?.questions
    const sets = m.extra?.modes as Record<string, { questions?: unknown }> | undefined
    let questions = sets?.[mode]?.questions
    if (typeof questions !== 'object' || questions === null || Array.isArray(questions)) {
      // 请求的模式没有对应问题集：回退旧版单 questions 配置（视为 score）
      questions = legacy
    }
    if (typeof questions === 'object' && questions !== null && !Array.isArray(questions)) {
      const data = await postJson(m, '', { model: m.model, state: text, questions }, timeoutOf(m))
      return normalizeAnswerMap(data, candidates, questions as Record<string, unknown>, mode)
    }
    const data = await postJson(m, '', { model: m.model, text, candidates }, timeoutOf(m))
    return normalizeScores(data)
  }
  const sys =
    'You are an intent classification model. Given a user utterance and a candidate intent list, ' +
    'output ONLY a JSON object {"scores":[{"code":"<candidate code>","score":<0..1>},...]} with one entry per candidate, ' +
    'probabilities summing to 1. No extra text.'
  const user = JSON.stringify({ text, candidates })
  const raw = await chatCompletion(m, [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ], true)
  return normalizeScores(parseJsonLoose(raw))
}

/** Clamp helper. */
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

/** 单值折算 0~1：数值 / 布尔 / 是否文本 / {score|probability|confidence|value|answer} 对象。 */
function toScoreValue(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return clamp01(v)
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return clamp01(n)
    return /^(是|true|yes|y)$/i.test(v.trim()) ? 1 : 0
  }
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    return toScoreValue(o.score ?? o.probability ?? o.confidence ?? o.value ?? o.answer)
  }
  return 0
}

/**
 * Normalize a systemone-style answers map ({answers|data|result: {key: value}}) to scores.
 * 支持两种问题结构：
 * - 每意图一个问题（旧版）：answers 以意图编码为键，逐项折算；
 * - 单 intent_recognition 问题（当前生成结构）：按问题 type 折算——
 *   score：应答为与 intent_order 平行的分数数组，或以意图名/编码为键的对象；
 *   choice：应答为所选意图名（criteria 的键）；
 *   noul：应答“是/否”，按问题 map 字段（{"是":codeA,"否":codeB}）落到具体意图。
 */
function normalizeAnswerMap(data: unknown, candidates: CandidateInput[], questions?: Record<string, unknown>, mode: JevMode = 'score'): ScoredIntent[] {
  const root = (data ?? {}) as Record<string, unknown>
  const map = (root.answers ?? root.data ?? root.result) as Record<string, unknown> | undefined
  if (typeof map !== 'object' || map === null || Array.isArray(map)) return normalizeScores(data)

  // ---- 单问题结构：问题键不与任何候选编码重合（如 intent_recognition） ----
  if (questions && !candidates.some(c => c.code in questions)) {
    const qKey = Object.keys(questions)[0]
    const def = (questions[qKey] ?? {}) as Record<string, unknown>
    const answer = map[qKey]
    const zero = candidates.map(c => ({ code: c.code, score: 0 }))

    /** 把“意图名/编码”答案匹配到候选（去引号、大小写、包含关系容错）。 */
    const matchCandidate = (v: unknown): string | null => {
      if (typeof v !== 'string') return null
      const a = v.trim().replace(/[「」『』"“”]/g, '')
      if (a === '') return null
      const exact = candidates.find(c => c.code === a || c.name === a)
      if (exact) return exact.code
      const ci = candidates.find(c => c.code.toLowerCase() === a.toLowerCase() || c.name.toLowerCase() === a.toLowerCase())
      if (ci) return ci.code
      const loose = candidates.find(c => a.includes(c.name) || c.name.includes(a) || a.includes(c.code))
      return loose?.code ?? null
    }

    /** 对象应答中的概率表（如 {probabilities: {意图名: 概率}}），键按名称/编码/去引号容错匹配。 */
    const scoreByProbabilities = (o: Record<string, unknown>): ScoredIntent[] | null => {
      const p = (o.probabilities ?? o.probs ?? o.distribution) as Record<string, unknown> | undefined
      if (typeof p !== 'object' || p === null || Array.isArray(p)) return null
      const strip = (k: string) => k.trim().replace(/[「」『』"“”]/g, '')
      return candidates.map(c => {
        let v: unknown = p[c.code] ?? p[c.name]
        if (v === undefined) {
          const key = Object.keys(p).find(k => {
            const kk = strip(k)
            return kk === c.name || kk === c.code
              || kk.toLowerCase() === c.name.toLowerCase() || kk.toLowerCase() === c.code.toLowerCase()
          })
          if (key !== undefined) v = p[key]
        }
        return { code: c.code, score: toScoreValue(v) }
      })
    }
    /** 对象应答中提取“所选意图/是否”标签字段。 */
    const labelOf = (o: Record<string, unknown>): unknown =>
      o.choice ?? o.selected ?? o.option ?? o.label ?? o.intent ?? o.answer ?? o.value ?? o.text


    if (def.type === 'noul' || mode === 'noul') {
      // 是 → map.是；否 → map.否（无 map 时退化为候选顺序）
      const m = def.map as Record<string, unknown> | undefined
      const yesCode = typeof m?.['是'] === 'string' ? (m['是'] as string) : candidates[0]?.code
      const noCode = typeof m?.['否'] === 'string' ? (m['否'] as string) : candidates[1]?.code
      let yes: boolean | null = null
      if (typeof answer === 'boolean') yes = answer
      else if (typeof answer === 'number') yes = answer >= 0.5
      else if (typeof answer === 'string') {
        if (/^(是|true|yes|y)$/i.test(answer.trim())) yes = true
        else if (/^(否|不是|false|no|n)$/i.test(answer.trim())) yes = false
      } else if (typeof answer === 'object' && answer !== null) {
        const o = answer as Record<string, unknown>
        // 带 probabilities 概率表：直接按概率折算
        const byProbs = scoreByProbabilities(o)
        if (byProbs) return byProbs
        // 带 choice/answer 等字段：按“是/否”标签解析
        const label = labelOf(o)
        if (typeof label === 'boolean') yes = label
        else if (typeof label === 'number') yes = label >= 0.5
        else if (typeof label === 'string') {
          if (/^(是|true|yes|y)$/i.test(label.trim())) yes = true
          else if (/^(否|不是|false|no|n)$/i.test(label.trim())) yes = false
        }
        if (yes === null) return zero
      }
      if (yes === null) return zero
      const chosen = yes ? yesCode : noCode
      return candidates.map(c => ({ code: c.code, score: c.code === chosen ? 1 : 0 }))
    }

    if (def.type === 'choice' || mode === 'choice') {
      if (typeof answer === 'object' && answer !== null && !Array.isArray(answer)) {
        const o = answer as Record<string, unknown>
        // 1) 带 probabilities 概率表：直接按概率折算
        const byProbs = scoreByProbabilities(o)
        if (byProbs) return byProbs
        // 2) 带 choice/answer 等字段：取标签匹配意图
        const label = labelOf(o)
        if (typeof label === 'string') {
          const hit = matchCandidate(label)
          if (hit !== null) return candidates.map(c => ({ code: c.code, score: c.code === hit ? 1 : 0 }))
          return zero
        }
        // 3) 兼容：对象本身即以 名称/编码 → 值
        return candidates.map(c => {
          const v = o[c.code] ?? o[c.name]
          return { code: c.code, score: toScoreValue(v) }
        })
      }
      const chosen = matchCandidate(answer)
      if (chosen === null) return zero
      return candidates.map(c => ({ code: c.code, score: c.code === chosen ? 1 : 0 }))
    }

    // score：数组（按 intent_order/criteria 顺序）或对象（名称/编码为键）
    const order = Array.isArray(def.intent_order)
      ? (def.intent_order as unknown[]).filter((c): c is string => typeof c === 'string')
      : []
    let arr: unknown[] | null = null
    if (Array.isArray(answer)) arr = answer
    else if (typeof answer === 'object' && answer !== null) {
      const o = answer as Record<string, unknown>
      const byProbs = scoreByProbabilities(o)
      if (byProbs) return byProbs
      const inner = o.scores ?? o.values ?? o.results
      if (Array.isArray(inner)) arr = inner
      else {
        return candidates.map(c => ({ code: c.code, score: toScoreValue(o[c.code] ?? o[c.name]) }))
      }
    }
    if (arr !== null) {
      return candidates.map(c => {
        const idx = order.indexOf(c.code)
        const v = idx >= 0 && idx < (arr as unknown[]).length ? (arr as unknown[])[idx] : undefined
        return { code: c.code, score: toScoreValue(v) }
      })
    }
    return zero
  }

  /** choice 模式：把“选项原文”答案按选项顺序线性折算成分数（第 1 项 = 1，末项 = 0）。 */
  const choiceScore = (answer: string, criteria: unknown): number | null => {
    if (!Array.isArray(criteria) || criteria.length === 0) return null
    const options = criteria.map(o =>
      typeof o === 'string' ? o : String((o as Record<string, unknown>)?.label ?? (o as Record<string, unknown>)?.option ?? ''))
    const a = answer.trim()
    let idx = options.findIndex(o => o === a)
    if (idx < 0) idx = options.findIndex(o => o !== '' && (a.includes(o) || o.includes(a)))
    if (idx < 0) return null
    return options.length === 1 ? 1 : 1 - idx / (options.length - 1)
  }

  // ---- 每意图一个问题（旧版结构）：answers 以意图编码为键 ----
  const toScore = (v: unknown, def?: unknown): number => {
    const criteria = (def as Record<string, unknown> | undefined)?.criteria
    const qType = (def as Record<string, unknown> | undefined)?.type
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(1, v))
    if (typeof v === 'boolean') return v ? 1 : 0
    if (typeof v === 'string') {
      const n = Number(v)
      if (Number.isFinite(n)) return Math.max(0, Math.min(1, n))
      if (qType === 'choice') {
        const cs = choiceScore(v, criteria)
        if (cs !== null) return cs
      }
      if (/^(是|true|yes|y)$/i.test(v.trim())) return 1
      return 0
    }
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>
      return toScore(o.score ?? o.probability ?? o.confidence ?? o.value ?? o.answer, def)
    }
    return 0
  }
  return candidates.map(c => ({ code: c.code, score: toScore(map[c.code], questions?.[c.code]) }))
}

/**
 * Layer-4 lightweight fine-tuned model (BERT-style classifier or small LLM).
 * http style: POST base_url { model, text, candidates } -> { label|code, confidence }
 *   or { scores: [...] } (top-1 is used).
 * openai style: chat completion answering {"code":"...","confidence":0..1}.
 */
export async function classifyFineTuned(m: ModelRow, text: string, candidates: CandidateInput[]): Promise<{ code: string; confidence: number }> {
  if (m.api_style === 'http') {
    const data = (await postJson(m, '', { model: m.model, text, candidates }, timeoutOf(m))) as Record<string, unknown>
    const label = (data.label ?? data.code) as string | undefined
    const conf = Number(data.confidence ?? data.score)
    if (typeof label === 'string' && Number.isFinite(conf)) return { code: label, confidence: conf }
    const scores = normalizeScores(data)
    if (scores.length > 0) {
      scores.sort((a, b) => b.score - a.score)
      return { code: scores[0].code, confidence: scores[0].score }
    }
    throw new ModelCallError(`finetune model ${m.name}: unrecognized response shape`)
  }
  const sys =
    'You are a fine-tuned intent classifier for boundary cases. Pick exactly one candidate intent. ' +
    'Output ONLY JSON {"code":"<candidate code>","confidence":<0..1>}. No extra text.'
  const user = JSON.stringify({ text, candidates })
  const raw = await chatCompletion(m, [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ], true)
  const data = parseJsonLoose(raw) as { code?: string; confidence?: number }
  if (typeof data.code !== 'string') throw new ModelCallError(`finetune model ${m.name}: missing "code"`)
  return { code: data.code, confidence: Number(data.confidence ?? 0) }
}

export interface LlmFallbackOutput {
  intents: Array<{ code: string; confidence: number }>
  slots: Record<string, unknown>
  need_clarification: boolean
  reasoning?: string
}

/** Layer-5 LLM structured fallback: multi-intent, context, slot extraction. */
export async function llmFallback(
  m: ModelRow,
  text: string,
  intents: Array<CandidateInput & { examples?: string[] }>,
  context: string[],
): Promise<LlmFallbackOutput> {
  const catalog = intents
    .map(i => `- code: ${i.code}\n  name: ${i.name}\n  description: ${i.description}${i.examples?.length ? `\n  examples: ${i.examples.slice(0, 5).join(' / ')}` : ''}`)
    .join('\n')
  const override = typeof m.extra?.prompt === 'string' ? String(m.extra.prompt) : undefined
  const sys = override ?? [
    'You are the final-fallback intent recognition component of a layered router.',
    'Decide which intent(s) the user message expresses. Rules:',
    '1. Answer ONLY a JSON object, no markdown fence, no extra text.',
    '2. Schema: {"intents":[{"code":"<intent code>","confidence":<0..1>}],',
    '   "slots":{...},"need_clarification":<bool>,"reasoning":"<one sentence>"}',
    '3. "intents" may contain several entries when the message composes multiple intents (max 3, ordered by confidence).',
    '4. Use conversation context to resolve ellipsis and anaphora; ignore context for unrelated new topics.',
    '5. Extract slot values mentioned in the message into "slots".',
    '6. If nothing matches or the query is too ambiguous, return an empty "intents" array and set need_clarification.',
    'Available intents:',
    catalog,
  ].join('\n')
  const messages: Array<{ role: string; content: string }> = [{ role: 'system', content: sys }]
  if (context.length > 0) messages.push({ role: 'user', content: `Conversation context:\n${context.join('\n')}` })
  messages.push({ role: 'user', content: `User message: ${text}` })
  const raw = await chatCompletion(m, messages, true)
  const data = parseJsonLoose(raw) as Partial<LlmFallbackOutput>
  return {
    intents: Array.isArray(data.intents)
      ? data.intents.filter(i => typeof i?.code === 'string').map(i => ({ code: String(i.code), confidence: Number(i.confidence ?? 0) }))
      : [],
    slots: typeof data.slots === 'object' && data.slots !== null ? (data.slots as Record<string, unknown>) : {},
    need_clarification: Boolean(data.need_clarification),
    reasoning: typeof data.reasoning === 'string' ? data.reasoning : undefined,
  }
}

export async function chatCompletion(m: ModelRow, messages: Array<{ role: string; content: string }>, jsonMode: boolean): Promise<string> {
  const path = typeof m.extra?.chat_path === 'string' ? m.extra.chat_path : '/v1/chat/completions'
  const body: Record<string, unknown> = {
    model: m.model,
    messages,
    temperature: Number(m.extra?.temperature ?? 0),
  }
  if (jsonMode && m.extra?.json_mode !== false) body.response_format = { type: 'json_object' }
  const data = (await postJson(m, path, body, timeoutOf(m))) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new ModelCallError(`${m.kind} model ${m.name}: empty chat completion`)
  return content
}

/** Extract the first JSON object from raw model text (tolerates fences/preamble). */
export function parseJsonLoose(raw: string): Record<string, unknown> {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new ModelCallError(`model output is not JSON: ${raw.slice(0, 200)}`)
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch (e) {
    throw new ModelCallError(`model output JSON parse failed: ${(e as Error).message}`)
  }
}

/** Accept the common classifier response shapes and normalize to {code, score}[]. */
function normalizeScores(data: unknown): ScoredIntent[] {
  const root = (data ?? {}) as Record<string, unknown>
  const arr = (root.scores ?? root.results ?? root.predictions) as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(arr)) throw new ModelCallError('classifier response missing scores/results array')
  return arr
    .map(item => ({
      code: String(item.code ?? item.label ?? item.intent ?? ''),
      score: Number(item.score ?? item.probability ?? item.confidence ?? 0),
    }))
    .filter(item => item.code !== '' && Number.isFinite(item.score))
}
