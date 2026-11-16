/**
 * Public surface of the FFmpeg binary manager (S6).
 *
 * The host calls `status({ root })` on startup; when it reports `missing` and
 * `autoDownload` is enabled, the host calls `installBinary({ root })` and shows
 * progress from `onProgress`. `sources` is exported so the settings screen can
 * show where the binaries come from and which platforms are unsupported.
 *
 * Types live as JSDoc typedefs in the modules below; reference them as
 * `import('./install.js').InstallResult` etc. (this project has no build step).
 *
 * Zero third-party dependencies: node built-ins plus global `fetch` only.
 */

export { installBinary } from './install.js'
export { status, platformDir, binaryNames } from './status.js'
export {
  SOURCES,
  CHECKED_ON,
  DEFAULT_MAX_BYTES,
  ALLOWED_HOSTS,
  getSource,
  getSources,
  isAllowedUrl,
  resolveSource,
} from './sources.js'
export { binaryError, isBinaryError } from './errors.js'

/** @typedef {import('./install.js').InstallProgress} InstallProgress */
/** @typedef {import('./install.js').InstallResult} InstallResult */
/** @typedef {import('./status.js').BinaryStatus} BinaryStatus */
/** @typedef {import('./sources.js').BinarySource} BinarySource */
/** @typedef {import('./sources.js').ResolvedSource} ResolvedSource */
/** @typedef {import('./errors.js').BinaryErrorCode} BinaryErrorCode */
