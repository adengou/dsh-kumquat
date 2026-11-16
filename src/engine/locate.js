/**
 * FFmpeg discovery.
 *
 * `resolveFfmpeg` is the quiet probe used by the auto-installer: it returns
 * `null` instead of throwing when nothing usable exists. `findFfmpeg` is the
 * loud version used once auto-install has also failed.
 *
 * Search order (both functions):
 *   configured path -> KUMQUAT_FFMPEG / DSH_FFMPEG -> PATH -> common folders
 *   -> ~/.dsh/kumquat/bin/<platform>-<arch>/ (managed download folder, may not exist)
 *
 * No network access happens here. Downloading belongs to `src/binary/**`.
 */
import { statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { platform as hostPlatform } from './platform/index.js'
import { run as runProcess } from './runner.js'

/** @typedef {{ ffmpeg: string, ffprobe: string, version: string }} FfmpegLocation */

const COMMON_DIRS = {
  win32: [
    'C:\\ffmpeg\\bin',
    'C:\\Program Files\\ffmpeg\\bin',
    'C:\\Program Files (x86)\\ffmpeg\\bin',
    'C:\\Program Files\\ffmpeg',
    'C:\\ffmpeg',
  ],
  darwin: ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'],
  linux: ['/usr/bin', '/usr/local/bin', '/snap/bin'],
}

const INSTALL_HINTS = {
  win32:
    'winget install --id Gyan.FFmpeg -e  (or download from https://ffmpeg.org/download.html and add its bin folder to PATH)',
  darwin: 'brew install ffmpeg',
  linux: 'sudo apt install ffmpeg  (or: sudo dnf install ffmpeg / sudo pacman -S ffmpeg)',
}

/**
 * Locate FFmpeg and ffprobe without throwing when they are absent.
 * @param {DiscoverOptions} [options]
 * @returns {Promise<FfmpegLocation | null>}
 */
export async function resolveFfmpeg(options = {}) {
  const located = await discover(options)
  if (!located.ffmpeg || !located.ffprobe) return null
  return { ffmpeg: located.ffmpeg, ffprobe: located.ffprobe, version: located.version }
}

/**
 * Locate FFmpeg and ffprobe, throwing a copy-pasteable install hint otherwise.
 * @param {DiscoverOptions} [options]
 * @returns {Promise<FfmpegLocation>}
 */
export async function findFfmpeg(options = {}) {
  const located = await discover(options)
  if (!located.ffmpeg) throw notFoundError(located)
  if (!located.ffprobe) throw ffprobeMissingError(located)
  return { ffmpeg: located.ffmpeg, ffprobe: located.ffprobe, version: located.version }
}

/**
 * Extract a short numeric version from `ffmpeg -version` / `ffprobe -version`.
 * Git builds such as `N-112233-gabc` have no dotted number; the token is kept.
 * @param {string} text
 * @returns {string}
 */
export function parseVersion(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const line = lines.find((entry) => /(?:ffmpeg|ffprobe) version\s+\S+/i.test(entry)) ?? lines[0] ?? ''
  const match = line.match(/(?:ffmpeg|ffprobe) version\s+(\S+)/i)
  const token = match?.[1] ?? ''
  if (!token) return ''
  const numeric = token.match(/\d+\.\d+(?:\.\d+){0,2}/)
  return numeric ? numeric[0] : token
}

/**
 * @typedef {object} DiscoverOptions
 * @property {string} [ffmpegPath] Configured ffmpeg executable or its folder
 * @property {string} [path]       Alias of ffmpegPath
 * @property {string} [ffprobePath] Configured ffprobe executable or its folder
 * @property {NodeJS.ProcessEnv} [env]
 * @property {string} [platform]   Node platform id; defaults to the host
 * @property {string} [arch]       Node arch id; defaults to the host
 * @property {string} [home]       Home folder used for the managed bin folder
 * @property {string} [managedDir] Explicit managed bin folder (tests)
 * @property {string[]} [commonDirs]
 * @property {(command: string) => Promise<{ code: number, stdout?: string, stderr?: string }> | { code: number, stdout?: string, stderr?: string }} [runVersion]
 */

/**
 * @typedef {object} Discovery
 * @property {string | null} ffmpeg
 * @property {string | null} ffprobe
 * @property {string} version
 * @property {string} platform
 * @property {string[]} searched
 */

/**
 * @param {DiscoverOptions} options
 * @returns {Promise<Discovery>}
 */
async function discover(options) {
  const targetPlatform = options.platform ?? hostPlatform.name
  const arch = options.arch ?? hostPlatform.arch
  const env = options.env ?? process.env
  const home = options.home ?? os.homedir()
  const names = executableNames(targetPlatform)
  const commonDirs = options.commonDirs ?? COMMON_DIRS[targetPlatform] ?? []
  const managedDir = options.managedDir ?? managedBinDir(home, targetPlatform, arch)
  const runVersion = options.runVersion ?? defaultRunVersion
  /** @type {string[]} */
  const searched = []

  const searchDirs = [...pathDirsFromEnv(env, targetPlatform), ...commonDirs]

  const ffmpegCandidates = dedupe([
    ...explicitCandidates(options.ffmpegPath ?? options.path, names.ffmpeg, targetPlatform),
    ...envCandidates(env, ['KUMQUAT_FFMPEG', 'DSH_FFMPEG'], names.ffmpeg, targetPlatform),
    ...searchDirs.map((dir) => path.join(dir, names.ffmpeg)),
    path.join(managedDir, names.ffmpeg),
  ])

  const ffmpeg = await firstValid(ffmpegCandidates, runVersion, searched)
  if (!ffmpeg) {
    return { ffmpeg: null, ffprobe: null, version: '', platform: targetPlatform, searched }
  }

  // ffprobe prefers the ffmpeg sibling, then explicit config, env, PATH, common folders, managed folder.
  const ffprobeCandidates = dedupe([
    path.join(path.dirname(ffmpeg.path), names.ffprobe),
    ...explicitCandidates(options.ffprobePath, names.ffprobe, targetPlatform),
    ...envCandidates(env, ['KUMQUAT_FFPROBE', 'DSH_FFPROBE'], names.ffprobe, targetPlatform),
    ...searchDirs.map((dir) => path.join(dir, names.ffprobe)),
    path.join(managedDir, names.ffprobe),
  ])

  const ffprobe = await firstValid(ffprobeCandidates, runVersion, searched)

  return {
    ffmpeg: ffmpeg.path,
    ffprobe: ffprobe?.path ?? null,
    version: ffmpeg.version,
    platform: targetPlatform,
    searched,
  }
}

/**
 * @param {string} platformName
 * @returns {{ ffmpeg: string, ffprobe: string }}
 */
function executableNames(platformName) {
  return platformName === 'win32'
    ? { ffmpeg: 'ffmpeg.exe', ffprobe: 'ffprobe.exe' }
    : { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }
}

/** @param {string} home @param {string} platformName @param {string} arch */
function managedBinDir(home, platformName, arch) {
  return path.join(home, '.dsh', 'kumquat', 'bin', `${platformName}-${arch}`)
}

/**
 * Validate candidates in order; existence is checked before spawning.
 * @param {string[]} candidates
 * @param {DiscoverOptions['runVersion']} runVersion
 * @param {string[]} searched
 * @returns {Promise<{ path: string, version: string } | null>}
 */
async function firstValid(candidates, runVersion, searched) {
  for (const candidate of candidates) {
    searched.push(candidate)
    if (!isFile(candidate)) continue
    const result = await validate(candidate, runVersion)
    if (result) return result
  }
  return null
}

/**
 * @param {string} candidate
 * @param {DiscoverOptions['runVersion']} runVersion
 * @returns {Promise<{ path: string, version: string } | null>}
 */
async function validate(candidate, runVersion) {
  try {
    const result = await runVersion(candidate)
    if (!result || result.code !== 0) return null
    return { path: candidate, version: parseVersion(`${result.stdout ?? ''}\n${result.stderr ?? ''}`) }
  } catch {
    return null
  }
}

/** @param {string} command */
async function defaultRunVersion(command) {
  try {
    const output = await runProcess([command, '-version'], { timeoutMs: 5000 })
    return { code: output.code, stdout: output.stdout, stderr: output.stderr }
  } catch {
    return { code: -1, stdout: '', stderr: '' }
  }
}

/**
 * @param {string | undefined} raw
 * @param {string} exeName
 * @param {string} targetPlatform
 * @returns {string[]}
 */
function explicitCandidates(raw, exeName, targetPlatform) {
  if (typeof raw !== 'string') return []
  const value = stripQuotes(raw.trim())
  if (!value) return []
  if (isDirectory(value)) return [path.join(value, exeName)]
  const candidates = [value]
  if (targetPlatform === 'win32' && !/\.exe$/i.test(value)) candidates.push(`${value}.exe`)
  return candidates
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} keys
 * @param {string} exeName
 * @param {string} targetPlatform
 * @returns {string[]}
 */
function envCandidates(env, keys, exeName, targetPlatform) {
  /** @type {string[]} */
  const out = []
  for (const key of keys) {
    const raw = envValue(env, key)
    if (raw) out.push(...explicitCandidates(raw, exeName, targetPlatform))
  }
  return out
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} key
 * @returns {string | undefined}
 */
function envValue(env, key) {
  if (!env) return undefined
  if (env[key] !== undefined) return env[key]
  // Windows exposes `Path` rather than `PATH`; test fixtures may use either case.
  const target = key.toLowerCase()
  for (const name of Object.keys(env)) {
    if (name.toLowerCase() === target) return env[name]
  }
  return undefined
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} targetPlatform
 * @returns {string[]}
 */
function pathDirsFromEnv(env, targetPlatform) {
  const raw = envValue(env, 'PATH') ?? envValue(env, 'Path') ?? ''
  const delimiter = targetPlatform === 'win32' ? ';' : ':'
  return String(raw)
    .split(delimiter)
    .map((entry) => stripQuotes(entry.trim()))
    .filter(Boolean)
}

/** @param {string} value */
function stripQuotes(value) {
  return value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
}

/** @param {string[]} candidates */
function dedupe(candidates) {
  return [...new Set(candidates.filter(Boolean))]
}

/** @param {string} p */
function isFile(p) {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/** @param {string} p */
function isDirectory(p) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/**
 * @param {Discovery} located
 */
function notFoundError(located) {
  const hint = INSTALL_HINTS[located.platform] ?? INSTALL_HINTS.linux
  const searched = located.searched.slice(0, 8)
  return new Error(
    [
      `FFmpeg was not found for ${located.platform}.`,
      'Kumquat checked the configured path, KUMQUAT_FFMPEG / DSH_FFMPEG, PATH, common install folders, and the managed bin folder.',
      `Install FFmpeg first: ${hint}`,
      'Or set KUMQUAT_FFMPEG (or the ffmpegPath setting) to the ffmpeg executable.',
      searched.length ? `Checked: ${searched.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

/**
 * @param {Discovery} located
 */
function ffprobeMissingError(located) {
  const hint = INSTALL_HINTS[located.platform] ?? INSTALL_HINTS.linux
  return new Error(
    [
      `ffprobe was not found, although ffmpeg exists at ${located.ffmpeg}.`,
      'Kumquat needs both executables from a full FFmpeg build; a stripped build with only ffmpeg is not enough.',
      `Install a complete FFmpeg build: ${hint}`,
      'Or set KUMQUAT_FFPROBE / DSH_FFPROBE to the ffprobe executable.',
    ].join('\n'),
  )
}
