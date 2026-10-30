/** Small shared UI primitives. */
import { useState } from 'react'
import type { ReactNode } from 'react'

/** Long text with a 展开/收起 toggle (2-line clamp by default). */
export function ClampedText(props: { text: string; lines?: number; threshold?: number }) {
  const [open, setOpen] = useState(false)
  const text = props.text
  if (text === '') return <span className="ir-muted">—</span>
  const threshold = props.threshold ?? 100
  const clampable = text.length > threshold
  return (
    <span className="ir-clamped">
      <span
        className={clampable && !open ? 'ir-desc-clamp' : undefined}
        style={clampable && !open ? { WebkitLineClamp: props.lines ?? 2 } : undefined}
      >
        {text}
      </span>
      {clampable && (
        <button className="ir-link" onClick={() => setOpen(!open)}>
          {open ? '收起' : '展开'}
        </button>
      )}
    </span>
  )
}

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="ir-modal-mask" onClick={props.onClose}>
      <div className="ir-modal" onClick={e => e.stopPropagation()}>
        <h3>{props.title}</h3>
        {props.children}
        <div className="ir-modal-actions">{props.footer}</div>
      </div>
    </div>
  )
}

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="ir-field">
      <label>{props.label}</label>
      {props.children}
      {props.hint ? <span className="ir-muted">{props.hint}</span> : null}
    </div>
  )
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="ir-row" style={{ gap: 6, cursor: 'pointer', fontSize: 13 }}>
      <input type="checkbox" checked={props.checked} onChange={e => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  )
}

/** Parse a comma/、-separated textarea into a string list. */
export const toList = (s: string): string[] =>
  s.split(/[\n、,，;；|]/).map(x => x.trim()).filter(Boolean)

export const fromList = (a: string[] | undefined, sep = '、'): string => (a ?? []).join(sep)
