/**
 * dsh-intent-recognition — browser half.
 * Registers the "意图识别" settings section AND a global main panel with a
 * sidebar entry (pin/unpin from the sidebar's More menu is shell built-in).
 * Both surfaces render the same management App and talk to the host half
 * over the same-origin /dsh-intent-recognition/api routes.
 *
 * Registration pattern follows the proven third-party bundle (dshmarket):
 * every entry carries its own `inject: () => ({ t })` seat instead of relying
 * on the locale face alone, so a render never meets an absent `t`.
 */
import { App } from './App.tsx'
import { PanelIcon } from './PanelIcon.tsx'
import { en, zh } from './locales.ts'
import { injectStyles } from './styles.ts'

/** Minimal client-context face (slots + locale services). */
interface SlotEntry {
  name: string
  id: string
  order: number
  label: () => string
  locale: string
  inject?: () => Record<string, unknown>
}

interface ClientContext {
  locale: {
    bind: (ns: string) => (key: string) => string
    register: (ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }) => () => void
  }
  slots: {
    inject: (slot: string, factory: () => unknown) => unknown
    register: (entry: SlotEntry | KeyedEntry, component: unknown) => unknown
  }
  effect: (fn: () => unknown) => void
}

/** Keyed-slot entry shape (the `main` panel registry is a keyed slot). */
interface KeyedEntry {
  name: string
  key: string
  locale: string
  inject?: () => Record<string, unknown>
}

export const inject = ['slots', 'locale']

const NS = 'settings.intent-recognition'

/**
 * The id shared by the sidebar entry and the main panel it opens — the
 * layout's MainPanelId brand is compile-time only, a plain string at runtime.
 */
export const PANEL_ID = 'intent-recognition'

export function apply(ctx: ClientContext): void {
  injectStyles('dsh-intent-recognition')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }))

  // Settings → 意图识别 (kept: some users look for plugin config here).
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'intent-recognition',
        order: 30,
        label: () => t('nav'),
        locale: NS,
        inject: () => ({ t }),
      },
      App,
    ),
  )

  // Main-column global panel: the full management UI one click away.
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ t }),
      },
      App,
    ),
  )

  // Sidebar launcher row; id must match the main panel key. The shell owns
  // the button/label/selected state and the More-menu pin toggle.
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        label: () => t('panel'),
        locale: NS,
      },
      PanelIcon,
    ),
  )
}
