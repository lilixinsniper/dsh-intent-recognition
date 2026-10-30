/** Panel root: page header + segmented tabs over the five management pages. */
import { useCallback, useEffect, useState } from 'react'
import { api } from './api.ts'
import { ConnectionTab } from './ConnectionTab.tsx'
import { IntentsTab } from './IntentsTab.tsx'
import { ModelsTab } from './ModelsTab.tsx'
import { ServicesTab } from './ServicesTab.tsx'
import { VectorTab } from './VectorTab.tsx'

type Tab = 'intents' | 'services' | 'vector' | 'models' | 'connection'

export interface AppProps {
  t: (key: string) => string
}

interface Health {
  ok: boolean
  connected: boolean
  source?: string
  error?: string
}

export function App({ t }: AppProps) {
  const [tab, setTab] = useState<Tab>('intents')
  const [health, setHealth] = useState<Health | null>(null)

  const refreshHealth = useCallback(() => {
    api
      .get<Health>('/health')
      .then(setHealth)
      .catch(() => setHealth({ ok: false, connected: false, error: '后端接口不可达' }))
  }, [])
  useEffect(refreshHealth, [refreshHealth])

  const disconnected = health !== null && !health.connected

  return (
    <div className="ir-page">
      <header className="ir-page-header">
        <div className="ir-page-heading">
          <h2 className="ir-page-title">{t('title')}</h2>
          <p className="ir-page-sub">{t('intro')}</p>
        </div>
        {health !== null && (
          <span className={`ir-badge ${health.connected ? 'running' : 'err'}`} title={health.error}>
            {health.connected ? '● 数据库已连接' : '● 数据库未连接'}
          </span>
        )}
      </header>

      {disconnected && tab !== 'connection' && (
        <div className="ir-banner err">
          <span>
            PostgreSQL 未连接{health?.error ? `：${health.error}` : ''}
            。场景、意图、服务与模型数据都保存在数据库中，完成配置后自动恢复。
          </span>
          <button className="ir-btn" onClick={() => setTab('connection')}>
            去配置
          </button>
        </div>
      )}

      <nav className="ir-tabs">
        {(['intents', 'services', 'vector', 'models', 'connection'] as const).map(k => (
          <button key={k} className={`ir-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {t(k === 'intents' ? 'tabIntents' : k === 'services' ? 'tabServices' : k === 'vector' ? 'tabVector' : k === 'models' ? 'tabModels' : 'tabConnection')}
          </button>
        ))}
      </nav>

      {tab === 'intents' && <IntentsTab />}
      {tab === 'services' && <ServicesTab />}
      {tab === 'vector' && <VectorTab />}
      {tab === 'models' && <ModelsTab />}
      {tab === 'connection' && <ConnectionTab onChanged={refreshHealth} />}
    </div>
  )
}
