/**
 * Client-bundle contract test (no browser): executes lib/client.js with a
 * stubbed ModuleLoader + stubbed seed modules, then drives apply() with mock
 * slots/locale services and asserts the three UI registrations:
 *   - settings.section  (id 'intent-recognition')
 *   - main keyed panel  (key 'intent-recognition')
 *   - sidebar.panellist (id 'intent-recognition', matches the main key)
 */
import { readFileSync } from 'node:fs'

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1) } console.log('ok:', msg) }

// ---- stub the module loader + seed modules ----
let factory = null
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      if (entry.id === 'dsh-intent-recognition') factory = entry.factory
    },
  },
}
const stubs = {
  react: { createElement: () => null, Fragment: 0 },
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 0 },
  'react-dom': {},
  'react-dom/client': {},
  '@deepseek-ai/cordis': {},
  '@deepseek-ai/dsh-client-ui-slots': {},
  zod: {},
}
const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
// eslint-disable-next-line no-eval
;(0, eval)(code)
assert(typeof factory === 'function', 'bundle registers itself with the ModuleLoader')

const mod = factory(name => {
  if (!(name in stubs)) throw new Error(`unexpected external require: ${name}`)
  return stubs[name]
})
assert(typeof mod.apply === 'function', 'module exports apply()')
assert(mod.PANEL_ID === 'intent-recognition', 'PANEL_ID exported')
assert(Array.isArray(mod.inject) && mod.inject.includes('slots') && mod.inject.includes('locale'), 'inject declares slots + locale')

// ---- drive apply() with mock services ----
const registrations = []
const dicts = {}
const ctx = {
  locale: {
    bind: ns => key => `${ns}:${key}`,
    register(ns, d) {
      dicts[ns] = d
      return () => {}
    },
  },
  slots: {
    inject(slot, fn) {
      if (typeof fn === 'function') return fn()
      return undefined
    },
    register(entry, component) {
      registrations.push({ entry, component })
      return { dispose: () => {} }
    },
  },
  effect(fn) {
    fn()
  },
}
mod.apply(ctx)

const settings = registrations.find(r => r.entry.name === 'settings.section')
assert(settings && settings.entry.id === 'intent-recognition', 'settings.section registered')
assert(typeof settings.entry.inject === 'function' && typeof settings.entry.inject().t === 'function', 'settings entry injects t')

const main = registrations.find(r => r.entry.name === 'main')
assert(main && main.entry.key === 'intent-recognition', 'main keyed panel registered (key = panel id)')
assert(typeof main.component === 'function', 'main panel component is the App')

const sidebar = registrations.find(r => r.entry.name === 'sidebar.panellist')
assert(sidebar && sidebar.entry.id === 'intent-recognition', 'sidebar entry registered (id matches main key)')
assert(typeof sidebar.entry.label === 'function' && sidebar.entry.label().includes('panel'), 'sidebar label resolves via locale')

assert(dicts['settings.intent-recognition']?.zh?.tabConnection === '数据库', 'zh locale carries the database tab')
assert(dicts['settings.intent-recognition']?.en?.tabConnection === 'Database', 'en locale carries the database tab')
assert(dicts['settings.intent-recognition']?.zh?.tabVector === '向量检索', 'zh locale carries the vector lab tab')
assert(dicts['settings.intent-recognition']?.en?.tabVector === 'Vector Lab', 'en locale carries the vector lab tab')

console.log('\nCLIENT CONTRACT TEST OK')
process.exit(0)
