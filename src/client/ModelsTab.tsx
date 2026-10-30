/** 模型配置：向量 / Jev / 微调 / LLM 四类模型的可页面化管理。 */
import { useEffect, useState } from 'react'
import { api } from './api.ts'
import { Field, Modal } from './components.tsx'

interface Model {
  id: string
  kind: 'embedding' | 'jev' | 'finetune' | 'llm'
  name: string
  base_url: string
  api_key: string
  model: string
  api_style: 'openai' | 'http'
  extra: Record<string, unknown>
}

const KINDS: Array<{ key: Model['kind']; label: string; hint: string }> = [
  { key: 'embedding', label: '向量模型', hint: '层2 使用；OpenAI 兼容 /v1/embeddings 或 http JSON 接口' },
  { key: 'jev', label: 'Jev 概率分类模型', hint: '层3 使用；输出各候选意图的概率' },
  { key: 'finetune', label: '轻量微调模型', hint: '层4 使用；BERT 或小参数 LLM，处理边界 case' },
  { key: 'llm', label: 'LLM', hint: '层5 使用；结构化输出兜底，支持多意图与槽位抽取' },
]

const emptyForm = { name: '', kind: 'embedding' as Model['kind'], base_url: '', api_key: '', model: '', api_style: 'openai' as 'openai' | 'http', extra: '' }

export function ModelsTab() {
  const [models, setModels] = useState<Model[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<(typeof emptyForm & { id?: string }) | null>(null)
  const [testing, setTesting] = useState<string>('')
  const [draftScenarios, setDraftScenarios] = useState<Array<{ id: string; name: string }>>([])
  const [draftScenarioId, setDraftScenarioId] = useState('')
  const [drafting, setDrafting] = useState<false | 'llm' | 'rule'>(false)

  const reload = async () => {
    const d = await api.get<{ models: Model[] }>('/models')
    setModels(d.models)
  }
  useEffect(() => { reload().catch(e => setError(e.message)) }, [])
  // Jev dialog: load scenarios for the draft generator.
  useEffect(() => {
    if (form?.kind === 'jev' && draftScenarios.length === 0) loadDraftScenarios()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.kind])

  /** Load scenarios once per dialog open (for the Jev draft generator). */
  const loadDraftScenarios = () => {
    api.get<{ scenarios: Array<{ id: string; name: string }> }>('/scenarios')
      .then(d => { setDraftScenarios(d.scenarios); setDraftScenarioId(d.scenarios[0]?.id ?? '') })
      .catch(e => setError(e.message))
  }

  const run = (fn: () => Promise<void>, okMsg?: string) => {
    setError(''); setNotice('')
    fn().then(() => { if (okMsg) setNotice(okMsg) }).catch(e => setError(e.message))
  }

  const generateJevDraft = (source: 'llm' | 'rule') => run(async () => {
    if (!form || !draftScenarioId) throw new Error('请先选择场景')
    setDrafting(source)
    try {
      const d = await api.post<{ extra: Record<string, unknown>; source: string; note: string }>(
        '/jev/draft-config',
        { scenario_id: draftScenarioId, model: form.model.trim() || undefined, source },
      )
      setForm({ ...form, extra: JSON.stringify(d.extra, null, 2) })
      setNotice(d.note)
    } finally {
      setDrafting(false)
    }
  })

  const save = () => run(async () => {
    if (!form) return
    let extra: Record<string, unknown> = {}
    if (form.extra.trim() !== '') {
      try { extra = JSON.parse(form.extra) } catch { throw new Error('扩展配置不是合法 JSON') }
    }
    const payload = { name: form.name, kind: form.kind, base_url: form.base_url, api_key: form.api_key, model: form.model, api_style: form.api_style, extra }
    if (form.id) await api.put(`/models/${form.id}`, payload)
    else await api.post('/models', payload)
    setForm(null)
    await reload()
  }, '模型已保存')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="ir-toolbar">
        <button className="ir-btn primary" onClick={() => setForm({ ...emptyForm })}>添加模型</button>
      </div>
      {error && <div className="ir-error">{error}</div>}
      {notice && <div className="ir-ok">{notice}</div>}

      {KINDS.map(k => {
        const rows = models.filter(m => m.kind === k.key)
        return (
          <div key={k.key} className="ir-card">
            <div className="ir-card-title"><span>{k.label}</span><span className="ir-muted">{k.hint}</span></div>
            <div className="ir-table-wrap">
            <table className="ir-table">
              <thead><tr><th>名称</th><th>模型</th><th>Base URL</th><th>接口样式</th><th></th></tr></thead>
              <tbody>
                {rows.map(m => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td><code>{m.model}</code></td>
                    <td className="ir-muted">{m.base_url}</td>
                    <td>{m.api_style}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="ir-btn" disabled={testing === m.id} onClick={() => {
                        setTesting(m.id); setError(''); setNotice('')
                        api.post<{ latency_ms: number; dimension?: number }>(`/models/${m.id}/test`)
                          .then(d => setNotice(`「${m.name}」连通正常（${d.latency_ms}ms${d.dimension ? `，维度 ${d.dimension}` : ''}）`))
                          .catch(e => setError(`「${m.name}」测试失败：${e.message}`))
                          .finally(() => setTesting(''))
                      }}>{testing === m.id ? '测试中…' : '测试'}</button>{' '}
                      <button className="ir-btn" onClick={() => setForm({
                        id: m.id, name: m.name, kind: m.kind, base_url: m.base_url, api_key: m.api_key,
                        model: m.model, api_style: m.api_style, extra: JSON.stringify(m.extra ?? {}, null, 2),
                      })}>编辑</button>{' '}
                      <button className="ir-btn danger" onClick={() => {
                        if (confirm(`删除模型「${m.name}」？引用它的服务将失去该层能力。`)) {
                          run(async () => { await api.del(`/models/${m.id}`); await reload() })
                        }
                      }}>删</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="ir-muted">未配置</td></tr>}
              </tbody>
            </table>
            </div>
          </div>
        )
      })}

      {form && (
        <Modal title={form.id ? '编辑模型' : '添加模型'} onClose={() => setForm(null)}
          footer={<>
            <button className="ir-btn" onClick={() => setForm(null)}>取消</button>
            <button className="ir-btn primary" onClick={save}>保存</button>
          </>}>
          <div className="ir-grid2">
            <Field label="名称"><input className="ir-input" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="类型">
              <select className="ir-select" value={form.kind} disabled={Boolean(form.id)}
                onChange={e => setForm({ ...form, kind: e.target.value as Model['kind'] })}>
                {KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </Field>
            <Field label="接口样式" hint="openai = OpenAI 兼容接口；http = 自定义 JSON 分类接口（jev/微调常用）">
              <select className="ir-select" value={form.api_style}
                onChange={e => setForm({ ...form, api_style: e.target.value as 'openai' | 'http' })}>
                <option value="openai">openai</option>
                <option value="http">http</option>
              </select>
            </Field>
            <Field label="模型名"><input className="ir-input" value={form.model}
              onChange={e => setForm({ ...form, model: e.target.value })} placeholder="如 bge-m3 / jev-cls-v1 / bert-ft / deepseek-chat" /></Field>
          </div>
          <Field label="Base URL" hint="openai 样式填服务根地址（自动拼 /v1/embeddings、/v1/chat/completions）；http 样式填完整分类接口地址">
            <input className="ir-input" value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })}
              placeholder="https://api.example.com" /></Field>
          <Field label="API Key" hint={form.id ? '显示 *** 表示已保存，重新输入才会覆盖' : '可留空'}>
            <input className="ir-input" type="password" value={form.api_key}
              onChange={e => setForm({ ...form, api_key: e.target.value })} /></Field>
          {form.kind === 'jev' && (
            <div className="ir-card" style={{ marginBottom: 10, background: 'var(--dsw-color-bg-spotlight, #f7f8fa)' }}>
              <div className="ir-card-title" style={{ fontSize: 13 }}>
                <span>扩展配置自动生成（systemone questions）</span>
              </div>
              <div className="ir-muted" style={{ margin: '6px 0' }}>
                根据所选场景的意图（编码/名称/描述全文）自动填充下方扩展配置：<b>一次生成 score / choice / noul 三种判定方式</b>（modes.score / modes.choice / modes.noul），每种方式只有一个名为 intent_recognition 的问题，服务编辑页的层3「判定方式」下拉决定运行时启用哪一种：
                score 的 criteria 为各意图判定描述数组（与 intent_order 一一对应），要求模型按序输出 0~1 分；
                choice 的 criteria 为「意图名 → 判定描述」对象，要求模型只回答一个意图名；
                noul 为是/否二分类，<b>仅当场景恰好 2 个意图时生成</b>（map 把"是"/"否"映射到意图编码）。
                <b>AI 生成</b>调用已配置的 LLM（语义更准，需先在模型配置中添加 LLM）；<b>规则模板生成</b>不依赖 LLM，直接把每个意图的定义/归入信号/排除规则全文嵌入判定指令。生成后请<b>审核修改再保存</b>；保存后层3 将按 systemone 报文（model/state/questions）调用本接口。
              </div>
              <div className="ir-toolbar">
                <select className="ir-select" value={draftScenarioId} onChange={e => setDraftScenarioId(e.target.value)}>
                  {draftScenarios.length === 0 && <option value="">（无场景，请先创建意图）</option>}
                  {draftScenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="ir-btn primary" disabled={drafting !== false || !draftScenarioId} onClick={() => generateJevDraft('llm')}>
                  {drafting === 'llm' ? 'AI 生成中…' : 'AI 自动生成扩展配置'}
                </button>
                <button className="ir-btn" disabled={drafting !== false || !draftScenarioId} onClick={() => generateJevDraft('rule')}>
                  {drafting === 'rule' ? '生成中…' : '规则模板生成'}
                </button>
              </div>
            </div>
          )}
          <Field label="扩展配置（JSON，可选）" hint="如 {&quot;timeout_ms&quot;: 30000, &quot;temperature&quot;: 0, &quot;headers&quot;: {}, &quot;embeddings_path&quot;: &quot;/v1/embeddings&quot;, &quot;prompt&quot;: &quot;自定义层5系统提示词&quot;}；jev http 接口含 questions 对象时按 systemone 报文调用">
            <textarea className="ir-textarea" style={{ minHeight: form.kind === 'jev' ? 220 : undefined }} value={form.extra}
              onChange={e => setForm({ ...form, extra: e.target.value })} /></Field>
        </Modal>
      )}
    </div>
  )
}
