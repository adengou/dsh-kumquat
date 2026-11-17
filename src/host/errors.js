/**
 * Error vocabulary shared by the host routes.
 *
 * The public contract already fixes `MediaQcErrorShape` (`code`, `message`,
 * `hint`) for engine and verify failures; the host reuses that shape for its
 * own boundary errors so a Client renders one banner, not two dialects.
 */

/** Codes the host itself raises, beside the engine's `E_*` codes. */
export const HOST_CODES = Object.freeze({
  WIRING: 'E_WIRING',
  ROUTE: 'E_ROUTE',
  METHOD: 'E_METHOD',
  INPUT: 'E_INPUT',
  DISABLED: 'E_DISABLED',
  BUSY: 'E_BUSY',
  NOT_FOUND: 'E_NOT_FOUND',
  BODY: 'E_BODY',
  HOST: 'E_HOST',
})

/** A dependency this bundle needs is not wired in this composition. */
export class WiringError extends Error {
  /**
   * @param {string} message - Operator-facing reason.
   * @param {string} [hint] - What to do next.
   * @param {{ cause?: unknown }} [options] - Original failure, kept off the wire.
   */
  constructor(message, hint, options = {}) {
    super(message)
    this.name = 'WiringError'
    this.code = HOST_CODES.WIRING
    this.hint = hint
    if (options.cause !== undefined) this.cause = options.cause
  }
}

/**
 * HTTP status for one error code.
 * @param {string} code - Error code from the engine, verify, or host.
 * @returns {number} Status the Client sees.
 */
export function statusForCode(code) {
  switch (code) {
    case HOST_CODES.INPUT:
    case 'E_INPUT':
      return 400
    case HOST_CODES.METHOD:
      return 405
    case HOST_CODES.ROUTE:
    case HOST_CODES.NOT_FOUND:
      return 404
    case HOST_CODES.DISABLED:
      return 403
    case 'E_CAPABILITY':
      // 412 carries the engine's own message and hint through the Client,
      // which rewrites 401/403 into a generic "forbidden" hint.
      return 412
    case HOST_CODES.BUSY:
    case 'E_CANCEL':
      return 409
    case HOST_CODES.BODY:
      return 413
    case HOST_CODES.WIRING:
      return 501
    case 'E_ENCODE':
    case 'E_VERIFY':
    case 'E_REPAIR_EXHAUSTED':
    case 'E_COMMIT':
      return 500
    default:
      return 500
  }
}

/**
 * Project any thrown value onto the frozen `{ code, message, hint }` shape.
 *
 * The message is copied verbatim so an operator sees the engine's own wording;
 * hints are attached only when the source carried one. Stacks and causes never
 * cross the wire.
 * @param {unknown} error - Thrown value.
 * @returns {{ code: string, message: string, hint?: string }} Error shape.
 */
export function toErrorShape(error) {
  if (error !== null && typeof error === 'object') {
    const candidate = /** @type {{ code?: unknown, message?: unknown, hint?: unknown, shape?: unknown }} */ (error)
    // 服务层把准备好的形状挂在 `.shape` 上；认它，否则 E_CAPABILITY 会被降级成 E_HOST/500。
    if (candidate.shape !== null && typeof candidate.shape === 'object') {
      return toErrorShape(candidate.shape)
    }
    const code = typeof candidate.code === 'string' && candidate.code !== '' ? candidate.code : HOST_CODES.HOST
    const message = typeof candidate.message === 'string' && candidate.message !== ''
      ? candidate.message
      : 'Kumquat 宿主内部错误'
    /** @type {{ code: string, message: string, hint?: string }} */
    const shape = { code, message }
    if (typeof candidate.hint === 'string' && candidate.hint !== '') shape.hint = candidate.hint
    return shape
  }
  return { code: HOST_CODES.HOST, message: String(error) }
}

/**
 * Build one JSON error envelope.
 * @param {unknown} error - Thrown value or a prepared error shape.
 * @returns {{ status: number, body: { ok: false, error: { code: string, message: string, hint?: string } } }}
 *   Status and body for the HTTP adapter.
 */
export function errorResult(error) {
  const shape = toErrorShape(error)
  return { status: statusForCode(shape.code), body: { ok: false, error: shape } }
}
