/** 意图管理：场景列表 + 意图 CRUD + 规则配置 + Excel 导入导出 + 向量重建。 */
import { useEffect, useRef, useState } from 'react'
import { api, downloadExport, fileToBase64 } from './api.ts'
import { ClampedText, Field, Modal, fromList, toList } from './components.tsx'

interface Scenario {
  id: string
  name: string
  description: string
  rule_config: { greeting_keywords?: string[]; exit_keywords?: string[]; command_patterns?: string[] }
  intent_count: number
  embedding_count: number
}

interface IntentRoute {
  type: 'none' | 'workflow' | 'subagent' | 'service'
  target: string
  script?: string
}

interface Intent {
  id: string
  name: string
  code: string
  description: string
  examples: string[]
  keywords: string[]
  blacklist: string[]
  whitelist: string[]
  route: IntentRoute
}

interface ModelOpt { id: string; name: string }

const emptyIntent = {
  name: '', code: '', description: '', examples: '', keywords: '', blacklist: '', whitelist: '',
  route_type: 'none' as IntentRoute['type'], route_target: '', route_script: '',
}

const WORKFLOW_HELP = `工作流脚本模板使用说明
———————————————
脚本是一段普通 JavaScript（支持顶层 await），由 DSH 工作流引擎在意图命中时执行，最后的 return 值作为路由结果返回给主 Agent。

脚本内可用的全局变量：
• args.query        用户原始 query（字符串）
• args.intent       命中的意图 { code, name }
• args.confidence   置信度（0~1）
• args.matched_layer 命中层（l1/l3/l4/l5）
• args.slots        层5 抽取的槽位对象（无槽位时为 {}）
• args.context      对话上下文（字符串数组）
• agent(prompt, options?)  启动一个子 Agent，返回其结果（用于编排下游智能体）
• meta              本次运行的身份块（只读）

示例：根据槽位编排两个子代理并汇总
  const slots = args.slots
  const a = await agent(\`查询账户 \${slots.账户 ?? '默认账户'} 的余额\`)
  const b = await agent(\`查询账户 \${slots.账户 ?? '默认账户'} 的近期交易\`)
  return { balance: a, recent: b, intent: args.intent.code }

注意：脚本以 return 结束；不要在脚本里做无关副作用；运行失败会把错误信息返回给主 Agent。`

const ROUTE_TYPE_OPTIONS: Array<{ value: IntentRoute['type']; label: string; hint: string }> = [
  { value: 'none', label: '不路由', hint: '只返回识别结果，由主 Agent 自行处理' },
  { value: 'workflow', label: '工作流', hint: '命中后执行下方脚本模板（DSH workflow 引擎）' },
  { value: 'subagent', label: '子代理', hint: '命中后按 preset id 派发子代理（target 填 preset id）' },
  { value: 'service', label: '插件服务', hint: '调用其他插件的 Cordis 服务（target 填 服务名.方法名）' },
]

export function IntentsTab() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [intents, setIntents] = useState<Intent[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [scenarioForm, setScenarioForm] = useState<{ id?: string; name: string; description: string } | null>(null)
  const [intentForm, setIntentForm] = useState<(typeof emptyIntent & { id?: string }) | null>(null)
  const [ruleForm, setRuleForm] = useState<{ greeting: string; exit: string; command: string } | null>(null)
  const [rebuildOpen, setRebuildOpen] = useState(false)
  const [embModels, setEmbModels] = useState<ModelOpt[]>([])
  const [embModelId, setEmbModelId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const importMode = useRef<'merge' | 'replace'>('merge')

  const active = scenarios.find(s => s.id === activeId)

  const reloadScenarios = async () => {
    const d = await api.get<{ scenarios: Scenario[] }>('/scenarios')
    setScenarios(d.scenarios)
    if (!activeId && d.scenarios[0]) setActiveId(d.scenarios[0].id)
    if (activeId && !d.scenarios.some(s => s.id === activeId)) setActiveId(d.scenarios[0]?.id ?? '')
  }
  const reloadIntents = async (sid: string) => {
    const d = await api.get<{ intents: Intent[] }>(`/scenarios/${sid}/intents`)
    setIntents(d.intents)
  }

  useEffect(() => { reloadScenarios().catch(e => setError(e.message)) }, [])
  useEffect(() => { if (activeId) reloadIntents(activeId).catch(e => setError(e.message)) }, [activeId])

  const run = (fn: () => Promise<void>, okMsg?: string) => {
    setError(''); setNotice('')
    fn().then(() => { if (okMsg) setNotice(okMsg) }).catch(e => setError(e.message))
  }

  const saveScenario = () => run(async () => {
    if (!scenarioForm) return
    if (scenarioForm.id) await api.put(`/scenarios/${scenarioForm.id}`, scenarioForm)
    else await api.post('/scenarios', scenarioForm)
    setScenarioForm(null)
    await reloadScenarios()
  }, '场景已保存')

  const saveIntent = () => run(async () => {
    if (!intentForm || !activeId) return
    const payload = {
      name: intentForm.name, code: intentForm.code, description: intentForm.description,
      examples: toList(intentForm.examples), keywords: toList(intentForm.keywords),
      blacklist: toList(intentForm.blacklist), whitelist: toList(intentForm.whitelist),
      route: {
        type: intentForm.route_type,
        target: intentForm.route_target,
        ...(intentForm.route_type === 'workflow' ? { script: intentForm.route_script } : {}),
      },
    }
    if (intentForm.id) await api.put(`/intents/${intentForm.id}`, payload)
    else await api.post(`/scenarios/${activeId}/intents`, payload)
    setIntentForm(null)
    await reloadIntents(activeId)
    await reloadScenarios()
  }, '意图已保存')

  const saveRules = () => run(async () => {
    if (!ruleForm || !activeId) return
    await api.put(`/scenarios/${activeId}`, {
      rule_config: {
        greeting_keywords: toList(ruleForm.greeting),
        exit_keywords: toList(ruleForm.exit),
        command_patterns: toList(ruleForm.command),
      },
    })
    setRuleForm(null)
    await reloadScenarios()
  }, '规则配置已保存')

  const onImportFile = (file: File) => run(async () => {
    if (!activeId) return
    const b64 = await fileToBase64(file)
    const d = await api.post<{ imported: number }>(`/scenarios/${activeId}/intents/import`, {
      file_base64: b64, mode: importMode.current,
    })
    await reloadIntents(activeId)
    await reloadScenarios()
    setNotice(`已导入 ${d.imported} 条意图（${importMode.current === 'replace' ? '覆盖' : '合并'}模式）`)
  })

  const doRebuild = () => run(async () => {
    if (!activeId || !embModelId) return
    const d = await api.post<{ embedded: number }>(`/scenarios/${activeId}/embeddings/rebuild`, { model_id: embModelId })
    setRebuildOpen(false)
    await reloadScenarios()
    setNotice(`已重建 ${d.embedded} 条示例向量`)
  })

  return (
    <div className="ir-layout">
      <div className="ir-side">
        <div className="ir-toolbar">
          <strong style={{ fontSize: 14 }}>场景</strong>
          <button className="ir-btn" onClick={() => setScenarioForm({ name: '', description: '' })}>新建场景</button>
        </div>
        {scenarios.map(s => (
          <div key={s.id} className={`ir-card ${s.id === activeId ? 'selected' : ''}`} style={{ cursor: 'pointer' }}
            onClick={() => setActiveId(s.id)}>
            <div className="ir-card-title">
              <span>{s.name}</span>
              <span className="ir-row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                <button className="ir-btn" onClick={e => {
                  e.stopPropagation()
                  setScenarioForm({ id: s.id, name: s.name, description: s.description })
                }}>编辑</button>
                <button className="ir-btn danger" onClick={e => {
                  e.stopPropagation()
                  if (confirm(`删除场景「${s.name}」及其全部意图与服务？`)) {
                    run(async () => { await api.del(`/scenarios/${s.id}`); await reloadScenarios() })
                  }
                }}>删</button>
              </span>
            </div>
            <div className="ir-muted ir-card-desc">{s.description || '—'}</div>
            <div className="ir-muted">意图 {s.intent_count} · 向量 {s.embedding_count}</div>
          </div>
        ))}
        {scenarios.length === 0 && <div className="ir-muted">还没有场景，先新建一个。</div>}
      </div>

      <div className="ir-main">
        {error && <div className="ir-error">{error}</div>}
        {notice && <div className="ir-ok">{notice}</div>}
        {active && (
          <>
            <div className="ir-toolbar">
              <button className="ir-btn primary" onClick={() => setIntentForm({ ...emptyIntent })}>新建意图</button>
              <button className="ir-btn" onClick={() => downloadExport(active.id).catch(e => setError(e.message))}>导出 Excel</button>
              <select className="ir-select" defaultValue="merge" onChange={e => { importMode.current = e.target.value as 'merge' | 'replace' }}>
                <option value="merge">导入:合并</option>
                <option value="replace">导入:覆盖</option>
              </select>
              <button className="ir-btn" onClick={() => fileRef.current?.click()}>导入 Excel</button>
              <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = '' }} />
              <button className="ir-btn" onClick={() => {
                api.get<{ models: ModelOpt[] }>('/models?kind=embedding')
                  .then(d => { setEmbModels(d.models); setEmbModelId(d.models[0]?.id ?? ''); setRebuildOpen(true) })
                  .catch(e => setError(e.message))
              }}>重建向量</button>
              <button className="ir-btn" onClick={() => setRuleForm({
                greeting: fromList(active.rule_config?.greeting_keywords),
                exit: fromList(active.rule_config?.exit_keywords),
                command: fromList(active.rule_config?.command_patterns),
              })}>层1 规则配置</button>
            </div>
            <div className="ir-table-wrap">
            <table className="ir-table">
              <thead><tr><th>名称</th><th>编码</th><th>描述</th><th>示例</th><th>关键词</th><th>路由目标</th><th></th></tr></thead>
              <tbody>
                {intents.map(i => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td><code>{i.code}</code></td>
                    <td className="ir-muted ir-desc-cell"><ClampedText text={i.description} /></td>
                    <td>{i.examples.length} 条</td>
                    <td>{fromList(i.keywords)}</td>
                    <td className="ir-muted">{i.route?.type === 'none' || !i.route ? '—' : `${i.route.type}${i.route.target ? `: ${i.route.target}` : ''}`}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="ir-btn" onClick={() => setIntentForm({
                        id: i.id, name: i.name, code: i.code, description: i.description,
                        examples: i.examples.join('\n'), keywords: fromList(i.keywords),
                        blacklist: fromList(i.blacklist), whitelist: fromList(i.whitelist),
                        route_type: i.route?.type ?? 'none', route_target: i.route?.target ?? '', route_script: i.route?.script ?? '',
                      })}>编辑</button>{' '}
                      <button className="ir-btn danger" onClick={() => {
                        if (confirm(`删除意图「${i.name}」？`)) {
                          run(async () => { await api.del(`/intents/${i.id}`); await reloadIntents(active.id); await reloadScenarios() })
                        }
                      }}>删</button>
                    </td>
                  </tr>
                ))}
                {intents.length === 0 && <tr><td colSpan={7} className="ir-muted">该场景暂无意图，可新建或从 Excel 导入。</td></tr>}
              </tbody>
            </table>
            </div>
          </>
        )}
        {!active && <div className="ir-muted">请选择左侧场景。</div>}

        {scenarioForm && (
          <Modal title={scenarioForm.id ? '编辑场景' : '新建场景'} onClose={() => setScenarioForm(null)}
            footer={<>
              <button className="ir-btn" onClick={() => setScenarioForm(null)}>取消</button>
              <button className="ir-btn primary" onClick={saveScenario}>保存</button>
            </>}>
            <Field label="场景名称"><input className="ir-input" value={scenarioForm.name}
              onChange={e => setScenarioForm({ ...scenarioForm, name: e.target.value })} /></Field>
            <Field label="场景描述"><textarea className="ir-textarea" value={scenarioForm.description}
              onChange={e => setScenarioForm({ ...scenarioForm, description: e.target.value })} /></Field>
          </Modal>
        )}

        {intentForm && (
          <Modal title={intentForm.id ? '编辑意图' : '新建意图'} onClose={() => setIntentForm(null)}
            footer={<>
              <button className="ir-btn" onClick={() => setIntentForm(null)}>取消</button>
              <button className="ir-btn primary" onClick={saveIntent}>保存</button>
            </>}>
            <div className="ir-grid2">
              <Field label="意图名称"><input className="ir-input" value={intentForm.name}
                onChange={e => setIntentForm({ ...intentForm, name: e.target.value })} /></Field>
              <Field label="意图编码" hint="英文标识，模型输出与 API 结果使用"><input className="ir-input" value={intentForm.code}
                onChange={e => setIntentForm({ ...intentForm, code: e.target.value })} /></Field>
            </div>
            <Field label="意图描述"><textarea className="ir-textarea" value={intentForm.description}
              onChange={e => setIntentForm({ ...intentForm, description: e.target.value })} /></Field>
            <Field label="示例（每行一条，用于层2向量检索与层5提示词）">
              <textarea className="ir-textarea" value={intentForm.examples}
                onChange={e => setIntentForm({ ...intentForm, examples: e.target.value })} /></Field>
            <div className="ir-grid2">
              <Field label="层1 关键词（、分隔，词边界强匹配）"><input className="ir-input" value={intentForm.keywords}
                onChange={e => setIntentForm({ ...intentForm, keywords: e.target.value })} /></Field>
              <Field label="黑名单（命中即排除，、分隔）"><input className="ir-input" value={intentForm.blacklist}
                onChange={e => setIntentForm({ ...intentForm, blacklist: e.target.value })} /></Field>
              <Field label="白名单（非空时必须命中其一，、分隔）"><input className="ir-input" value={intentForm.whitelist}
                onChange={e => setIntentForm({ ...intentForm, whitelist: e.target.value })} /></Field>
              <Field label="路由类型" hint={ROUTE_TYPE_OPTIONS.find(o => o.value === intentForm.route_type)?.hint}>
                <select className="ir-select" value={intentForm.route_type}
                  onChange={e => setIntentForm({ ...intentForm, route_type: e.target.value as IntentRoute['type'] })}>
                  {ROUTE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
            {intentForm.route_type !== 'none' && (
              <Field
                label={intentForm.route_type === 'workflow' ? '路由目标（工作流运行名，可选）' : intentForm.route_type === 'subagent' ? '路由目标（agent preset id）' : '路由目标（Cordis 服务名.方法名）'}
                hint={intentForm.route_type === 'subagent' ? '下游智能体以 @deepseek-ai/dsh-agent-preset 插件行形式接入 DSH；这里填它的 preset id' : intentForm.route_type === 'service' ? '例如 orderService.createOrder；该服务由其他 DSH 插件提供' : undefined}>
                <input className="ir-input" value={intentForm.route_target}
                  onChange={e => setIntentForm({ ...intentForm, route_target: e.target.value })} />
              </Field>
            )}
            {intentForm.route_type === 'workflow' && (
              <>
                <Field label="工作流脚本模板">
                  <textarea className="ir-textarea" style={{ minHeight: 140, fontFamily: 'monospace' }}
                    value={intentForm.route_script}
                    onChange={e => setIntentForm({ ...intentForm, route_script: e.target.value })}
                    placeholder={'const slots = args.slots\nconst r = await agent(`处理 ${args.query}`)\nreturn { result: r }'} /></Field>
                <details style={{ marginBottom: 10 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--dsw-color-primary, #4d6bfe)' }}>📖 脚本模板使用说明（args 契约 + 示例，点击展开）</summary>
                  <pre className="ir-pre" style={{ marginTop: 8 }}>{WORKFLOW_HELP}</pre>
                </details>
              </>
            )}
          </Modal>
        )}

        {ruleForm && (
          <Modal title="层1 规则配置（问候 / 退出 / 指令）" onClose={() => setRuleForm(null)}
            footer={<>
              <button className="ir-btn" onClick={() => setRuleForm(null)}>取消</button>
              <button className="ir-btn primary" onClick={saveRules}>保存</button>
            </>}>
            <Field label="问候关键词（、分隔）"><input className="ir-input" value={ruleForm.greeting}
              onChange={e => setRuleForm({ ...ruleForm, greeting: e.target.value })} placeholder="你好、您好、hi、hello" /></Field>
            <Field label="退出关键词（、分隔）"><input className="ir-input" value={ruleForm.exit}
              onChange={e => setRuleForm({ ...ruleForm, exit: e.target.value })} placeholder="退出、再见、拜拜" /></Field>
            <Field label="指令正则（每行一条）"><textarea className="ir-textarea" value={ruleForm.command}
              onChange={e => setRuleForm({ ...ruleForm, command: e.target.value })} placeholder={'^/(help|reset)\\b'} /></Field>
          </Modal>
        )}

        {rebuildOpen && (
          <Modal title="重建场景向量（层2）" onClose={() => setRebuildOpen(false)}
            footer={<>
              <button className="ir-btn" onClick={() => setRebuildOpen(false)}>取消</button>
              <button className="ir-btn primary" disabled={!embModelId} onClick={doRebuild}>开始重建</button>
            </>}>
            <Field label="选择向量模型" hint="先在「模型配置」页添加 embedding 模型；重建会对所有意图示例重新计算向量并写入 pgvector。">
              <select className="ir-select" value={embModelId} onChange={e => setEmbModelId(e.target.value)}>
                {embModels.length === 0 && <option value="">（无可用向量模型）</option>}
                {embModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          </Modal>
        )}
      </div>
    </div>
  )
}
