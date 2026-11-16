/**
 * "Is FFmpeg already installed under our own root?" — the cheap check that runs
 * before any network access.
 *
 * Layout follows DECISIONS.md D8: `<root>/<platform>-<arch>/ffmpeg[.exe]`.
 * `root` is the caller's bin root (the host passes `~/.dsh/kumquat/bin`).
 */

import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { readVersion } from './exec.js'
import { getSource } from './sources.js'

/**
 * Default install root: `<DSH home>/kumquat`, the same value the Host computes
 * as `binaryRoot` in `src/host/config.js`. Duplicated here on purpose — the
 * binary manager must stay importable on its own (D5: modules talk through
 * injected functions, not imports) — and `status()` accepts a no-argument call,
 * which is how `src/host/ffmpeg.js` invokes it.
 *
 * @param {Record<string, string|undefined>} [env]
 * @param {string} [home]
 * @returns {string}
 */
export function defaultRoot(env = process.env, home = homedir()) {
  const configured = env.DSH_HOME
  const dshHome = typeof configured === 'string' && configured.trim() !== ''
    ? resolve(configured.trim())
    : join(home, '.dsh')
  return join(dshHome, 'kumquat')
}

/**
 * @typedef {object} BinaryStatus
 * @property {'cached'|'missing'} state
 * @property {string|null} path FFmpeg executable that would be used, null when absent.
 * @property {string|null} version Version reported by `-version`, null when unusable.
 * @property {string} platform
 * @property {string} arch
 * @property {number} sizeHint Bytes already on disk when cached, otherwise the expected
 *   archive size of the preferred source (for the "will download ~110 MB" hint).
 * @property {string} dir Directory the binaries live in.
 * @property {string} ffmpeg Absolute path of the ffmpeg binary we look for.
 * @property {string} ffprobe Absolute path of the ffprobe binary we look for.
 * @property {'ready'|'not-installed'|'incomplete'|'corrupt'|'unsupported'} reason
 * @property {string|null} hint Actionable next step when not ready.
 * @property {boolean} autoInstallAllowed Whether a source with a SHA-256 exists for this platform.
 */

/**
 * Directory that holds the binaries for one platform/arch pair.
 *
 * @param {string} root Bin root, e.g. `<config>/bin`.
 * @param {string} [platform]
 * @param {string} [arch]
 * @returns {string}
 */
export function platformDir(root, platform = process.platform, arch = process.arch) {
  return join(root, `${platform}-${arch}`)
}

/**
 * @param {string} [platform]
 * @returns {{ ffmpeg: string, ffprobe: string }} File name of each binary, with `.exe` on Windows.
 */
export function binaryNames(platform = process.platform) {
  const ext = platform === 'win32' ? '.exe' : ''
  return { ffmpeg: `ffmpeg${ext}`, ffprobe: `ffprobe${ext}` }
}

/**
 * @param {string} path
 * @returns {number} Size in bytes, 0 when it cannot be stat'ed.
 */
function sizeOf(path) {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/**
 * Root used by the most recent install in this process.
 *
 * `src/host/ffmpeg.js` calls `status()` with no arguments but passes `root` to
 * `installBinary`. In production both are `<DSH home>/kumquat`, but remembering
 * the install root keeps the two calls consistent even when a caller overrides it.
 *
 * @type {string|undefined}
 */
let lastInstallRoot

/**
 * Remember the root an install wrote to, so a later no-argument `status()` looks
 * in the same place.
 *
 * @param {string|undefined} root
 * @returns {void}
 */
export function rememberRoot(root) {
  if (typeof root === 'string' && root.length > 0) lastInstallRoot = root
}

/**
 * Inspect the install root.
 *
 * Executables are only trusted after `-version` runs and prints a version, so a
 * half-written or truncated file is reported as missing rather than used.
 *
 * Callable with no arguments: the Host does `status()` and lets this module pick
 * the default root, which is {@link defaultRoot}.
 *
 * @param {object} [opts]
 * @param {string} [opts.root] Bin root. Defaults to the last install root, else `~/.dsh/kumquat`.
 * @param {string} [opts.platform]
 * @param {string} [opts.arch]
 * @param {(exe: string, opts?: { tool?: string, timeoutMs?: number }) => Promise<string|null>} [opts.readVersionImpl]
 *   Injectable for tests (defaults to really executing `<exe> -version`).
 * @returns {Promise<BinaryStatus>}
 */
export async function status(opts = {}) {
  const platform = opts.platform ?? process.platform
  const arch = opts.arch ?? process.arch
  const probe = opts.readVersionImpl ?? readVersion
  const root = opts.root ?? lastInstallRoot ?? defaultRoot()

  const dir = platformDir(root, platform, arch)
  const names = binaryNames(platform)
  const ffmpeg = join(dir, names.ffmpeg)
  const ffprobe = join(dir, names.ffprobe)

  const source = getSource(platform, arch)
  const autoInstallAllowed = Boolean(source?.autoInstall && (source?.sha256 || source?.checksumUrl || source?.github))
  const expectedSize = source?.sizeHint ?? 0

  /** @param {string|null} version @param {BinaryStatus['reason']} reason @param {string|null} hint */
  const missing = (version, reason, hint) => ({
    state: /** @type {'missing'} */ ('missing'),
    path: null,
    version,
    platform,
    arch,
    sizeHint: expectedSize,
    dir,
    ffmpeg,
    ffprobe,
    reason,
    hint,
    autoInstallAllowed,
  })

  const hasFfmpeg = existsSync(ffmpeg)
  const hasFfprobe = existsSync(ffprobe)
  if (!hasFfmpeg && !hasFfprobe) {
    return missing(null, autoInstallAllowed ? 'not-installed' : 'unsupported', null)
  }
  if (!hasFfmpeg || !hasFfprobe) {
    return missing(
      null,
      'incomplete',
      `Only ${hasFfmpeg ? 'ffprobe' : 'ffmpeg'} is missing from ${dir}. Re-run the install to repair it.`,
    )
  }

  const [ffmpegVersion, ffprobeVersion] = await Promise.all([
    probe(ffmpeg, { tool: 'ffmpeg' }),
    probe(ffprobe, { tool: 'ffprobe' }),
  ])

  if (!ffmpegVersion || !ffprobeVersion) {
    return missing(null, 'corrupt',
      `The binaries in ${dir} do not run (\`-version\` failed). Re-run the install to replace them.`)
  }

  return {
    state: /** @type {'cached'} */ ('cached'),
    path: ffmpeg,
    version: ffmpegVersion,
    platform,
    arch,
    sizeHint: sizeOf(ffmpeg) + sizeOf(ffprobe),
    dir,
    ffmpeg,
    ffprobe,
    reason: 'ready',
    hint: null,
    autoInstallAllowed,
  }
}
