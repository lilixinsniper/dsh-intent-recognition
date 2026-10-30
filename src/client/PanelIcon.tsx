/**
 * Sidebar panel-list icon for the intent-recognition global panel. The
 * sidebar owns the button, label and selected state around this glyph; the
 * component only renders the requested square edge.
 *
 * The glyph is an inline SVG on purpose: a third-party bundle should not
 * require host-ui packages beyond react — a seed miss would fail the whole
 * client module's materialization, not just the icon.
 */
import type { ReactNode } from 'react'

export interface PanelIconProps {
  /** Requested square edge in pixels, supplied by the sidebar. */
  size: number
  /** Whether this panel is selected in the main column. */
  active: boolean
}

export function PanelIcon({ size }: PanelIconProps): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* one query in, many routes out — the intent router glyph */}
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="19" cy="5.5" r="2.2" />
      <circle cx="19" cy="12" r="2.2" />
      <circle cx="19" cy="18.5" r="2.2" />
      <path d="M7.2 12h4.6" />
      <path d="M11.8 12 16.4 6.2" />
      <path d="M11.8 12h4.4" />
      <path d="M11.8 12l4.6 5.8" />
    </svg>
  )
}
