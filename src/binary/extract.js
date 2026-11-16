/**
 * Archive handling for FFmpeg builds, using the system `tar`.
 *
 * Why the system tar: Windows 10+ ships bsdtar at `C:\Windows\System32\tar.exe`,
 * macOS and every mainstream Linux distro ship one too, and bsdtar reads both
 * zip and tar.xz. That keeps the plugin dependency-free while still supporting
 * every source in `sources.js`.
 *
 * Safety rules enforced here (D8):
 *  1. `tar -tf` first; nothing is extracted before the listing is screened;
 *  2. absolute paths, drive letters, UNC prefixes and any `..` segment are rejected;
 *  3. only the exact `ffmpeg` / `ffprobe` entries are extracted — never the whole
 *     archive, never the bundled docs, DLLs or helper tools;
 *  4. the extracted file must be a regular file (a symlink in a hostile archive is
 *     rejected rather than executed);
 *  5. everything lands in a staging directory inside the install root, which is
 *     removed on any failure, so the final directory only ever sees complete files.
 */

import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { binaryError } from './errors.js'
import { runToFile } from './exec.js'
import { replaceFile } from './download.js'
import { binaryNames } from './status.js'

/** Upper bound on archive entries, to keep a hostile archive from exhausting memory. */
const MAX_ENTRIES = 50_000

/**
 * @typedef {object} ListingReport
 * @property {string[]} entries Every entry, in archive order.
 * @property {{ entry: string, reason: string }[]} rejected Unsafe entries and why.
 */

/**
 * Screen a `tar -tf` listing.
 *
 * @param {string} text Raw listing (one entry per line).
 * @returns {ListingReport}
 */
export function classifyEntries(text) {
  /** @type {string[]} */
  const entries = []
  /** @type {{ entry: string, reason: string }[]} */
  const rejected = []

  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  for (const rawLine of lines) {
    const entry = rawLine.replace(/\s+$/, '')
    if (entry.length === 0) continue
    if (entries.length + rejected.length >= MAX_ENTRIES) {
      throw binaryError('E_BINARY_ARCHIVE', `Archive lists more than ${MAX_ENTRIES} entries.`,
        'Refusing to process it. Use a trusted FFmpeg build.')
    }
    const reason = unsafeReason(entry)
    if (reason) {
      rejected.push({ entry, reason })
    } else {
      entries.push(entry)
    }
  }
  return { entries, rejected }
}

/**
 * Explain why an archive entry is unsafe, or return null when it is fine.
 *
 * @param {string} entry
 * @returns {string|null}
 */
export function unsafeReason(entry) {
  if (entry.includes('\0')) return 'contains a NUL byte'
  // Network paths first: they also start with a separator, but deserve their own reason.
  if (entry.startsWith('//') || entry.startsWith('\\\\')) return 'network (UNC) path'
  if (entry.startsWith('/') || entry.startsWith('\\')) return 'absolute path'
  if (/^[A-Za-z]:/.test(entry)) return 'drive-letter path'
  if (entry.startsWith('~')) return 'home-relative path'
  const segments = entry.split(/[/\\]/)
  if (segments.includes('..')) return 'parent-directory segment (..)'
  if (segments.includes('.')) return 'current-directory segment (.)'
  return null
}

/**
 * Parse a listing and fail if anything in it is unsafe.
 *
 * @param {string} text
 * @returns {string[]} Safe entries.
 */
export function parseListing(text) {
  const { entries, rejected } = classifyEntries(text)
  if (rejected.length > 0) throwUnsafe(rejected)
  return entries
}

/**
 * @param {{ entry: string, reason: string }[]} rejected
 * @returns {never}
 */
function throwUnsafe(rejected) {
  const sample = rejected.slice(0, 3).map((r) => `${JSON.stringify(r.entry)} (${r.reason})`).join(', ')
  const more = rejected.length > 3 ? ` and ${rejected.length - 3} more` : ''
  throw binaryError('E_BINARY_ARCHIVE',
    `Refusing to extract an archive with ${rejected.length} unsafe entr${rejected.length === 1 ? 'y' : 'ies'}: ${sample}${more}`,
    'The archive tried to write outside the install directory. Nothing was extracted.')
}

/**
 * Pick the exact archive entries for our two binaries.
 *
 * Candidates must match a target file name *exactly* at the last path segment;
 * the shallowest match wins (typically `bin/ffmpeg.exe` or
 * `ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe`).
 *
 * @param {string[]} entries
 * @param {{ ffmpeg: string, ffprobe: string }} names
 * @returns {{ ffmpeg: string|null, ffprobe: string|null, picks: string[] }}
 */
export function pickBinaryEntries(entries, names) {
  /** @param {string} wanted */
  const best = (wanted) => {
    /** @type {{ entry: string, depth: number }|null} */
    let winner = null
    for (const entry of entries) {
      const segments = entry.split(/[/\\]/).filter(Boolean)
      if (segments.length === 0) continue
      if (segments[segments.length - 1] !== wanted) continue
      const depth = segments.length
      if (!winner || depth < winner.depth) winner = { entry, depth }
    }
    return winner ? winner.entry : null
  }

  const ffmpeg = best(names.ffmpeg)
  const ffprobe = best(names.ffprobe)
  return { ffmpeg, ffprobe, picks: [ffmpeg, ffprobe].filter((v) => typeof v === 'string') }
}

/**
 * Run `tar -tf` and return the safe entry list.
 *
 * @param {string} archivePath
 * @param {{ tarPath?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<ListingReport>}
 */
export async function listArchive(archivePath, opts = {}) {
  const tarPath = opts.tarPath ?? 'tar'
  const res = await runToFile(tarPath, ['-tf', archivePath], { timeoutMs: opts.timeoutMs ?? 60_000 })
  if (res.code !== 0) {
    throw binaryError('E_BINARY_ARCHIVE',
      `Cannot list the archive (tar exited ${res.code}): ${firstLine(res.stderr) || 'no stderr'}`,
      'The download is corrupt or the format is not supported by the system tar. Retry the install.')
  }
  return classifyEntries(res.stdout)
}

/**
 * Extract only `entries` into `destDir`.
 *
 * @param {string} archivePath
 * @param {object} opts
 * @param {string} opts.destDir Directory to extract into (created if needed).
 * @param {string[]} opts.entries Exact entry names from the screened listing.
 * @param {string} [opts.tarPath]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<void>}
 */
export async function extractEntries(archivePath, opts) {
  const tarPath = opts.tarPath ?? 'tar'
  if (!Array.isArray(opts.entries) || opts.entries.length === 0) {
    throw binaryError('E_BINARY_ARCHIVE', 'Nothing to extract: no ffmpeg/ffprobe entry was found.',
      'The build layout changed. Update the source entry or install FFmpeg manually.')
  }
  mkdirSync(opts.destDir, { recursive: true })
  const args = ['-xf', archivePath, '-C', opts.destDir, '--', ...opts.entries]
  const res = await runToFile(tarPath, args, { timeoutMs: opts.timeoutMs ?? 180_000 })
  if (res.code !== 0) {
    throw binaryError('E_BINARY_ARCHIVE',
      `tar could not extract the binaries (exit ${res.code}): ${firstLine(res.stderr) || 'no stderr'}`,
      'The archive may be truncated or in an unsupported format. Retry the install.')
  }
}

/**
 * Create the staging directory used for extraction. It lives inside `root` so the
 * final rename stays on one volume (a rename across volumes is not atomic).
 *
 * @param {string} root
 * @returns {string} Absolute path of the staging directory.
 */
export function createStagingDir(root) {
  mkdirSync(root, { recursive: true })
  return mkdtempSync(join(root, '.staging-'))
}

/**
 * Extract ffmpeg + ffprobe from `archivePath` into `stagingDir`, validate that both
 * are regular files, and make them executable on POSIX.
 *
 * @param {string} archivePath
 * @param {object} opts
 * @param {string} opts.stagingDir
 * @param {string} [opts.platform] Target platform, decides the `.exe` suffix.
 * @param {string} [opts.tarPath]
 * @returns {Promise<{ ffmpeg: string, ffprobe: string, archiveEntries: string[] }>}
 */
export async function extractBinaries(archivePath, opts) {
  const platform = opts.platform ?? process.platform
  const names = binaryNames(platform)
  const report = await listArchive(archivePath, { tarPath: opts.tarPath })
  if (report.rejected.length > 0) {
    // Screen *before* extracting: a hostile archive must not touch the disk at all.
    throwUnsafe(report.rejected)
  }
  const picked = pickBinaryEntries(report.entries, names)
  if (!picked.ffmpeg || !picked.ffprobe) {
    throw binaryError('E_BINARY_ARCHIVE',
      `The archive does not contain ${names.ffmpeg} and ${names.ffprobe} (found ${report.entries.length} entries).`,
      'This build layout is not supported. Pick another source or install FFmpeg manually.')
  }

  await extractEntries(archivePath, { destDir: opts.stagingDir, entries: picked.picks, tarPath: opts.tarPath })

  const ffmpeg = join(opts.stagingDir, picked.ffmpeg)
  const ffprobe = join(opts.stagingDir, picked.ffprobe)
  assertRegularFile(ffmpeg, picked.ffmpeg)
  assertRegularFile(ffprobe, picked.ffprobe)
  if (platform !== 'win32') {
    try {
      chmodSync(ffmpeg, 0o755)
      chmodSync(ffprobe, 0o755)
    } catch (err) {
      throw binaryError('E_BINARY_IO', `Cannot chmod the extracted binaries: ${String(/** @type {any} */ (err)?.message || err)}`,
        'The install directory may be read-only.', { cause: err })
    }
  }

  return { ffmpeg, ffprobe, archiveEntries: picked.picks }
}

/**
 * Move the staged binaries into `<root>/<platform>-<arch>/` with a rename per file.
 *
 * @param {object} opts
 * @param {string} opts.stagingDir
 * @param {string} opts.root
 * @param {string} [opts.platform]
 * @param {string} [opts.arch]
 * @param {{ ffmpeg: string, ffprobe: string }} opts.files Staged file paths.
 * @returns {Promise<{ ffmpeg: string, ffprobe: string, dir: string }>}
 */
export async function commitBinaries(opts) {
  const platform = opts.platform ?? process.platform
  const names = binaryNames(platform)
  const dir = join(opts.root, `${platform}-${archOrDefault(opts.arch)}`)
  mkdirSync(dir, { recursive: true })

  const targets = {
    ffmpeg: join(dir, names.ffmpeg),
    ffprobe: join(dir, names.ffprobe),
  }

  await replaceFile(opts.files.ffmpeg, targets.ffmpeg)
  await replaceFile(opts.files.ffprobe, targets.ffprobe)

  if (platform !== 'win32') {
    try {
      chmodSync(targets.ffmpeg, 0o755)
      chmodSync(targets.ffprobe, 0o755)
    } catch {}
  }

  return { ...targets, dir }
}

/**
 * Remove a staging directory, ignoring failures.
 *
 * @param {string|null|undefined} dir
 * @returns {void}
 */
export function removeStagingDir(dir) {
  if (!dir) return
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {}
}

/**
 * Delete orphaned staging directories left behind by a process that was killed
 * mid-install (the crash we hit during development does exactly that).
 *
 * Only directories older than `maxAgeMs` are touched, so a second install
 * running concurrently never loses its own staging directory.
 *
 * @param {string} root
 * @param {{ maxAgeMs?: number, now?: () => number }} [opts]
 * @returns {string[]} Paths that were removed.
 */
export function sweepStaleStaging(root, opts = {}) {
  const maxAgeMs = opts.maxAgeMs ?? 60 * 60 * 1000
  const now = opts.now ?? Date.now
  /** @type {string[]} */
  const removed = []
  /** @type {import('node:fs').Dirent[]} */
  let children
  try {
    children = readdirSync(root, { withFileTypes: true })
  } catch {
    return removed
  }
  for (const child of children) {
    if (!child.isDirectory() || !child.name.startsWith('.staging-')) continue
    const path = join(root, child.name)
    try {
      if (now() - statSync(path).mtimeMs > maxAgeMs) {
        rmSync(path, { recursive: true, force: true })
        removed.push(path)
      }
    } catch {}
  }
  return removed
}

/**
 * @param {number|undefined} arch
 * @returns {string}
 */
function archOrDefault(arch) {
  return arch ?? process.arch
}

/**
 * @param {string} path
 * @param {string} entry
 * @returns {void}
 */
function assertRegularFile(path, entry) {
  let st
  try {
    st = lstatSync(path)
  } catch {
    throw binaryError('E_BINARY_ARCHIVE', `The archive entry ${JSON.stringify(entry)} was not extracted.`,
      'Extraction produced nothing. Retry the install or use another source.')
  }
  if (st.isSymbolicLink()) {
    throw binaryError('E_BINARY_ARCHIVE', `The archive entry ${JSON.stringify(entry)} is a symlink, not a regular file.`,
      'Refusing to install a linked binary from an archive. Use another source.')
  }
  if (!st.isFile()) {
    throw binaryError('E_BINARY_ARCHIVE', `The archive entry ${JSON.stringify(entry)} is not a regular file.`,
      'Refusing to install a non-file from an archive.')
  }
  if (st.size < MIN_BINARY_BYTES) {
    throw binaryError('E_BINARY_ARCHIVE',
      `The extracted ${JSON.stringify(entry)} is only ${st.size} bytes.`,
      'The archive is truncated. Retry the install.')
  }
}

/** Smallest plausible size for a static ffmpeg/ffprobe, in bytes. */
const MIN_BINARY_BYTES = 1024

/**
 * @param {string} text
 * @returns {string} First non-empty line, trimmed.
 */
function firstLine(text) {
  const line = String(text ?? '').split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  return line.trim()
}
