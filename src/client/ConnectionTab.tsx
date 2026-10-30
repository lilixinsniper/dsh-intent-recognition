/** 数据库：页面化 PostgreSQL 配置。测试 → 保存 → 热切换，全程无需重启插件。 */
import { useEffect, useState } from 'react'
import { api } from './api.ts'
import { Field, Modal, Toggle } from './components.tsx'

interface ConnectionState {
  configured: boolean
  connected: boolean
  source: 'page' | 'bundle'
  databaseUrl: string
  fields: { host: string; port: number; database: string; user: string; password: string; ssl: boolean }
  error?: string
  filePath: string
}

interface FormFields {
  host: string
  port: string
  database: string
  user: string
  password: string
  ssl: boolean
}

const emptyForm: FormFields = { host: '127.0.0.1', port: '5432', database: 'dsh_intent', user: 'postgres', password: '', ssl: false }

const SOURCE_LABEL: Record<ConnectionState['source'], string> = {
  page: '页面配置（本文件优先）',
  bundle: '插件补丁 cordis.patch.yml',
}

export function ConnectionTab(props: { onChanged: () => void }) {
  const [state, setState] = useState<ConnectionState | null>(null)
  const [form, setForm] = useState<FormFields>({ ...emptyForm })
  const [rawMode, setRawMode] = useState(false)
  const [rawUrl, setRawUrl] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<'' | 'test' | 'save' | 'db'>('')
  const [dropOpen, setDropOpen] = useState(false)
  const [dropConfirm, setDropConfirm] = useState('')

  const reload = async () => {
    const s = await api.get<ConnectionState>('/connection')
    setState(s)
    setForm({
      host: s.fields.host,
      port: String(s.fields.port),
      database: s.fields.database,
      user: s.fields.user,
      password: s.fields.password,
      ssl: s.fields.ssl,
    })
    setRawUrl(s.databaseUrl)
  }
  useEffect(() => {
    reload().catch(e => setError(e.message))
  }, [])

  const payload = () =>
    rawMode
      ? { databaseUrl: rawUrl }
      : { host: form.host, port: Number(form.port) || 5432, database: form.database, user: form.user, password: form.password, ssl: form.ssl }

  const run = (kind: 'test' | 'save' | 'db', fn: () => Promise<void>) => {
    setBusy(kind)
    setError('')
    setNotice('')
    fn()
      .catch(e => setError(e.message))
      .finally(() => setBusy(''))
  }

  const doTest = () =>
    run('test', async () => {
      const d = await api.post<{ latency_ms: number; pgvector: boolean }>('/connection/test', payload())
      setNotice(
        d.pgvector
          ? `连接成功（${d.latency_ms}ms），pgvector 扩展可用`
          : `连接成功（${d.latency_ms}ms）；但该实例未安装 pgvector 扩展，层2 向量检索不可用`,
      )
    })

  const doSave = () =>
    run('save', async () => {
      await api.put('/connection', payload())
      await reload()
      props.onChanged()
      setNotice('已保存并切换到新连接，即时生效（无需重启插件或桌面端）')
    })

  const doReset = () =>
    run('save', async () => {
      await api.del('/connection')
      await reload()
      props.onChanged()
      setNotice('已清除页面配置，回退到插件补丁 cordis.patch.yml 中的连接串')
    })

  /** 删除确认目标库名（表单模式取表单，连接串模式从 URL 解析）。 */
  const dropTarget = rawMode
    ? (() => { try { return decodeURIComponent(rawUrl.split('?')[0].split('/').pop() ?? '') } catch { return rawUrl.split('?')[0].split('/').pop() ?? '' } })()
    : form.database.trim()

  const doDbCheck = () =>
    run('db', async () => {
      const d = await api.post<{ database: string; exists: boolean }>('/connection/database/check', payload())
      setNotice(d.exists ? `数据库 ${d.database} 存在，可直接「测试并保存」` : `数据库 ${d.database} 不存在，可点击下方「创建数据库」一键创建`)
    })

  const doDbCreate = () =>
    run('db', async () => {
      const d = await api.post<{ database: string; vector: boolean; tables: boolean }>('/connection/database/create', payload())
      await reload()
      setNotice(
        `数据库 ${d.database} 已创建` +
          (d.vector ? '，pgvector 扩展已启用' : '；但 pgvector 扩展安装失败（需实例支持 pgvector，层2 暂不可用）') +
          (d.tables ? '，表结构已初始化完成，可直接「测试并保存」切换使用' : '；表结构初始化失败，保存切换时会自动重试'),
      )
    })

  const doDbDrop = () =>
    run('db', async () => {
      const d = await api.post<{ database: string }>('/connection/database/drop', { ...payload(), confirm: dropConfirm.trim() })
      setDropOpen(false)
      setDropConfirm('')
      await reload()
      props.onChanged()
      setNotice(`数据库 ${d.database} 已删除`)
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div className="ir-error">{error}</div>}
      {notice && <div className="ir-ok">{notice}</div>}

      <div className="ir-card pad">
        <div className="ir-card-title">
          <span>连接状态</span>
          {state && (
            <span className={`ir-badge ${state.connected ? 'running' : 'err'}`}>
              {state.connected ? '● 已连接' : '● 未连接'}
            </span>
          )}
        </div>
        {state ? (
          <dl className="ir-kv">
            <dt>配置来源</dt>
            <dd>{SOURCE_LABEL[state.source]}</dd>
            <dt>连接串</dt>
            <dd>
              <code>{state.databaseUrl}</code>
            </dd>
            <dt>配置文件</dt>
            <dd>
              <code>{state.filePath}</code>
            </dd>
            {state.error && (
              <>
                <dt>状态信息</dt>
                <dd className={state.connected ? '' : 'ir-error'}>{state.error}</dd>
              </>
            )}
          </dl>
        ) : (
          <div className="ir-muted" style={{ marginTop: 8 }}>
            正在读取连接状态…
          </div>
        )}
      </div>

      <div className="ir-card pad">
        <div className="ir-card-title">
          <span>连接配置</span>
          <button className="ir-btn" onClick={() => setRawMode(!rawMode)}>
            {rawMode ? '切换为表单填写' : '切换为连接串填写'}
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          {rawMode ? (
            <Field label="PostgreSQL 连接串" hint="postgres://用户:密码@主机:端口/数据库；密码填 *** 表示沿用当前已保存的密码">
              <input
                className="ir-input"
                style={{ fontFamily: 'monospace' }}
                value={rawUrl}
                onChange={e => setRawUrl(e.target.value)}
                placeholder="postgres://postgres:postgres@127.0.0.1:5432/dsh_intent"
              />
            </Field>
          ) : (
            <>
              <div className="ir-grid2">
                <Field label="主机地址">
                  <input className="ir-input" value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} placeholder="127.0.0.1" />
                </Field>
                <Field label="端口">
                  <input className="ir-input" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} placeholder="5432" />
                </Field>
                <Field label="数据库名" hint="库不存在时可用下方「数据库维护」一键检查/创建">
                  <input className="ir-input" value={form.database} onChange={e => setForm({ ...form, database: e.target.value })} placeholder="dsh_intent" />
                </Field>
                <Field label="用户名">
                  <input className="ir-input" value={form.user} onChange={e => setForm({ ...form, user: e.target.value })} placeholder="postgres" />
                </Field>
              </div>
              <Field label="密码" hint={form.password === '***' ? '显示 *** 表示已保存，重新输入才会覆盖' : '可留空'}>
                <input className="ir-input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </Field>
              <Toggle checked={form.ssl} onChange={v => setForm({ ...form, ssl: v })} label="使用 SSL 连接（sslmode=require）" />
            </>
          )}
        </div>
        <div className="ir-toolbar" style={{ marginTop: 12 }}>
          <button className="ir-btn" disabled={busy !== ''} onClick={doTest}>
            {busy === 'test' ? '测试中…' : '测试连接'}
          </button>
          <button className="ir-btn primary" disabled={busy !== ''} onClick={doSave}>
            {busy === 'save' ? '保存中…' : '测试并保存'}
          </button>
          {state?.source === 'page' && (
            <button
              className="ir-btn danger"
              disabled={busy !== ''}
              onClick={() => {
                if (confirm('清除页面保存的数据库配置，回退到 cordis.patch.yml 中的连接串？')) doReset()
              }}
            >
              清除页面配置
            </button>
          )}
        </div>
      </div>

      <div className="ir-card pad">
        <div className="ir-card-title">
          <span>数据库维护</span>
        </div>
        <div className="ir-muted" style={{ margin: '6px 0' }}>
          按上方表单（或连接串）指向的服务器与账号操作数据库：检查库是否存在、一键建库（自动启用 pgvector 并初始化全部表结构）、删除库。即使当前连接尚未生效也可使用——连上服务器但库不存在时，正是用这里自救。
        </div>
        <div className="ir-toolbar">
          <button className="ir-btn" disabled={busy !== ''} onClick={doDbCheck}>检查数据库</button>
          <button className="ir-btn primary" disabled={busy !== ''} onClick={doDbCreate}>
            {busy === 'db' ? '执行中…' : '创建数据库'}
          </button>
          <button className="ir-btn danger" disabled={busy !== ''}
            onClick={() => { setDropConfirm(''); setDropOpen(true) }}>
            删除数据库
          </button>
        </div>
      </div>

      {dropOpen && (
        <Modal title="删除数据库（高危操作）" onClose={() => setDropOpen(false)}
          footer={<>
            <button className="ir-btn" onClick={() => setDropOpen(false)}>取消</button>
            <button className="ir-btn danger" disabled={busy !== '' || dropTarget === '' || dropConfirm.trim() !== dropTarget}
              onClick={doDbDrop}>
              {busy === 'db' ? '删除中…' : '确认删除'}
            </button>
          </>}>
          <div className="ir-error" style={{ lineHeight: 1.8 }}>
            <b>请谨慎操作：删除数据库将清空其中全部意图、服务、向量与日志数据，且不可恢复！</b>
            <br />将按上方{rawMode ? '连接串' : '表单'}指向的服务器，删除数据库「<code>{dropTarget || '（未识别）'}</code>」。
            若删除的正是当前正在使用的库，插件会立即断开，需要重新配置连接。
          </div>
          <Field label={`请输入数据库名「${dropTarget}」以确认删除`}>
            <input className="ir-input" value={dropConfirm} onChange={e => setDropConfirm(e.target.value)}
              placeholder={dropTarget} />
          </Field>
        </Modal>
      )}

      <div className="ir-card pad">
        <div className="ir-card-title">
          <span>使用说明</span>
        </div>
        <div className="ir-muted" style={{ marginTop: 8, lineHeight: 1.9 }}>
          1. 数据库需要安装 pgvector 扩展（层2 向量检索依赖）；没有现成实例时可用插件包内的 docker-compose.yml 一键启动。
          <br />
          2. 配置生效优先级：本页面保存的配置 &gt; cordis.patch.yml 补丁 &gt; 内置默认值。保存后即时热切换，无需重启。
          <br />
          3. 修改连接后向量维度不变（仍为本插件初始化时的 embeddingDim）；如需变更维度，请调整补丁中的 embeddingDim 并重建向量。
          <br />
          4. 自动建表始终开启：「创建数据库」会一次性完成建库 + pgvector 扩展 + ir_* 表与索引；手动 createdb 的库在「测试并保存」切换时也会自动补建。
          <br />
          5. 「删除数据库」为高危操作，需输入库名二次确认；系统库（postgres/template*）不允许操作。若删的是当前在用的库，插件会断开并等待重新配置。
        </div>
      </div>
    </div>
  )
}
