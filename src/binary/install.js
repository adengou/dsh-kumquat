/**
 * End-to-end "make FFmpeg exist" flow: status → resolve → download → verify →
 * extract → `-version` → atomic commit.
 *
 * Everything happens under `<root>` so the final rename stays on one volume, and
 * every failure path removes the download and the staging directory. The only
 * files that ever appear in `<root>/<platform>-<arch>/` are binaries that already
 * answered `-version` correctly.
 */

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { binaryError } from './errors.js'
import { download } from './download.js'
import { commitBinaries, createStagingDir, extractBinaries, removeStagingDir, sweepStaleStaging } from './extract.js'
import { readVersion } from './exec.js'
import { getSources, resolveSource } from './sources.js'
import { DEFAULT_MAX_BYTES } from './sources.js'
import { defaultRoot, rememberRoot, status } from './status.js'

/**
 * @typedef {object} InstallProgress
 * @property {'resolve'|'download'|'extract'|'verify'|'commit'|'done'} phase
 * @property {string} [sourceId]
 * @property {number} [received]
 * @property {number|null} [total]
 * @property {number|null} [percent]
 */

/**
 * @typedef {object} InstallResult
 * @property {string} ffmpeg Absolute path to the installed ffmpeg.
 * @property {string} ffprobe Absolute path to the installed ffprobe.
 * @property {string} version Version string from `ffmpeg -version`.
 * @property {'downloaded'|'cached'} source `cached` when nothing had to be fetched.
 * @property {string} platform
 * @property {string} arch
 * @property {string} [sourceId] Which entry of `sources.js` produced the binaries.
 * @property {number} [bytes] Archive size actually downloaded.
 * @property {string} [sha256] Digest of the archive that was installed.
 * @property {number} [elapsedMs] Wall time of the whole install.
 */

/**
 * Install FFmpeg into `<root>/<platform>-<arch>/`, reusing an existing install.
 *
 * @param {object} opts
 * @param {string} opts.root Bin root, e.g. `<config>/bin`.
 * @param {(p: InstallProgress) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @param {string} [opts.platform] Defaults to `process.platform`.
 * @param {string} [opts.arch] Defaults to `process.arch`.
 * @param {typeof fetch} [opts.fetchImpl] Injectable fetch (tests).
 * @param {number} [opts.maxBytes] Download cap, default 200 MB.
 * @param {string} [opts.tarPath] Override the `tar` executable.
 * @param {(exe: string, opts?: { tool?: string }) => Promise<string|null>} [opts.readVersionImpl]
 *   Injectable `-version` runner (tests).
 * @returns {Promise<InstallResult>}
 */
export async function installBinary(opts) {
  const startedAt = Date.now()
  const root = opts.root ?? defaultRoot()
  if (typeof root !== 'string' || root.length === 0) {
    throw binaryError('E_BINARY_IO', 'installBinary() needs a root directory.', 'Internal caller bug.')
  }
  rememberRoot(root)
  const platform = opts.platform ?? process.platform
  const arch = opts.arch ?? process.arch
  const onProgress = opts.onProgress ?? (() => {})
  const signal = opts.signal
  const readVersionImpl = opts.readVersionImpl ?? readVersion
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES

  if (signal?.aborted) throw cancelled()

  const current = await status({ root, platform, arch, readVersionImpl })
  if (current.state === 'cached') {
    return {
      ffmpeg: /** @type {string} */ (current.ffmpeg),
      ffprobe: /** @type {string} */ (current.ffprobe),
      version: /** @type {string} */ (current.version),
      source: /** @type {'cached'} */ ('cached'),
      platform,
      arch,
      // Extra fields the Host's `normalizeStatus(result)` reads directly.
      state: /** @type {'cached'} */ ('cached'),
      path: /** @type {string} */ (current.path),
      sizeHint: current.sizeHint,
      elapsedMs: Date.now() - startedAt,
    }
  }

  const all = getSources(platform, arch)
  const candidates = all.filter((s) => s.autoInstall)
  if (candidates.length === 0) {
    const manual = all.find((s) => s.manual)?.manual
    throw binaryError('E_BINARY_UNSUPPORTED',
      `Kumquat cannot install FFmpeg automatically on ${platform}/${arch}.`,
      manual ?? 'No FFmpeg build for this platform publishes a SHA-256, so nothing is downloaded. ' +
        'Install FFmpeg yourself or set `ffmpegPath`.')
  }

  /** @type {{ id: string, error: Error & { code?: string, hint?: string } }[]} */
  const failures = []

  // A previous run killed mid-install leaves `.staging-*` behind; clear the old ones.
  sweepStaleStaging(root)

  for (const candidate of candidates) {
    if (signal?.aborted) throw cancelled()
    try {
      return await installOne(candidate, {
        root, platform, arch, onProgress, signal, maxBytes,
        fetchImpl: opts.fetchImpl, tarPath: opts.tarPath, readVersionImpl, startedAt,
      })
    } catch (err) {
      const e = /** @type {any} */ (err)
      if (e?.code === 'E_BINARY_CANCEL') throw err
      if (e?.code === 'E_BINARY_UNSUPPORTED') throw err
      failures.push({ id: candidate.id, error: e })
    }
  }

  const last = failures[failures.length - 1]
  const tried = failures.map((f) => f.id).join(', ')
  throw binaryError('E_BINARY_SOURCE',
    `Every FFmpeg source failed (${tried}). Last error: ${last?.error?.message ?? 'unknown'}`,
    last?.error?.hint ?? 'Retry later, or install FFmpeg yourself and point `ffmpegPath` at it.',
    { cause: last?.error })
}

/**
 * One candidate, end to end.
 *
 * @param {import('./sources.js').BinarySource} candidate
 * @param {object} ctx
 * @returns {Promise<InstallResult>}
 */
async function installOne(candidate, ctx) {
  const { root, platform, arch, onProgress, signal, maxBytes, fetchImpl, tarPath, readVersionImpl, startedAt } = ctx

  onProgress({ phase: 'resolve', sourceId: candidate.id })
  const resolved = await resolveSource(candidate, { fetchImpl, signal })
  if (!resolved) {
    throw binaryError('E_BINARY_SOURCE',
      `No verifiable SHA-256 is available for ${candidate.id}.`,
      'Sources without a checksum are never installed automatically (D8).')
  }

  const staging = createStagingDir(root)
  // The archive lives in a stable cache path, not in the staging dir, so a dropped
  // connection can be resumed by the next attempt instead of restarting 110 MB.
  const cacheDir = join(root, '.downloads')
  const ext = candidate.format === 'zip' ? 'zip' : 'tar.xz'
  const archivePath = join(cacheDir, `${resolved.sha256.slice(0, 16)}.${ext}`)
  let downloaded = 0
  let digest = ''
  let succeeded = false
  /** @type {any} */
  let failure

  try {
    const result = await download(resolved.url, {
      dest: archivePath,
      expectedSha256: resolved.sha256,
      expectedBytes: resolved.size,
      maxBytes,
      signal,
      fetchImpl,
      resume: true,
      onProgress: (p) => onProgress({ phase: 'download', sourceId: candidate.id, received: p.received, total: p.total, percent: p.percent }),
    })
    downloaded = result.bytes
    digest = result.sha256

    onProgress({ phase: 'extract', sourceId: candidate.id })
    const files = await extractBinaries(archivePath, {
      stagingDir: join(staging, 'out'),
      platform,
      tarPath,
    })

    const sameTarget = platform === process.platform && arch === process.arch
    if (sameTarget) {
      onProgress({ phase: 'verify', sourceId: candidate.id })
      const ffmpegVersion = await readVersionImpl(files.ffmpeg, { tool: 'ffmpeg' })
      const ffprobeVersion = await readVersionImpl(files.ffprobe, { tool: 'ffprobe' })
      if (!ffmpegVersion || !ffprobeVersion) {
        throw binaryError('E_BINARY_VERIFY',
          `The extracted ${platform} binaries do not run: ${!ffmpegVersion ? 'ffmpeg' : 'ffprobe'} -version failed.`,
          'The build is corrupt or built for another CPU. Retry, or install FFmpeg manually.')
      }
    }

    onProgress({ phase: 'commit', sourceId: candidate.id })
    const committed = await commitBinaries({ stagingDir: staging, root, platform, arch, files })

    const after = await status({ root, platform, arch, readVersionImpl })
    if (after.state !== 'cached') {
      throw binaryError('E_BINARY_VERIFY',
        `The binaries were copied to ${committed.dir} but do not pass the post-install check (${after.reason}).`,
        after.hint ?? 'Delete the directory and retry the install.')
    }

    const installed = {
      ffmpeg: committed.ffmpeg,
      ffprobe: committed.ffprobe,
      version: /** @type {string} */ (after.version),
      source: /** @type {'downloaded'} */ ('downloaded'),
      platform,
      arch,
      sourceId: candidate.id,
      bytes: downloaded,
      sha256: digest,
      // Extra fields the Host's `normalizeStatus(result)` reads directly.
      state: /** @type {'cached'} */ ('cached'),
      path: committed.ffmpeg,
      sizeHint: after.sizeHint,
      elapsedMs: Date.now() - startedAt,
    }
    onProgress({ phase: 'done', sourceId: candidate.id, received: downloaded, total: downloaded, percent: 100 })
    succeeded = true
    return installed
  } catch (err) {
    failure = err
    throw err
  } finally {
    removeStagingDir(staging)
    // Keep the archive only when the bytes are still worth resuming; a checksum
    // mismatch or an oversized body means the file itself is wrong.
    const keep = failure?.code === 'E_BINARY_NETWORK' ||
      failure?.code === 'E_BINARY_TIMEOUT' ||
      failure?.code === 'E_BINARY_CANCEL'
    if (succeeded || !keep) {
      try {
        rmSync(archivePath, { force: true })
      } catch {}
    }
  }
}

/** @returns {Error} */
function cancelled() {
  return binaryError('E_BINARY_CANCEL', 'FFmpeg installation cancelled.', 'Nothing was installed.')
}
