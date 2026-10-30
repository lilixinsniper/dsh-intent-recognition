/**
 * 向量检索实验室（层2 复盘）：
 * - 召回测试：输入测试问题，复刻引擎层2 的真实检索，返回原始切片命中
 *   （每条示例的 score）与意图聚合视图（每意图取最优切片 + 阈值过滤 + topK
 *   截断），召回不准时可以直接看到是哪个切片、哪个阈值出了问题；
 * - 切片浏览：查看场景下所有向量切片（示例文本、所属意图、维度、构建模型、
 *   构建时间），可删除脏切片；
 * - 覆盖率概览：各场景的意图/示例/切片数量、向量模型、最近重建时间，
 *   并可就地触发重建。
 */
import { useEffect, useState } from 'react'
import { api } from './api.ts'
import { ClampedText, Field, Modal } from './components.tsx'

interface ScenarioOpt { id: string; name: string }
interface ModelOpt { id: string; name: string; model: string }
interface ServiceOpt { id: string; name: string; scenario_id: string }
interface IntentOpt { id: string; code: string; name: string }

interface OverviewRow {
  scenario_id: string; scenario_name: string
  intents: number; examples: number; chunks: number; embedded_intents: number
  models: string[]; last_built_at: string | null
}

interface ChunkRow {
  intent_id: string; intent_code: string; intent_name: string
  example: string; dims: number; model_id: string | null; model_name: string | null
  created_at: string
}

interface TestResult {
  model: { id: string; name: string; model: string }
  dims: number; top_k: number; min_score: number; latency_ms: number
  candidates: Array<{ intent_code: string; intent_name: string; score: number; best_example: string; pass: boolean }>
  intents_all: Array<{ intent_code: string; intent_name: string; score: number; best_example: string; pass: boolean }>
  chunks: Array<{ intent_code: string; intent_name: string; example: string; score: number; pass: boolean }>
}

function ScoreBar(props: { score: number; pass: boolean }) {
  const pct = Math.max(0, Math.min(1, props.score)) * 100
  return (
    <span className="ir-scorebar" title={String(props.score)}>
      <span className={`ir-scorebar-fill ${props.pass ? 'on' : 'off'}`} style={{ width: `${pct}%` }} />
      <span className="ir-scorebar-num">{props.score.toFixed(4)}</span>
    </span>
  )
}

export function VectorTab() {
  const [scenarios, setScenarios] = useState<ScenarioOpt[]>([])
  const [models, setModels] = useState<ModelOpt[]>([])
  const [services, setServices] = useState<ServiceOpt[]>([])
  const [scenarioId, setScenarioId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // ---- 召回测试 ----
  const [query, setQuery] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [modelId, setModelId] = useState('')
  const [topK, setTopK] = useState('')
  const [minScore, setMinScore] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  // ---- 切片浏览 ----
  const [intents, setIntents] = useState<IntentOpt[]>([])
  const [intentFilter, setIntentFilter] = useState('')
  const [chunks, setChunks] = useState<ChunkRow[]>([])
  const [chunksTotal, setChunksTotal] = useState(0)
  const [page, setPage] = useState(1)
  const size = 20

  // ---- 概览 ----
  const [overview, setOverview] = useState<OverviewRow[]>([])
  const [rebuildFor, setRebuildFor] = useState<OverviewRow | null>(null)
  const [rebuildModelId, setRebuildModelId] = useState('')

  const run = (fn: () => Promise<void>) => {
    setError(''); setNotice('')
    fn().catch(e => setError(e instanceof Error ? e.message : String(e)))
  }

  const loadOverview = () => api.get<{ scenarios: OverviewRow[] }>('/vector/overview')
    .then(d => setOverview(d.scenarios)).catch(() => {})

  const loadChunks = (sid: string, iid: string, p: number) => {
    if (!sid) { setChunks([]); setChunksTotal(0); return }
    api.get<{ total: number; chunks: ChunkRow[] }>(
      `/vector/chunks?scenario_id=${sid}${iid ? `&intent_id=${iid}` : ''}&page=${p}&size=${size}`,
    ).then(d => { setChunks(d.chunks); setChunksTotal(d.total) }).catch(e => setError(e.message))
  }

  useEffect(() => {
    run(async () => {
      const [s, m, sv] = await Promise.all([
        api.get<{ scenarios: ScenarioOpt[] }>('/scenarios'),
        api.get<{ models: ModelOpt[] }>('/models?kind=embedding'),
        api.get<{ services: ServiceOpt[] }>('/services'),
      ])
      setScenarios(s.scenarios)
      setModels(m.models)
      setServices(sv.services)
      if (s.scenarios[0]) setScenarioId(s.scenarios[0].id)
      if (m.models[0]) setModelId(m.models[0].id)
    })
    loadOverview()
  }, [])

  useEffect(() => {
    if (!scenarioId) { setIntents([]); return }
    api.get<{ intents: IntentOpt[] }>(`/scenarios/${scenarioId}/intents`)
      .then(d => setIntents(d.intents)).catch(() => setIntents([]))
  }, [scenarioId])

  useEffect(() => { setPage(1); loadChunks(scenarioId, intentFilter, 1) }, [scenarioId, intentFilter])
  useEffect(() => { loadChunks(scenarioId, intentFilter, page) }, [page])

  const scenarioServices = services.filter(sv => sv.scenario_id === scenarioId)

  const doTest = () => run(async () => {
    if (!scenarioId || query.trim() === '') throw new Error('请选择场景并输入测试问题')
    setTesting(true)
    try {
      const d = await api.post<TestResult>('/vector/test', {
        scenario_id: scenarioId,
        query: query.trim(),
        service_id: serviceId || undefined,
        model_id: serviceId ? undefined : modelId || undefined,
        top_k: topK.trim() === '' ? undefined : Number(topK),
        min_score: minScore.trim() === '' ? undefined : Number(minScore),
      })
      setResult(d)
    } finally {
      setTesting(false)
    }
  })

  const doRebuild = () => run(async () => {
    if (!rebuildFor || !rebuildModelId) return
    const d = await api.post<{ embedded: number }>(
      `/scenarios/${rebuildFor.scenario_id}/embeddings/rebuild`, { model_id: rebuildModelId })
    setNotice(`场景「${rebuildFor.scenario_name}」已重建 ${d.embedded} 条切片`)
    setRebuildFor(null)
    loadOverview()
    loadChunks(scenarioId, intentFilter, page)
  })

  const deleteChunk = (c: ChunkRow) => run(async () => {
    await api.del(`/vector/chunks?intent_id=${c.intent_id}&example=${encodeURIComponent(c.example)}`)
    setNotice('已删除切片')
    loadChunks(scenarioId, intentFilter, page)
    loadOverview()
  })

  const totalPages = Math.max(1, Math.ceil(chunksTotal / size))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error !== '' && <div className="ir-banner err">{error}</div>}
      {notice !== '' && <div className="ir-banner ok">{notice}</div>}

      {/* ---------- 召回测试 ---------- */}
      <div className="ir-card">
        <div className="ir-card-title"><span>召回测试</span></div>
        <div className="ir-muted" style={{ margin: '6px 0' }}>
          输入一个测试问题，按所选服务/模型的层2 参数执行真实向量检索，返回每条切片的召回分数与意图聚合结果，用于复盘召回不准的问题。
        </div>
        <div className="ir-toolbar">
          <select className="ir-select" value={scenarioId} onChange={e => setScenarioId(e.target.value)}>
            {scenarios.length === 0 && <option value="">（请先创建场景）</option>}
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="ir-select" value={serviceId} onChange={e => setServiceId(e.target.value)}
            title="选择服务时自动继承其向量模型与层2 阈值/TopK">
            <option value="">（不参考服务，手动指定模型）</option>
            {scenarioServices.map(sv => <option key={sv.id} value={sv.id}>参考服务：{sv.name}</option>)}
          </select>
          {serviceId === '' && (
            <select className="ir-select" value={modelId} onChange={e => setModelId(e.target.value)}>
              {models.length === 0 && <option value="">（请先在模型配置中添加向量模型）</option>}
              {models.map(m => <option key={m.id} value={m.id}>{m.name}（{m.model}）</option>)}
            </select>
          )}
          <input className="ir-input" style={{ width: 90 }} placeholder="TopK" value={topK}
            onChange={e => setTopK(e.target.value)} title="留空则用服务层2 配置或默认 8" />
          <input className="ir-input" style={{ width: 110 }} placeholder="阈值 minScore" value={minScore}
            onChange={e => setMinScore(e.target.value)} title="留空则用服务层2 配置或默认 0.5" />
        </div>
        <div className="ir-toolbar" style={{ marginTop: 8 }}>
          <input className="ir-input" style={{ flex: 1 }} placeholder="输入测试问题，如：当前CPU利用率最高的10台设备"
            value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doTest() }} />
          <button className="ir-btn primary" disabled={testing || !scenarioId || query.trim() === ''} onClick={doTest}>
            {testing ? '检索中…' : '开始召回'}
          </button>
        </div>

        {result && (
          <div style={{ marginTop: 10 }}>
            <div className="ir-muted" style={{ marginBottom: 8 }}>
              模型 <b>{result.model.name}</b>（{result.model.model}）｜向量维度 {result.dims}｜阈值 {result.min_score}｜TopK {result.top_k}｜耗时 {result.latency_ms}ms
              ｜通过阈值并进入候选的意图：<b>{result.candidates.length === 0 ? '（无）' : result.candidates.map(c => c.intent_name).join('、')}</b>
            </div>

            <div className="ir-card-title" style={{ fontSize: 13 }}><span>意图聚合（层2 实际输出：每意图取最优切片 → 阈值过滤 → TopK 截断）</span></div>
            <div className="ir-table-wrap">
              <table className="ir-table">
                <thead><tr><th>意图</th><th>编码</th><th>最优分数</th><th>命中切片</th><th>判定</th></tr></thead>
                <tbody>
                  {result.intents_all.map(c => (
                    <tr key={c.intent_code}>
                      <td>{c.intent_name}</td>
                      <td><code>{c.intent_code}</code></td>
                      <td><ScoreBar score={c.score} pass={c.pass} /></td>
                      <td className="ir-muted ir-desc-cell"><ClampedText text={c.best_example} lines={1} threshold={60} /></td>
                      <td>{c.pass
                        ? <span className="ir-badge on">进入候选</span>
                        : <span className="ir-badge">低于阈值</span>}</td>
                    </tr>
                  ))}
                  {result.intents_all.length === 0 && (
                    <tr><td colSpan={5} className="ir-muted">该场景下没有任何向量切片，请先在下方「覆盖率概览」重建向量</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="ir-card-title" style={{ fontSize: 13, marginTop: 10 }}><span>切片命中明细（原始召回，未做意图聚合）</span></div>
            <div className="ir-table-wrap">
              <table className="ir-table">
                <thead><tr><th>#</th><th>意图</th><th>切片文本</th><th>分数</th></tr></thead>
                <tbody>
                  {result.chunks.map((c, i) => (
                    <tr key={i}>
                      <td className="ir-muted">{i + 1}</td>
                      <td>{c.intent_name}</td>
                      <td className="ir-desc-cell"><ClampedText text={c.example} lines={1} threshold={60} /></td>
                      <td><ScoreBar score={c.score} pass={c.pass} /></td>
                    </tr>
                  ))}
                  {result.chunks.length === 0 && (
                    <tr><td colSpan={4} className="ir-muted">无切片命中</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ---------- 切片浏览 ---------- */}
      <div className="ir-card">
        <div className="ir-card-title">
          <span>向量切片（共 {chunksTotal} 条）</span>
          <select className="ir-select" value={intentFilter} onChange={e => setIntentFilter(e.target.value)}>
            <option value="">全部意图</option>
            {intents.map(i => <option key={i.id} value={i.id}>{i.name}（{i.code}）</option>)}
          </select>
        </div>
        <div className="ir-muted" style={{ margin: '6px 0' }}>
          切片即意图示例文本对应的向量记录，层2 检索就是在这些切片上做余弦相似度 TopK。发现脏切片（错挂意图、文本错误）可直接删除。
        </div>
        <div className="ir-table-wrap">
          <table className="ir-table">
            <thead><tr><th>切片文本</th><th>意图</th><th>维度</th><th>构建模型</th><th>构建时间</th><th>操作</th></tr></thead>
            <tbody>
              {chunks.map(c => (
                <tr key={`${c.intent_id}:${c.example}`}>
                  <td className="ir-desc-cell"><ClampedText text={c.example} lines={1} threshold={60} /></td>
                  <td>{c.intent_name} <code className="ir-muted">{c.intent_code}</code></td>
                  <td>{c.dims}</td>
                  <td>{c.model_name ?? <span className="ir-muted">未知（旧数据）</span>}</td>
                  <td className="ir-muted">{c.created_at ? new Date(c.created_at).toLocaleString() : '-'}</td>
                  <td><button className="ir-link" onClick={() => deleteChunk(c)}>删除</button></td>
                </tr>
              ))}
              {chunks.length === 0 && (
                <tr><td colSpan={6} className="ir-muted">暂无切片，请在下方概览中重建向量</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {chunksTotal > size && (
          <div className="ir-toolbar" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
            <button className="ir-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
            <span className="ir-muted">{page} / {totalPages}</span>
            <button className="ir-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
          </div>
        )}
      </div>

      {/* ---------- 覆盖率概览 ---------- */}
      <div className="ir-card">
        <div className="ir-card-title">
          <span>覆盖率概览</span>
          <button className="ir-btn" onClick={loadOverview}>刷新</button>
        </div>
        <div className="ir-table-wrap">
          <table className="ir-table">
            <thead><tr><th>场景</th><th>意图数</th><th>示例数</th><th>切片数</th><th>意图覆盖</th><th>向量模型</th><th>最近重建</th><th>操作</th></tr></thead>
            <tbody>
              {overview.map(o => (
                <tr key={o.scenario_id}>
                  <td>{o.scenario_name}</td>
                  <td>{o.intents}</td>
                  <td>{o.examples}</td>
                  <td>{o.chunks}</td>
                  <td>{o.intents === 0 ? '-' : `${o.embedded_intents}/${o.intents}`}
                    {o.intents > 0 && o.embedded_intents < o.intents && <span className="ir-badge err">有缺口</span>}
                  </td>
                  <td>{o.models.length > 0 ? o.models.join('、') : <span className="ir-muted">未构建</span>}</td>
                  <td className="ir-muted">{o.last_built_at ? new Date(o.last_built_at).toLocaleString() : '-'}</td>
                  <td><button className="ir-link" onClick={() => { setRebuildFor(o); setRebuildModelId(models[0]?.id ?? '') }}>重建</button></td>
                </tr>
              ))}
              {overview.length === 0 && <tr><td colSpan={8} className="ir-muted">暂无场景</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {rebuildFor && (
        <Modal title={`重建向量：${rebuildFor.scenario_name}`} onClose={() => setRebuildFor(null)}
          footer={<>
            <button className="ir-btn" onClick={() => setRebuildFor(null)}>取消</button>
            <button className="ir-btn primary" disabled={!rebuildModelId} onClick={doRebuild}>开始重建</button>
          </>}>
          <Field label="选择向量模型" hint="重建会用该模型对该场景全部意图示例重新计算向量；维度变化时旧切片会被覆盖。">
            <select className="ir-select" value={rebuildModelId} onChange={e => setRebuildModelId(e.target.value)}>
              {models.length === 0 && <option value="">（请先在模型配置中添加向量模型）</option>}
              {models.map(m => <option key={m.id} value={m.id}>{m.name}（{m.model}）</option>)}
            </select>
          </Field>
        </Modal>
      )}
    </div>
  )
}
