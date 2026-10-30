/** Plugin stylesheet, injected once as a tagged <style> element. */

export const CSS = `
/* Page scaffold: own padding box (also protects the title from being clipped
   by the host container), dsh-market-style header + segmented tabs. The page
   scrolls internally — the host panel area does not grow with content. */
.ir-page { box-sizing: border-box; width: 100%; max-width: 1120px; margin: 0 auto;
  padding: 26px 32px 56px; display: flex; flex-direction: column; gap: 18px;
  height: 100%; max-height: 100%; overflow-y: auto;
  color: var(--dsw-color-text-primary, #222); }
.ir-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ir-page-heading { min-width: 0; }
.ir-page-title { margin: 0; font-size: 22px; font-weight: 650; line-height: 1.4; letter-spacing: 0.2px;
  overflow: visible; text-overflow: clip; }
.ir-page-sub { margin: 6px 0 0; color: var(--dsw-color-text-tertiary, #888); font-size: 13px;
  line-height: 1.7; max-width: 760px; }
.ir-tabs { display: inline-flex; gap: 2px; padding: 3px; align-self: flex-start;
  border: 1px solid var(--dsw-color-border, #e2e2e2); border-radius: 10px;
  background: var(--dsw-color-bg-spotlight, #f5f6f8); }
.ir-tab { padding: 6px 18px; border: none; background: none; cursor: pointer; font-size: 13px;
  border-radius: 8px; color: var(--dsw-color-text-secondary, #666); }
.ir-tab:hover { color: var(--dsw-color-text-primary, #222); }
.ir-tab.active { background: var(--dsw-color-bg-container, #fff); color: var(--dsw-color-text-primary, #222);
  font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.ir-banner { display: flex; align-items: center; gap: 12px; padding: 10px 14px; font-size: 13px;
  border: 1px solid #ffe58f; background: #fffbe6; color: #ad6800; border-radius: 10px; }
.ir-banner.err { border-color: #ffccc7; background: #fff2f0; color: #cf1322; }
.ir-banner.ok { border-color: #b7eb8f; background: #f6ffed; color: #389e0d; }
.ir-banner .ir-btn { margin-left: auto; flex: none; }
.ir-kv { display: grid; grid-template-columns: 120px 1fr; gap: 6px 14px; font-size: 13px; margin: 10px 0 0; }
.ir-kv dt { color: var(--dsw-color-text-tertiary, #999); }
.ir-kv dd { margin: 0; word-break: break-all; }
.ir-layout { display: flex; gap: 16px; align-items: flex-start; }
.ir-side { width: 264px; flex: none; display: flex; flex-direction: column; gap: 8px; }
.ir-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.ir-card { border: 1px solid var(--dsw-color-border, #e2e2e2); border-radius: 12px; padding: 12px 14px;
  background: var(--dsw-color-bg-container, #fff); }
.ir-card.pad { padding: 16px 18px; }
.ir-card.selected { border-color: var(--dsw-color-primary, #4d6bfe); box-shadow: 0 0 0 1px var(--dsw-color-primary, #4d6bfe) inset; }
.ir-card-title { font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ir-muted { color: var(--dsw-color-text-tertiary, #999); font-size: 12px; }
.ir-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ir-btn { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--dsw-color-border, #d0d0d0);
  background: var(--dsw-color-bg-container, #fff); cursor: pointer; font-size: 13px; color: inherit; }
.ir-btn:hover { border-color: var(--dsw-color-primary, #4d6bfe); }
.ir-btn.primary { background: var(--dsw-color-primary, #4d6bfe); border-color: transparent; color: #fff; }
.ir-btn.danger { color: #d4380d; }
.ir-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ir-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ir-table-wrap { overflow-x: auto; }
.ir-table td.ir-desc-cell { max-width: 380px; word-break: break-all; }
.ir-clamped .ir-link { margin-left: 4px; }
.ir-desc-clamp { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
.ir-link { border: none; background: none; padding: 0 2px; cursor: pointer; font-size: 12px;
  color: var(--dsw-color-primary, #4d6bfe); }
.ir-card .ir-card-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; }
.ir-table th, .ir-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--dsw-color-border, #eee); vertical-align: top; }
.ir-table th { color: var(--dsw-color-text-tertiary, #999); font-weight: 500; white-space: nowrap; }
.ir-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.ir-field label { font-size: 12px; color: var(--dsw-color-text-secondary, #666); }
.ir-input, .ir-select, .ir-textarea { padding: 6px 10px; border-radius: 6px; font-size: 13px; color: inherit;
  border: 1px solid var(--dsw-color-border, #d0d0d0); background: var(--dsw-color-bg-container, #fff); font-family: inherit; }
.ir-textarea { min-height: 72px; resize: vertical; }
.ir-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; z-index: 1000;
  align-items: flex-start; justify-content: center; padding-top: 8vh; }
.ir-modal { background: var(--dsw-color-bg-elevated, #fff); border-radius: 12px; padding: 20px; width: 620px;
  max-width: 92vw; max-height: 80vh; overflow: auto; color: var(--dsw-color-text-primary, #222); }
.ir-modal h3 { margin: 0 0 14px; font-size: 16px; }
.ir-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.ir-badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; }
.ir-badge.running { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
.ir-badge.stopped { background: #fafafa; color: #999; border: 1px solid #d9d9d9; }
.ir-badge.on { background: #e6f4ff; color: #0958d9; border: 1px solid #91caff; }
.ir-badge.off { background: #fafafa; color: #bbb; border: 1px solid #e0e0e0; }
.ir-badge.err { background: #fff2f0; color: #cf1322; border: 1px solid #ffccc7; }
.ir-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.ir-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.ir-layers { display: flex; flex-direction: column; gap: 8px; }
.ir-layer { display: flex; gap: 12px; align-items: center; padding: 10px 12px;
  border: 1px solid var(--dsw-color-border, #e2e2e2); border-radius: 8px; flex-wrap: wrap; }
.ir-layer .name { font-weight: 600; font-size: 13px; width: 190px; flex: none; }
.ir-layer .params { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; }
.ir-layer .params input { width: 70px; padding: 4px 8px; border-radius: 6px;
  border: 1px solid var(--dsw-color-border, #d0d0d0); background: transparent; color: inherit; }
.ir-pre { background: var(--dsw-color-bg-spotlight, #f6f6f6); border-radius: 8px; padding: 10px;
  font-size: 12px; overflow: auto; max-height: 320px; white-space: pre-wrap; word-break: break-all; }
.ir-error { color: #cf1322; font-size: 12px; }
.ir-ok { color: #389e0d; font-size: 12px; }
.ir-trace { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
/* score bar（向量召回分数可视化） */
.ir-scorebar { position: relative; display: inline-block; width: 140px; height: 16px; background: var(--dsw-color-fill-2, #f0f1f5); border-radius: 8px; overflow: hidden; vertical-align: middle; }
.ir-scorebar-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 8px; }
.ir-scorebar-fill.on { background: var(--dsw-color-success, #34a853); }
.ir-scorebar-fill.off { background: var(--dsw-color-warning, #f9ab00); }
.ir-scorebar-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--dsw-color-text-1, #1f2329); }
/* loading spinner（测试服务「识别中」等按钮加载态） */
.ir-spinner { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: -2px;
  border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
  animation: ir-spin 0.7s linear infinite; }
@keyframes ir-spin { to { transform: rotate(360deg); } }
`

export function injectStyles(id: string): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = id
  tag.dataset.pluginCss = id
  tag.textContent = CSS
  document.head.appendChild(tag)
}
