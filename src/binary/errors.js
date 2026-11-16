/**
 * Error type for the binary manager.
 *
 * Deliberately does not import `src/verify` or `src/engine`: the shape matches
 * `MediaQcErrorShape` from `src/public/types.d.ts` (`code` / `message` / `hint`)
 * so the host can hand it straight to the client, but the module stays standalone.
 *
 * @typedef {'E_BINARY_UNSUPPORTED'|'E_BINARY_SOURCE'|'E_BINARY_NETWORK'|'E_BINARY_HTTP'
 *   |'E_BINARY_TOO_LARGE'|'E_BINARY_CHECKSUM'|'E_BINARY_ARCHIVE'|'E_BINARY_VERIFY'
 *   |'E_BINARY_CANCEL'|'E_BINARY_TIMEOUT'|'E_BINARY_IO'} BinaryErrorCode
 */

/**
 * Build an Error carrying a stable code and a one-line user hint.
 *
 * @param {BinaryErrorCode} code
 * @param {string} message
 * @param {string} [hint]
 * @param {{ cause?: unknown }} [opts]
 * @returns {Error & { code: BinaryErrorCode, hint: string }}
 */
export function binaryError(code, message, hint = '', opts = {}) {
  const err = /** @type {Error & { code: BinaryErrorCode, hint: string }} */ (new Error(message))
  err.name = 'BinaryError'
  err.code = code
  err.hint = hint
  if (opts.cause !== undefined) err.cause = opts.cause
  return err
}

/**
 * True when `err` is one of ours.
 *
 * @param {unknown} err
 * @returns {err is Error & { code: BinaryErrorCode, hint: string }}
 */
export function isBinaryError(err) {
  return Boolean(err) && typeof (/** @type {any} */ (err).code) === 'string' &&
    /** @type {any} */ (err).code.startsWith('E_BINARY_')
}
