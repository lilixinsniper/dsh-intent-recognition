/** 服务管理：按场景创建 API 服务，每层可开关，服务可运行/停止/删除/复制，附测试台。 */
import { useEffect, useState } from 'react'
import { api } from './api.ts'
import { ClampedText, Field, Modal } from './components.tsx'

interface ScenarioOpt { id: string; name: string }
interface ModelOpt { id: string; name: string; kind: string }

interface LayerCfg { enabled: boolean; [k: string]: unknown }
interface Layers { l1: LayerCfg; l2: LayerCfg; l3: LayerCfg; l4: LayerCfg; l5: LayerCfg }

interface Service {
  id: string
  name: string
  description: string
  scenario_id: string
  scenario_name?: string
  layers: Layers
  models: { embedding: string | null; jev: string | null; finetune: string | null; llm: string | null }
  status: 'running' | 'stopped'
  route_mode: 'auto' | 'suggest'
  api_key: string
  tool_name?: string
  tool?: { registered: boolean; error?: string }
}

interface PredictResult {
  intent: { code: string; name: string; route_target?: string } | null
  confidence: number
  matched_layer: string | null
  intents?: Array<{ code: string; name: string; confidence: number }>
  slots?: Record<string, unknown>
  need_clarification?: boolean
  route?: { type: string; target: string }
  route_result?: { type: string; target: string; ok: boolean; value?: unknown; error?: string }
  trace: Array<{ layer: string; enabled: boolean; hit: boolean; detail: Record<string, unknown>; latency_ms: number }>
  latency_ms: number
}

const LAYER_META: Array<{
  key: keyof Layers
  name: string
  params: Array<{ k: string; label: string }>
  selects?: Array<{ k: string; label: string; options: Array<{ v: string; label: string }> }>
  hint?: string
}> = [
  {
    key: 'l1', name: '层1 规则硬过滤',
    params: [{ k: 'confidence', label: '置信度' }],
    hint: '关键词/黑白名单规则直接命中且规则置信度 ≥ 该值时直接路由，不再走后续层。',
  },
  {
    key: 'l2', name: '层2 向量检索',
    params: [{ k: 'topK', label: 'TopK' }, { k: 'minScore', label: '置信度阈值（最低相似度）' }],
    hint: '召回切片分数低于「置信度阈值」不进入候选；TopK 限制最多保留的候选意图数。层2 只压缩候选，不直接命中。',
  },
  {
    key: 'l3', name: '层3 Jev 概率精判',
    params: [{ k: 'high', label: '高置信阈值' }, { k: 'mid', label: '中置信阈值' }],
    selects: [{
      k: 'mode', label: '判定方式',
      options: [
        { v: 'score', label: 'score（评分）' },
        { v: 'choice', label: 'choice（单选）' },
        { v: 'noul', label: 'noul（是非）' },
      ],
    }],
    hint: 'Jev 对每个候选意图评分：最高分 ≥ 高置信阈值 → 直接命中（跳过层4/层5）；位于 [中, 高) 区间 → 压缩候选交层4 仲裁；低于中置信阈值 → 交层5 兜底。判定方式对应 Jev 扩展配置 modes.<方式> 的问题集（noul 仅二分类场景生成）。',
  },
  {
    key: 'l4', name: '层4 轻量微调',
    params: [{ k: 'threshold', label: '阈值' }],
    hint: '微调模型对层3 压缩后的候选做仲裁，置信度 ≥ 阈值时命中，否则交层5。',
  },
  { key: 'l5', name: '层5 LLM 结构化兜底', params: [] },
]

const MODEL_SLOTS: Array<{ key: 'embedding' | 'jev' | 'finetune' | 'llm'; label: string }> = [
  { key: 'embedding', label: '向量模型（层2）' },
  { key: 'jev', label: 'Jev 模型（层3）' },
  { key: 'finetune', label: '微调模型（层4）' },
  { key: 'llm', label: 'LLM（层5）' },
]

const defaultLayers = (): Layers => ({
  l1: { enabled: true, confidence: 0.99 },
  l2: { enabled: true, topK: 8, minScore: 0.5 },
  l3: { enabled: true, high: 0.85, mid: 0.5, mode: 'score' },
  l4: { enabled: true, threshold: 0.7 },
  l5: { enabled: true },
})

export function ServicesTab() {
  const [services, setServices] = useState<Service[]>([])
  const [scenarios, setScenarios] = useState<ScenarioOpt[]>([])
  const [models, setModels] = useState<ModelOpt[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<{
    id?: string; name: string; description: string; scenario_id: string
    layers: Layers; models: Service['models']; route_mode: 'auto' | 'suggest'
  } | null>(null)
  const [testSvc, setTestSvc] = useState<Service | null>(null)
  const [testQuery, setTestQuery] = useState('')
  const [testContext, setTestContext] = useState('')
  const [testResult, setTestResult] = useState<PredictResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [logs, setLogs] = useState<{ svc: Service; rows: Array<Record<string, unknown>> } | null>(null)
  const [revealKey, setRevealKey] = useState<string>('')

  const reload = async () => {
    const [s, sc, m] = await Promise.all([
      api.get<{ services: Service[] }>('/services'),
      api.get<{ scenarios: ScenarioOpt[] }>('/scenarios'),
      api.get<{ models: ModelOpt[] }>('/models'),
    ])
    setServices(s.services)
    setScenarios(sc.scenarios)
    setModels(m.models)
  }
  useEffect(() => { reload().catch(e => setError(e.message)) }, [])

  const run = (fn: () => Promise<void>, okMsg?: string) => {
    setError(''); setNotice('')
    fn().then(() => { if (okMsg) setNotice(okMsg) }).catch(e => setError(e.message))
  }

  const openCreate = () => setForm({
    name: '', description: '', scenario_id: scenarios[0]?.id ?? '',
    layers: defaultLayers(),
    models: { embedding: null, jev: null, finetune: null, llm: null },
    route_mode: 'auto',
  })

  const save = () => run(async () => {
    if (!form) return
    if (form.id) await api.put(`/services/${form.id}`, form)
    else await api.post('/services', form)
    setForm(null)
    await reload()
  }, '服务已保存')

  const modelsOf = (kind: string) => models.filter(m => m.kind === kind)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="ir-toolbar">
        <button className="ir-btn primary" onClick={openCreate} disabled={scenarios.length === 0}>创建服务</button>
        {scenarios.length === 0 && <span className="ir-muted">请先在「意图管理」创建场景</span>}
      </div>
      {error && <div className="ir-error">{error}</div>}
      {notice && <div className="ir-ok">{notice}</div>}

      {services.map(s => (
        <div key={s.id} className="ir-card">
          <div className="ir-card-title">
            <span>{s.name} <span className="ir-muted">· {s.scenario_name}</span></span>
            <span>
              <span className="ir-badge on" style={{ marginRight: 6 }}>{s.route_mode === 'suggest' ? '仅建议' : '自动路由'}</span>
              {s.status === 'running' && s.tool && (
                <span
                  className={`ir-badge ${s.tool.registered ? 'on' : 'err'}`}
                  style={{ marginRight: 6 }}
                  title={s.tool.registered ? `对话工具 ${s.tool_name} 已就绪` : s.tool.error ?? '工具注册失败'}
                >
                  {s.tool.registered ? '对话工具已注册' : '对话工具未注册'}
                </span>
              )}
              <span className={`ir-badge ${s.status}`}>{s.status === 'running' ? '运行中' : '已停止'}</span>
            </span>
          </div>
          <div className="ir-muted" style={{ margin: '6px 0' }}><ClampedText text={s.description} /></div>
          {s.status === 'running' && s.tool && !s.tool.registered && (
            <div className="ir-error" style={{ margin: '4px 0' }}>
              对话工具注册失败{s.tool.error ? `：${s.tool.error}` : ''}——主 Agent 将无法在对话中调用本服务，请查看宿主日志或重启插件。
            </div>
          )}
          <div className="ir-row" style={{ fontSize: 12 }}>
            {LAYER_META.map(l => (
              <span key={l.key} className={`ir-badge ${s.layers[l.key]?.enabled ? 'on' : 'off'}`}>{l.name.split(' ')[0]}</span>
            ))}
          </div>
          <div className="ir-row" style={{ margin: '8px 0', fontSize: 12 }}>
            <span className="ir-muted">API Key:</span>
            <code>{revealKey === s.id ? s.api_key : s.api_key.slice(0, 7) + '••••••••'}</code>
            <button className="ir-btn" onClick={() => setRevealKey(revealKey === s.id ? '' : s.id)}>
              {revealKey === s.id ? '隐藏' : '显示'}
            </button>
            <button className="ir-btn" onClick={() => { navigator.clipboard?.writeText(s.api_key) }}>复制</button>
          </div>
          {s.status === 'running' && s.tool?.registered && (
            <div className="ir-muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
              对话使用：在任意会话中提出该场景的问题，主 Agent 会自动调用工具 <code>{s.tool_name}</code>；也可以直接对它说「用 {s.tool_name} 判断一下：……」。
            </div>
          )}
          <div className="ir-toolbar">
            {s.status === 'stopped'
              ? <button className="ir-btn primary" onClick={() => run(async () => { await api.post(`/services/${s.id}/start`); await reload() }, '服务已启动')}>运行</button>
              : <button className="ir-btn" onClick={() => run(async () => { await api.post(`/services/${s.id}/stop`); await reload() }, '服务已停止')}>停止</button>}
            <button className="ir-btn" onClick={() => { setTestSvc(s); setTestResult(null); setTestQuery(''); setTestContext('') }}>测试</button>
            <button className="ir-btn" disabled={s.status === 'running'} onClick={() => setForm({
              id: s.id, name: s.name, description: s.description, scenario_id: s.scenario_id,
              layers: { ...defaultLayers(), ...s.layers }, models: { ...s.models },
              route_mode: s.route_mode ?? 'auto',
            })}>编辑</button>
            <button className="ir-btn" onClick={() => run(async () => { await api.post(`/services/${s.id}/copy`); await reload() }, '已复制服务')}>复制</button>
            <button className="ir-btn" onClick={() => run(async () => {
              const d = await api.get<{ logs: Array<Record<string, unknown>> }>(`/services/${s.id}/logs`)
              setLogs({ svc: s, rows: d.logs })
            })}>日志</button>
            <button className="ir-btn danger" disabled={s.status === 'running'} onClick={() => {
              if (confirm(`删除服务「${s.name}」？`)) run(async () => { await api.del(`/services/${s.id}`); await reload() })
            }}>删除</button>
          </div>
        </div>
      ))}
      {services.length === 0 && <div className="ir-muted">还没有服务。创建服务后即可通过 API 或 Agent 工具调用。</div>}

      {form && (
        <Modal title={form.id ? '编辑服务' : '创建服务'} onClose={() => setForm(null)}
          footer={<>
            <button className="ir-btn" onClick={() => setForm(null)}>取消</button>
            <button className="ir-btn primary" onClick={save}>保存</button>
          </>}>
          <div className="ir-grid2">
            <Field label="服务名称"><input className="ir-input" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="场景">
              <select className="ir-select" value={form.scenario_id}
                onChange={e => setForm({ ...form, scenario_id: e.target.value })}>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="服务描述"><input className="ir-input" value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="流水线层配置（关闭的层会被跳过）">
            <div className="ir-layers">
              {LAYER_META.map(l => {
                const cfg = form.layers[l.key]
                return (
                  <div key={l.key} className="ir-layer">
                    <span className="name">{l.name}</span>
                    <label className="ir-row" style={{ gap: 4, fontSize: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={cfg.enabled}
                        onChange={e => setForm({ ...form, layers: { ...form.layers, [l.key]: { ...cfg, enabled: e.target.checked } } })} />
                      启用
                    </label>
                    <div className="params">
                      {l.params.map(p => (
                        <label key={p.k}>{p.label}
                          <input type="number" step="any" value={String(cfg[p.k] ?? '')} disabled={!cfg.enabled}
                            onChange={e => setForm({
                              ...form,
                              layers: { ...form.layers, [l.key]: { ...cfg, [p.k]: Number(e.target.value) } },
                            })} />
                        </label>
                      ))}
                      {l.hint && cfg.enabled && (
                        <div className="ir-muted" style={{ flexBasis: '100%', fontSize: 12, lineHeight: 1.6 }}>{l.hint}</div>
                      )}
                      {l.selects?.map(sel => (
                        <label key={sel.k}>{sel.label}
                          <select className="ir-select" style={{ minWidth: 130 }}
                            value={String(cfg[sel.k] ?? sel.options[0].v)} disabled={!cfg.enabled}
                            title={l.key === 'l3' ? 'Jev 扩展配置需包含对应问题集（modes.<方式>）；「AI/规则 自动生成」会一次生成全部三种' : undefined}
                            onChange={e => setForm({
                              ...form,
                              layers: { ...form.layers, [l.key]: { ...cfg, [sel.k]: e.target.value } },
                            })}>
                            {sel.options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Field>
          <div className="ir-grid2">
            <Field label="路由模式" hint="auto：L1/L3/L4 高置信命中时由工具直接执行路由（确定性）；L5 命中只返回建议。suggest：永不自动执行，全部交给主 Agent 决策。">
              <select className="ir-select" value={form.route_mode}
                onChange={e => setForm({ ...form, route_mode: e.target.value as 'auto' | 'suggest' })}>
                <option value="auto">auto（自动执行路由）</option>
                <option value="suggest">suggest（仅建议）</option>
              </select>
            </Field>
            {MODEL_SLOTS.map(slot => (
              <Field key={slot.key} label={slot.label}>
                <select className="ir-select" value={form.models[slot.key] ?? ''}
                  onChange={e => setForm({ ...form, models: { ...form.models, [slot.key]: e.target.value || null } })}>
                  <option value="">（未配置）</option>
                  {modelsOf(slot.key).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            ))}
          </div>
        </Modal>
      )}

      {testSvc && (
        <Modal title={`测试服务：${testSvc.name}`} onClose={() => setTestSvc(null)}
          footer={<button className="ir-btn" onClick={() => setTestSvc(null)}>关闭</button>}>
          <Field label="Query"><input className="ir-input" value={testQuery} onChange={e => setTestQuery(e.target.value)}
            placeholder="输入一句用户 query" /></Field>
          <Field label="对话上下文（每行一轮，可选，供层5 使用）">
            <textarea className="ir-textarea" value={testContext} onChange={e => setTestContext(e.target.value)} /></Field>
          <div className="ir-toolbar">
            <button className="ir-btn primary" disabled={testing || !testQuery.trim()} onClick={() => {
              setTesting(true)
              setTestResult(null)
              run(async () => {
                try {
                  const d = await api.post<PredictResult>(`/services/${testSvc.id}/predict`, {
                    query: testQuery,
                    context: testContext.split('\n').map(x => x.trim()).filter(Boolean),
                  })
                  setTestResult(d)
                } finally {
                  setTesting(false)
                }
              })
            }}>
              {testing ? <><span className="ir-spinner" />识别中…</> : '执行识别'}
            </button>
            {testing && <span className="ir-muted">正在跑五层流水线，模型调用可能需要几秒，请稍候…</span>}
          </div>
          {testResult && (
            <>
              <div className="ir-trace">
                {testResult.trace.map(t => (
                  <span key={t.layer} className={`ir-badge ${t.hit ? 'on' : t.detail.error ? 'err' : t.enabled ? 'off' : 'off'}`}
                    title={JSON.stringify(t.detail)}>
                    {t.layer}{t.hit ? ' ✓' : ''} {t.latency_ms}ms
                  </span>
                ))}
                <span className="ir-muted">总耗时 {testResult.latency_ms}ms</span>
              </div>
              <div style={{ fontSize: 14, margin: '6px 0' }}>
                {testResult.intent
                  ? <>命中：<strong>{testResult.intent.name}</strong>（<code>{testResult.intent.code}</code>，置信度 {testResult.confidence.toFixed(3)}，层 {testResult.matched_layer}）</>
                  : <span className="ir-muted">未命中任何意图{testResult.need_clarification ? '，建议澄清' : ''}</span>}
              </div>
              {testResult.route && (
                <div style={{ fontSize: 13, margin: '4px 0' }}>
                  路由：<code>{testResult.route.type}{testResult.route.target ? `:${testResult.route.target}` : ''}</code>
                  {testResult.route_result && (
                    <span className={testResult.route_result.ok ? 'ir-ok' : 'ir-error'}>
                      {' '}{testResult.route_result.ok ? '已执行 ✓' : `执行失败：${testResult.route_result.error}`}
                    </span>
                  )}
                  {!testResult.route_result && <span className="ir-muted">（未自动执行，作为建议返回）</span>}
                </div>
              )}
              <pre className="ir-pre">{JSON.stringify(testResult, null, 2)}</pre>
            </>
          )}
        </Modal>
      )}

      {logs && (
        <Modal title={`调用日志：${logs.svc.name}`} onClose={() => setLogs(null)}
          footer={<button className="ir-btn" onClick={() => setLogs(null)}>关闭</button>}>
          {logs.rows.length === 0 && <div className="ir-muted">暂无调用记录</div>}
          <table className="ir-table">
            <thead><tr><th>时间</th><th>Query</th><th>命中层</th><th>意图</th><th>耗时</th></tr></thead>
            <tbody>
              {logs.rows.map(row => {
                const result = row.result as { intent?: { name?: string } | null }
                return (
                  <tr key={String(row.id)}>
                    <td className="ir-muted">{String(row.created_at).slice(0, 19).replace('T', ' ')}</td>
                    <td>{String(row.query)}</td>
                    <td>{String(row.matched_layer ?? '—')}</td>
                    <td>{result.intent?.name ?? '—'}</td>
                    <td>{String(row.latency_ms)}ms</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  )
}
