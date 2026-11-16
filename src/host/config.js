/**
 * Kumquat host configuration.
 *
 * The Loader hands the plugin its profile row config; anything the row leaves
 * out falls back to the defaults below. This module is also the only place
 * that reads the DeepSeek key, and it never returns the key to a caller that
 * could serialize it: callers ask for `config.apiKey` explicitly, and
 * {@link describeConfig} reports presence only.
 */

import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/** Default panel refresh interval for the balance widget, in milliseconds. */
export const DEFAULT_BALANCE_REFRESH_MS = 30_000

/** Lowest accepted refresh interval, so a typo cannot hammer the endpoint. */
const MIN_REFRESH_MS = 1_000

/** Highest accepted refresh interval: one hour. */
const MAX_REFRESH_MS = 3_600_000

/**
 * Platform download directory with the product folder appended.
 *
 * Windows and macOS both use `~/Downloads`. Linux deployments frequently move
 * it, so XDG_DOWNLOAD_DIR wins there and `~/Downloads` remains the fallback.
 * @param {NodeJS.Platform} [platform] - Platform to answer for.
 * @param {string} [home] - User home directory.
 * @param {Record<string, string | undefined>} [env] - Environment to read.
 * @returns {string} Absolute directory the product writes finished media to.
 */
export function defaultOutputDir(platform = process.platform, home = homedir(), env = process.env) {
  // Empty means: write next to the source file. `Downloads` is often guarded
  // by Windows Controlled Folder Access, where ffmpeg fails with EACCES while
  // Node still succeeds — so it is a bad default.
  return ''
}

/**
 * Harness home directory. The desktop and CLI layouts both honour DSH_HOME;
 * every installation has a home below the user profile otherwise.
 * @param {Record<string, string | undefined>} [env] - Environment to read.
 * @param {string} [home] - User home directory.
 * @returns {string} Absolute harness home.
 */
export function dshHome(env = process.env, home = homedir()) {
  const configured = env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return resolve(configured.trim())
  return join(home, '.dsh')
}

/**
 * Directory the FFmpeg installer owns. The binary manager decides the
 * `<platform>-<arch>` leaf below it.
 * @param {Record<string, string | undefined>} [env] - Environment to read.
 * @param {string} [home] - User home directory.
 * @returns {string} Absolute install root.
 */
export function binaryRoot(env = process.env, home = homedir()) {
  return join(dshHome(env, home), 'kumquat')
}

/**
 * Read a finite number within bounds, falling back when the value is unusable.
 * @param {unknown} value - Candidate from configuration.
 * @param {number} fallback - Value used when the candidate is not a number.
 * @param {number} min - Inclusive lower bound.
 * @param {number} max - Inclusive upper bound.
 * @returns {number} Clamped finite number.
 */
function boundedNumber(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Read a non-empty string.
 * @param {unknown} value - Candidate from configuration.
 * @returns {string | undefined} Trimmed text, or undefined.
 */
function nonEmptyString(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Resolve one effective configuration.
 *
 * Unknown keys are dropped rather than forwarded, which keeps the row's
 * `!!js` expressions and future fields from leaking into engine calls.
 * @param {unknown} raw - Profile row config, already parsed from YAML.
 * @param {{ env?: Record<string, string | undefined>, platform?: NodeJS.Platform, home?: string }} [context]
 *   Environment and platform facts, injectable for tests.
 * @returns {{ outputDir: string, ffmpegPath: string | undefined, apiKey: string | undefined,
 *   balanceRefreshMs: number, autoDownload: boolean, binaryRoot: string }} Frozen configuration.
 */
export function resolveConfig(raw, context = {}) {
  const env = context.env ?? process.env
  const platform = context.platform ?? process.platform
  const home = context.home ?? homedir()
  const row = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}

  const outputDirText = nonEmptyString(row.outputDir)
  const outputDir = outputDirText === undefined
    ? defaultOutputDir(platform, home, env)
    : resolve(outputDirText)

  const ffmpegPathText = nonEmptyString(row.ffmpegPath)
  const ffmpegPath = ffmpegPathText === undefined
    ? undefined
    : (isAbsolute(ffmpegPathText) ? ffmpegPathText : resolve(ffmpegPathText))

  const configuredKey = nonEmptyString(row.apiKey)
  const environmentKey = nonEmptyString(env.DEEPSEEK_API_KEY)
  const apiKey = configuredKey ?? environmentKey

  const balanceRefreshMs = boundedNumber(
    row.balanceRefreshMs, DEFAULT_BALANCE_REFRESH_MS, MIN_REFRESH_MS, MAX_REFRESH_MS,
  )

  const autoDownload = typeof row.autoDownload === 'boolean' ? row.autoDownload : true

  return Object.freeze({
    outputDir,
    ffmpegPath,
    apiKey,
    balanceRefreshMs,
    autoDownload,
    binaryRoot: binaryRoot(env, home),
  })
}

/**
 * Configuration facts that are safe to log or return.
 * @param {{ outputDir: string, ffmpegPath?: string, apiKey?: string,
 *   balanceRefreshMs: number, autoDownload: boolean }} config - Resolved config.
 * @returns {{ outputDir: string, ffmpegPath: string | null, hasApiKey: boolean,
 *   balanceRefreshMs: number, autoDownload: boolean }} Frozen summary without the key.
 */
export function describeConfig(config) {
  return Object.freeze({
    outputDir: config.outputDir,
    ffmpegPath: config.ffmpegPath ?? null,
    hasApiKey: typeof config.apiKey === 'string' && config.apiKey !== '',
    balanceRefreshMs: config.balanceRefreshMs,
    autoDownload: config.autoDownload,
  })
}

/**
 * Read the row config the Loader attached to this plugin's fiber.
 *
 * `apply(ctx, config)` normally carries it, but the bundle entry may forward
 * only `ctx`; the fiber entry keeps the same value.
 * @param {any} ctx - Host Cordis context.
 * @param {unknown} [explicit] - Config argument passed to `apply`.
 * @returns {unknown} Raw row config, or an empty object.
 */
export function readRowConfig(ctx, explicit) {
  if (explicit !== undefined) return explicit
  const entry = ctx?.fiber?.entry
  const config = entry?.options?.config
  return config === undefined ? {} : config
}

