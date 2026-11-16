/**
 * Kumquat panel declaration.
 *
 * DSH main panels are a Client-side contract: `sidebar.panellist` carries the
 * launcher rows, the panel body is a slot occupant with the same id, and
 * `ctx.layout.selectPanel(id)` switches to it. There is no Host registry for
 * panels, so this module is the one place that fixes the identity both halves
 * use — the Client mirrors it, and `GET /api/kumquat/capabilities` republishes
 * it so the two cannot drift.
 */

/**
 * Panel identity and geometry.
 *
 * `placement` is the preferred home: a sidebar page whose launcher row lives
 * in the catalog's `sidebar.panellist`; the panel body is the matching main
 * panel the Client registers, so no Host-side slot name is invented here.
 * `fallback` covers a deployment that can only offer the composer dock: the
 * panel stays usable there, with an explicit full-screen expansion.
 */
export const PANEL = Object.freeze({
  /** Stable id shared by the sidebar row, the panel body, and `/api/kumquat`. */
  id: 'kumquat',
  /** Display names; the Client picks by active locale. */
  title: Object.freeze({ zh: '金桔', en: 'Kumquat' }),
  /** Bundle icon export, relative to the package root. */
  icon: './icon.svg',
  /** Preferred placement: a sidebar page with its own launcher row. */
  placement: 'sidebar-page',
  /** Verified Client slot that carries the launcher row for the panel. */
  launcherSlot: 'sidebar.panellist',
  /** The one fallback the product allows when no sidebar page is available. */
  fallback: Object.freeze({
    slot: 'conversation.composer.dock',
    expanded: true,
    expandedWidth: 960,
  }),
  /** Suggested widths in CSS pixels. */
  width: Object.freeze({ preferred: 480, min: 360, max: 720 }),
  /** The panel never takes over the Conversation; it is a parallel surface. */
  replacesConversation: false,
})

/**
 * Resolve the panel title for one locale.
 * @param {string | undefined} locale - BCP 47 tag such as `zh-CN` or `en`.
 * @returns {string} Localized title, English when the locale is unsupported.
 */
export function panelTitle(locale) {
  if (typeof locale === 'string' && locale.toLowerCase().startsWith('zh')) return PANEL.title.zh
  return PANEL.title.en
}
