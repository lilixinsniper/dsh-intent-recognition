/**
 * Jev 扩展配置自动生成：根据场景的意图列表（编码/名称/描述）生成
 * typesafe-systemone 风格的扩展配置。一次生成 **score / choice / noul 三种
 * 判定方式的问题集**（extra.modes.{score,choice,noul}.questions），服务层3
 * 通过「判定方式」下拉选择运行时启用哪一种。
 *
 * 问题结构（每种模式一个 intent_recognition 问题，覆盖全部意图）：
 * - score：criteria 是与 intent_order 平行的「各意图判定描述」数组，模型逐项
 *   评分；应答可以是分数数组（按 intent_order 对应）或以意图名/编码为键的对象。
 * - choice：criteria 是 {意图名: 判定描述} 对象，模型单选，回答意图名即定意图。
 * - noul：仅当意图数恰好为 2 时生成（是非判断只适用于二分类）；map 字段记录
 *   「是→意图A / 否→意图B」的映射，运行时据此把是/否折算到具体意图。
 *
 * 两种生成方式：AI 生成（LLM，完整描述透传）与规则模板生成（确定性）。
 * 结果交由服务创建者审核后再保存。旧版“每意图一个问题”的 modes 结构与更早的
 * 顶层 questions 配置在运行时仍然兼容。
 *
 * 注意：意图描述往往就是完整的分类规则（定义/归入信号/排除规则/边界区分），
 * 任何路径都不得截断描述——截断会让 LLM 只能臆造规则，生成的配置不可用。
 */
import { ModelCallError, chatCompletion, parseJsonLoose } from './models.ts'
import { JEV_MODES, type IntentRow, type JevMode, type ModelRow, type ScenarioRow } from './types.ts'

export interface JevQuestionSet {
  questions: Record<string, unknown>
}

export interface JevDraft {
  model: string
  state: string
  modes: Partial<Record<JevMode, JevQuestionSet>>
}

const STATE_TEXT = '用户输入文本（共享上下文），所有问题都基于这段文本判断'

/** 单问题的固定键名（三种模式共用）。 */
export const SINGLE_QUESTION_KEY = 'intent_recognition'

/** 防御性上限：单条描述超过该长度才截断（正常规则描述 1~4k 字符，不会触发）。 */
const MAX_DESCRIPTION_CHARS = 8000

function fullDescription(i: IntentRow): string {
  const d = (i.description || '').trim()
  if (d === '') return `「${i.name}」意图（未填写详细描述，按名称常识判断）`
  const body = d.length > MAX_DESCRIPTION_CHARS ? `${d.slice(0, MAX_DESCRIPTION_CHARS)}\n……（描述过长，已截断）` : d
  return `「${i.name}」意图判定描述：${body}`
}

/** noul 仅适用于二分类。 */
const noulApplicable = (intents: IntentRow[]): boolean => intents.length === 2

/** Deterministic draft: one intent_recognition question per mode. */
export function draftJevConfigRuleBased(
  scenario: ScenarioRow,
  intents: IntentRow[],
  modelName: string,
): JevDraft {
  const modes: Partial<Record<JevMode, JevQuestionSet>> = {
    score: {
      questions: {
        [SINGLE_QUESTION_KEY]: {
          type: 'score',
          instructions:
            `判断用户输入属于哪个意图。criteria 按顺序给出${intents.length}个意图的判定描述（与 intent_order 一一对应）：` +
            '请逐项评估用户输入与各意图判定描述的符合程度，命中归入信号越明确分数越高，命中排除规则或更符合其他意图则给低分，' +
            '并按 intent_order 的顺序输出每个意图 0~1 的分数。',
          criteria: intents.map(i => fullDescription(i)),
          intent_order: intents.map(i => i.code),
        },
      },
    },
    choice: {
      questions: {
        [SINGLE_QUESTION_KEY]: {
          type: 'choice',
          instructions:
            '判断用户输入属于哪个意图。criteria 以「意图名: 判定描述」给出全部候选意图：' +
            '通读各判定描述后，选择用户输入最符合的一个意图，只回答该意图的名称（criteria 的键）。',
          criteria: Object.fromEntries(intents.map(i => [i.name, fullDescription(i)])),
        },
      },
    },
  }
  if (noulApplicable(intents)) {
    const [a, b] = intents
    modes.noul = {
      questions: {
        [SINGLE_QUESTION_KEY]: {
          type: 'noul',
          instructions:
            '判断用户输入属于哪个意图。' +
            `若属于「${a.name}」回答“是”；若属于「${b.name}」或两个都不属于，回答“否”。只回答“是”或“否”。\n` +
            `${fullDescription(a)}\n${fullDescription(b)}`,
          map: { 是: a.code, 否: b.code },
        },
      },
    }
  }
  return { model: modelName, state: STATE_TEXT, modes }
}

/** LLM-assisted draft. Throws ModelCallError on any failure (caller decides fallback). */
export async function draftJevConfigWithLlm(
  llm: ModelRow,
  scenario: ScenarioRow,
  intents: IntentRow[],
  modelName: string,
): Promise<JevDraft> {
  const catalog = intents
    .map(i => `### 意图 ${i.code}（${i.name}）\n${fullDescription(i)}`)
    .join('\n\n')
  const codes = intents.map(i => i.code).join('、')
  const names = intents.map(i => i.name).join('、')
  const wantNoul = noulApplicable(intents)
  const sys = [
    '你在为 Jev 概率分类服务（typesafe systemone 接口）生成 questions 配置。',
    '该服务运行时向模型发送 { model, state: 用户输入, questions }，模型对问题作答，据此判定用户输入属于哪个意图。',
    '',
    '输出且仅输出一个 JSON 对象，不要 markdown 代码围栏，不要任何额外文字。结构（三种模式各一个问题，键名固定为 intent_recognition）：',
    '{"model":"<模型名>","state":"<共享上下文说明>","modes":{',
    '  "score":{"questions":{"intent_recognition":{"type":"score","instructions":"<判定指令>","criteria":["<意图1判定描述>","<意图2判定描述>",...],"intent_order":["<意图1code>","<意图2code>",...]}}},',
    '  "choice":{"questions":{"intent_recognition":{"type":"choice","instructions":"<判定指令>","criteria":{"<意图1名称>":"<判定描述>","<意图2名称>":"<判定描述>",...}}}},',
    ...(wantNoul
      ? ['  "noul":{"questions":{"intent_recognition":{"type":"noul","instructions":"<判定指令>","map":{"是":"<意图Acode>","否":"<意图Bcode>"}}}']
      : []),
    '}}',
    '',
    '要求：',
    `1. 意图共 ${intents.length} 个：${codes}（名称：${names}）。score 的 criteria 数组与 intent_order 等长且一一对应（必须恰好覆盖全部 ${intents.length} 个意图，顺序一致）；choice 的 criteria 对象的键必须恰好是这 ${intents.length} 个意图名称。`,
    '2. 每个意图的「判定描述」是该意图的完整判定标准。意图描述通常包含「定义 / 归入信号 / 排除规则 / 边界区分」等结构化内容：',
    '   - 必须忠实保留归入信号（什么情况算该意图）与排除规则（什么情况不算），这是区分类别的关键，不得省略或改写语义；',
    '   - 描述中的具体示例应择要保留；不得臆造描述中不存在的规则；',
    '   - 判定描述以「<意图名>」意图判定描述：开头，便于模型与人对齐。',
    '3. score 的 instructions：说明 criteria 与 intent_order 一一对应，要求逐项评估用户输入与各判定描述的符合程度（命中归入信号越高分，命中排除规则或更符合其他意图给低分），并按 intent_order 顺序输出每个意图 0~1 的分数。',
    '4. choice 的 instructions：要求通读全部判定描述后选择最符合的一个意图，只回答意图名称（criteria 的键）。',
    ...(wantNoul
      ? [`5. noul 的 instructions：明确“是”对应「${intents[0].name}」（map.是 = ${intents[0].code}）、“否”对应「${intents[1].name}」或均不属于（map.否 = ${intents[1].code}），只回答“是”或“否”，并在 instructions 中附上两个意图的判定描述。`]
      : [`5. 本场景意图数为 ${intents.length}（≠2），是非判断不适用，不要生成 modes.noul。`]),
    '6. state 用一句话说明这是待分类的用户输入文本，并点明业务场景。',
    '7. 三种模式口径必须一致：同一输入在三种模式下应判定出同一个意图。',
  ].join('\n')
  const user =
    `业务场景：${scenario.name}${scenario.description ? `（${scenario.description}）` : ''}\n` +
    `模型名：${modelName}\n\n意图清单（描述全文如下，务必逐条读完再生成）：\n\n${catalog}`
  const raw = await chatCompletion(llm, [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ], true)
  const data = parseJsonLoose(raw)
  const modes = validateModes(data.modes, intents)
  return {
    model: typeof data.model === 'string' && data.model.trim() !== '' ? data.model : modelName,
    state: typeof data.state === 'string' && data.state.trim() !== '' ? data.state : STATE_TEXT,
    modes,
  }
}

/** Validate the LLM-produced modes structure; throws ModelCallError on any defect. */
function validateModes(v: unknown, intents: IntentRow[]): Partial<Record<JevMode, JevQuestionSet>> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new ModelCallError('LLM 输出缺少 modes 对象')
  }
  const src = v as Record<string, unknown>
  const out: Partial<Record<JevMode, JevQuestionSet>> = {}
  const codes = new Set(intents.map(i => i.code))
  const names = new Set(intents.map(i => i.name))

  const singleQuestion = (mode: JevMode): Record<string, unknown> => {
    const set = src[mode] as Record<string, unknown> | undefined
    const questions = set?.questions
    if (typeof questions !== 'object' || questions === null || Array.isArray(questions)) {
      throw new ModelCallError(`LLM 输出缺少 modes.${mode}.questions 对象`)
    }
    const keys = Object.keys(questions as Record<string, unknown>)
    if (keys.length !== 1) {
      throw new ModelCallError(`modes.${mode}.questions 应只含一个问题（键名 ${SINGLE_QUESTION_KEY}），实际 ${keys.length} 个`)
    }
    const q = (questions as Record<string, unknown>)[keys[0]]
    if (typeof q !== 'object' || q === null || Array.isArray(q)) {
      throw new ModelCallError(`modes.${mode} 的问题不是对象`)
    }
    const o = q as Record<string, unknown>
    o.type = mode
    if (typeof o.instructions !== 'string' || o.instructions.trim() === '') {
      throw new ModelCallError(`modes.${mode} 缺少 instructions`)
    }
    return o
  }

  // score：criteria 为与 intent_order 平行的判定描述数组
  {
    const q = singleQuestion('score')
    if (!Array.isArray(q.criteria) || q.criteria.length !== intents.length
      || !(q.criteria as unknown[]).every(c => typeof c === 'string' && (c as string).trim() !== '')) {
      throw new ModelCallError(`modes.score 的 criteria 须为 ${intents.length} 条判定描述字符串`)
    }
    if (!Array.isArray(q.intent_order) || (q.intent_order as unknown[]).length !== intents.length
      || !(q.intent_order as unknown[]).every(c => typeof c === 'string' && codes.has(c as string))) {
      throw new ModelCallError('modes.score 缺少 intent_order（须按 criteria 顺序列出全部意图编码）')
    }
    out.score = { questions: { [SINGLE_QUESTION_KEY]: q } }
  }

  // choice：criteria 为 {意图名: 判定描述}
  {
    const q = singleQuestion('choice')
    const c = q.criteria
    if (typeof c !== 'object' || c === null || Array.isArray(c)) {
      throw new ModelCallError('modes.choice 的 criteria 须为 {意图名: 判定描述} 对象')
    }
    const map = c as Record<string, unknown>
    const missing = [...names].filter(n => !(n in map) || typeof map[n] !== 'string' || (map[n] as string).trim() === '')
    if (missing.length > 0) {
      throw new ModelCallError(`modes.choice 的 criteria 缺少意图: ${missing.join('、')}`)
    }
    out.choice = { questions: { [SINGLE_QUESTION_KEY]: q } }
  }

  // noul：仅二分类；map 记录 是/否 → 意图编码
  if (noulApplicable(intents)) {
    const q = singleQuestion('noul')
    delete q.criteria
    const map = q.map as Record<string, unknown> | undefined
    if (typeof map !== 'object' || map === null
      || typeof map['是'] !== 'string' || typeof map['否'] !== 'string'
      || !codes.has(map['是'] as string) || !codes.has(map['否'] as string)
      || map['是'] === map['否']) {
      throw new ModelCallError('modes.noul 缺少 map（形如 {"是":"<意图A编码>","否":"<意图B编码>"}，且须为两个不同的合法编码）')
    }
    out.noul = { questions: { [SINGLE_QUESTION_KEY]: q } }
  }
  return out
}
