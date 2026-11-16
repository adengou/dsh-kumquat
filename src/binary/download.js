/**
 * Streaming HTTPS download with an incremental SHA-256, hard byte ceiling and
 * optional resume.
 *
 * Guarantees:
 *  - only `https:` URLs on the `sources.js` allow-list, and the final URL after
 *    redirects is checked too;
 *  - bytes go straight to `<dest>.part` while the digest is computed, so a 110 MB
 *    archive never sits in memory and progress is real (no "download then write");
 *  - `resume: true` reuses an existing `.part` with an HTTP `Range` request, so a
 *    flaky link costs the remaining bytes instead of the whole archive;
 *  - aborting (or a size/checksum failure) removes the `.part` file; a network
 *    error keeps it when `resume` is on, because that partial file is the point;
 *  - exceeding `maxBytes` fails as soon as the byte count crosses the ceiling.
 */

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { binaryError } from './errors.js'
import { DEFAULT_MAX_BYTES, assertAllowedUrl } from './sources.js'

/**
 * @typedef {object} DownloadProgress
 * @property {number} received Bytes on disk so far (including a resumed prefix).
 * @property {number|null} total Expected total bytes, null when unknown.
 * @property {number|null} percent 0–100, null when `total` is unknown.
 */

/**
 * @typedef {object} DownloadResult
 * @property {string} path Final path (the `.part` file was renamed onto it).
 * @property {number} bytes Total bytes written.
 * @property {string} sha256 Hex digest of the file just written.
 * @property {boolean} resumed Whether a previous partial file was continued.
 */

/**
 * Download `url` to `dest`.
 *
 * @param {string} url
 * @param {object} opts
 * @param {string} opts.dest Target file path.
 * @param {(p: DownloadProgress) => void} [opts.onProgress] Called at most ~10×/s plus once at the end.
 * @param {AbortSignal} [opts.signal] Cancels the transfer and deletes the partial file.
 * @param {string} [opts.expectedSha256] Hex digest the file must match.
 * @param {number} [opts.maxBytes] Hard cap; exceeding it fails without touching `dest`.
 * @param {typeof fetch} [opts.fetchImpl] Injectable fetch (tests).
 * @param {number} [opts.expectedBytes] Size to report as `total` before headers arrive.
 * @param {number} [opts.timeoutMs] Connect + response-header timeout. Default 30000.
 * @param {number} [opts.idleTimeoutMs] Fail when no byte arrives for this long. Default 60000.
 * @param {boolean} [opts.resume] Continue an existing `<dest>.part` with a Range request.
 * @returns {Promise<DownloadResult>}
 */
export async function download(url, opts) {
  const {
    dest,
    onProgress = () => {},
    signal,
    expectedSha256,
    maxBytes = DEFAULT_MAX_BYTES,
    fetchImpl = fetch,
    expectedBytes,
    timeoutMs = 30_000,
    resume = false,
  } = opts

  if (typeof dest !== 'string' || dest.length === 0) {
    throw binaryError('E_BINARY_IO', 'download() needs a destination path.', 'Internal caller bug.')
  }
  if (typeof maxBytes !== 'number' || !Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw binaryError('E_BINARY_IO', 'maxBytes must be a positive number.', 'Internal caller bug.')
  }
  assertAllowedUrl(url)
  if (signal?.aborted) throw cancelled()

  const partPath = `${dest}.part`
  await mkdir(dirname(dest), { recursive: true })

  /** Bytes already in `.part` that we intend to continue from. */
  let offset = 0
  if (resume) offset = sizeOrZero(partPath)
  if (offset === 0) await rm(partPath, { force: true })

  /**
   * Remove the partial file, ignoring errors. Retried a few times because on
   * Windows a just-destroyed write stream may still hold the handle for a tick.
   */
  const cleanup = async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rm(partPath, { force: true })
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 40))
      }
    }
  }

  const host = new URL(url).hostname.toLowerCase()
  /** @type {Record<string,string>} */
  const headers = {
    'user-agent': 'kumquat-binary/1 (FFmpeg bootstrap)',
    // The GitHub asset API only returns bytes with this Accept value.
    accept: host === 'api.github.com' ? 'application/octet-stream' : '*/*',
  }
  if (offset > 0) headers.range = `bytes=${offset}-`

  // One controller for the whole transfer. The timeout covers connect + response
  // headers only; a 110 MB body would otherwise trip a 30 s wall-clock limit
  // mid-stream. While streaming, the same timer is re-armed per chunk, so a
  // stalled socket still fails instead of hanging forever.
  const controller = new AbortController()
  const IDLE_TIMEOUT_MS = opts.idleTimeoutMs ?? 60_000
  /** @type {'none'|'headers'|'idle'} */
  let timeoutKind = 'none'
  /** @type {NodeJS.Timeout|undefined} */
  let timer

  const armTimer = (ms, kind) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timeoutKind = kind
      controller.abort()
    }, ms)
    if (typeof timer.unref === 'function') timer.unref()
  }
  const disarmTimer = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  const onCancel = () => controller.abort()
  if (signal) signal.addEventListener('abort', onCancel, { once: true })
  const release = () => {
    disarmTimer()
    if (signal) signal.removeEventListener('abort', onCancel)
  }

  armTimer(timeoutMs, 'headers')

  /** @type {Response} */
  let res
  try {
    res = await fetchImpl(url, { redirect: 'follow', signal: controller.signal, headers })
  } catch (err) {
    release()
    await cleanup()
    if (signal?.aborted) throw cancelled()
    if (timeoutKind === 'headers') {
      throw binaryError('E_BINARY_TIMEOUT', `Download did not start within ${timeoutMs}ms.`,
        'The mirror is slow or blocked. Retry, or set `ffmpegPath` to a local FFmpeg.', { cause: err })
    }
    throw binaryError('E_BINARY_NETWORK',
      `Cannot download ${url}: ${String(/** @type {any} */ (err)?.message || err)}`,
      'Check the network connection or proxy, then retry.', { cause: err })
  }
  disarmTimer()

  // Redirects must stay on the allow-list (gyan.dev bounces to a versioned file).
  if (res.url && !assertAllowedUrlOrNull(res.url)) {
    release()
    await cleanup()
    throw binaryError('E_BINARY_SOURCE',
      `Download redirected to a host that is not allow-listed: ${res.url}`,
      'A mirror changed its storage host. Update ALLOWED_HOSTS after checking it by hand.')
  }

  const range = parseContentRange(res.headers.get('content-range'))
  let resumed = false
  if (offset > 0) {
    if (res.status === 206 && range && range.start === offset) {
      resumed = true
    } else if (res.status === 416) {
      release()
      await cleanup()
      throw binaryError('E_BINARY_NETWORK',
        `The server rejected the resume range (416); the partial file did not match the remote build.`,
        'The mirror published a new build. Retrying will download it from scratch.')
    } else if (res.status === 200) {
      // Server ignored Range: restart from zero rather than corrupt the file.
      offset = 0
      await rm(partPath, { force: true })
    } else {
      release()
      await cleanup()
      throw binaryError('E_BINARY_HTTP', `Download failed with HTTP ${res.status} ${res.statusText || ''}`.trim(),
        'The mirror rejected the request. Retry later or use another source.')
    }
  }

  if (!res.ok) {
    release()
    await cleanup()
    throw binaryError('E_BINARY_HTTP', `Download failed with HTTP ${res.status} ${res.statusText || ''}`.trim(),
      res.status === 404
        ? 'The mirror no longer serves this build. Update the source entry in src/binary/sources.js.'
        : 'The mirror rejected the request. Retry later or use another source.')
  }
  if (!res.body) {
    release()
    await cleanup()
    throw binaryError('E_BINARY_NETWORK', 'The server sent an empty body.', 'Retry or use another source.')
  }

  const bodyLength = parseContentLength(res.headers.get('content-length'))
  const declaredTotal = range?.total ?? (bodyLength !== null ? bodyLength + offset : null)
  const total = declaredTotal ?? (typeof expectedBytes === 'number' && expectedBytes > 0 ? expectedBytes : null)

  if (declaredTotal !== null && declaredTotal > maxBytes) {
    release()
    await cleanup()
    throw tooLarge(declaredTotal, maxBytes)
  }

  const hash = createHash('sha256')
  let received = offset
  try {
    if (offset > 0) {
      // Re-hash the prefix so the digest still covers the whole file.
      for await (const chunk of createReadStream(partPath)) hash.update(chunk)
    }
  } catch (err) {
    release()
    await cleanup()
    throw binaryError('E_BINARY_IO', `Cannot read the partial download: ${errText(err)}`,
      'Delete the partial file and retry.', { cause: err })
  }

  const out = createWriteStream(partPath, { flags: offset > 0 ? 'a' : 'w' })
  let lastEmit = 0
  /** @param {number} receivedBytes */
  const emit = (receivedBytes) => {
    try {
      onProgress({
        received: receivedBytes,
        total,
        percent: total ? Math.min(100, Math.round((receivedBytes / total) * 1000) / 10) : null,
      })
    } catch {}
  }
  emit(received)

  try {
    armTimer(IDLE_TIMEOUT_MS, 'idle')
    const source = Readable.fromWeb(/** @type {any} */ (res.body))
    await pipeline(
      source,
      async function* counter(stream) {
        for await (const chunk of stream) {
          if (signal?.aborted) throw cancelled()
          const buf = toBuffer(chunk)
          received += buf.length
          if (received > maxBytes) throw tooLarge(received, maxBytes)
          hash.update(buf)
          armTimer(IDLE_TIMEOUT_MS, 'idle')
          const now = Date.now()
          if (now - lastEmit >= 100) {
            lastEmit = now
            emit(received)
          }
          yield buf
        }
      },
      out,
    )
    disarmTimer()
  } catch (err) {
    out.destroy()
    disarmTimer()
    const resumeWorthy = /** @type {any} */ (err)?.code !== 'E_BINARY_TOO_LARGE' && !signal?.aborted
    if (!(resumeWorthy && resume)) await cleanup()
    else await new Promise((resolve) => setTimeout(resolve, 40))
    if (signal?.aborted) throw cancelled()
    if (/** @type {any} */ (err)?.code === 'E_BINARY_TOO_LARGE') throw err
    if (timeoutKind === 'idle') {
      throw binaryError('E_BINARY_TIMEOUT',
        `Download stalled for ${IDLE_TIMEOUT_MS}ms after ${received} of ${total ?? '?'} bytes.`,
        'The mirror stopped sending data. Retry.', { cause: err })
    }
    if (/** @type {any} */ (err)?.name === 'AbortError') {
      throw binaryError('E_BINARY_CANCEL', 'Download aborted.', 'Nothing was installed.')
    }
    throw binaryError('E_BINARY_NETWORK',
      `Download interrupted after ${received} of ${total ?? '?'} bytes: ${String(/** @type {any} */ (err)?.message || err)}`,
      'The connection dropped. Retry; the partial file is reused when resume is on.', { cause: err })
  } finally {
    release()
  }

  if (declaredTotal !== null && received !== declaredTotal) {
    await cleanup()
    throw binaryError('E_BINARY_NETWORK', `Truncated download: got ${received} of ${declaredTotal} bytes.`,
      'The mirror closed the connection early. Retry.')
  }

  const sha256 = hash.digest('hex')
  if (expectedSha256 && sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    await cleanup()
    throw binaryError('E_BINARY_CHECKSUM',
      `SHA-256 mismatch: expected ${expectedSha256.toLowerCase()}, got ${sha256}.`,
      'The file was tampered with or the mirror changed. Nothing was installed; retry to fetch a fresh copy.')
  }

  emit(received)
  await replaceFile(partPath, dest)

  return { path: dest, bytes: received, sha256, resumed }
}

/**
 * Rename `from` onto `to`, tolerating an existing destination (Windows rename is
 * not atomic over an existing file, so fall back to unlink + rename).
 *
 * @param {string} from
 * @param {string} to
 * @returns {Promise<void>}
 */
export async function replaceFile(from, to) {
  try {
    await rename(from, to)
    return
  } catch (err) {
    if (!['EEXIST', 'EPERM', 'EACCES'].includes(String(/** @type {any} */ (err)?.code))) throw err
  }
  await rm(to, { force: true })
  await rename(from, to)
}

/**
 * @param {string} path
 * @returns {number} File size, or 0 when it does not exist.
 */
function sizeOrZero(path) {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/**
 * @param {string} raw
 * @returns {{ start: number, end: number, total: number|null }|null}
 */
export function parseContentRange(raw) {
  if (!raw) return null
  const m = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(raw.trim())
  if (!m) return null
  return {
    start: Number.parseInt(m[1], 10),
    end: Number.parseInt(m[2], 10),
    total: m[3] === '*' ? null : Number.parseInt(m[3], 10),
  }
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
function assertAllowedUrlOrNull(raw) {
  try {
    assertAllowedUrl(raw)
    return true
  } catch {
    return false
  }
}

/**
 * @param {string|null} raw
 * @returns {number|null}
 */
function parseContentLength(raw) {
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * @param {unknown} chunk
 * @returns {Buffer}
 */
function toBuffer(chunk) {
  if (Buffer.isBuffer(chunk)) return chunk
  if (chunk instanceof Uint8Array) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  return Buffer.from(String(chunk))
}

/**
 * @param {number} got
 * @param {number} limit
 * @returns {Error & { code: 'E_BINARY_TOO_LARGE' }}
 */
function tooLarge(got, limit) {
  return /** @type {any} */ (binaryError('E_BINARY_TOO_LARGE',
    `Download exceeds the ${formatBytes(limit)} limit (${formatBytes(got)} so far).`,
    'FFmpeg builds are ~20–160 MB. A bigger response means the URL is wrong or the mirror misbehaves.'))
}

/** @returns {Error} */
function cancelled() {
  return binaryError('E_BINARY_CANCEL', 'Download cancelled.', 'Nothing was installed.')
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function errText(err) {
  return String(/** @type {any} */ (err)?.code || /** @type {any} */ (err)?.message || err)
}

/**
 * @param {number} bytes
 * @returns {string} e.g. "109.5 MB"
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '?'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${Math.round(mb * 10) / 10} MB`
  return `${Math.round((bytes / 1024) * 10) / 10} KB`
}
