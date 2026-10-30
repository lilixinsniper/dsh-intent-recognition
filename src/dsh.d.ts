/**
 * Host-side service faces used by this plugin. The runtime types live in the
 * host packages (@deepseek-ai/dsh-host-webserver); declared here so the plugin
 * typechecks without pinning the whole host tree.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: {
      register(route: {
        kind: 'exact' | 'prefix'
        path: string
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
      }): () => void
    }
    /** Lifecycle effect registration (fiber cleanup hook). */
    effect(fn: () => unknown, label?: string): unknown
    /** Optional service lookup. */
    get(name: string): unknown
    /**
     * Start a sub-fiber that runs when the listed services are available and
     * disposes when any of them goes away (load-order-safe dependency wait).
     */
    inject(deps: string[], callback: (ctx: Context) => unknown): unknown
  }
}

export {}
