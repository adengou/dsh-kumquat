/**
 * FFmpeg build sources, one entry per platform/arch.
 *
 * Rules baked into this table (see DECISIONS.md D8):
 *  - https only, host must be on {@link ALLOWED_HOSTS};
 *  - a source without a SHA-256 never enters the automatic install path
 *    (`autoInstall: false`), it only contributes manual instructions;
 *  - sizes are `sizeHint`, the byte count of the artefact at verification time.
 *
 * Verification method, {@link CHECKED_ON} = 2026-11-16:
 *  - `GET` with `Range: bytes=0-0` against every `url`/`checksumUrl`; the returned
 *    `Content-Range` total is the size recorded here, `Last-Modified` is noted per entry;
 *  - the checksum response body was read in full and the digest recorded below;
 *  - for BtbN/`github.com` assets the digest comes from the GitHub REST API
 *    (`releases/latest` → `assets[].digest`, prefixed `sha256:`) and was cross-checked
 *    against the same release's `checksums.sha256` file.
 *
 * Caveat worth knowing: gyan.dev publishes a rolling "release" alias, so
 * `sha256` below goes stale on their next rebuild — `checksumUrl` is always
 * re-read at install time and wins over the pinned value. BtbN's `-latest`
 * assets rotate every build for the same reason, which is why those entries
 * resolve through the GitHub API at install time.
 */

import { binaryError } from './errors.js'

/** Date (UTC+8) every URL and digest in this file was last verified. */
export const CHECKED_ON = '2026-11-16'

/** Hard ceiling for one download; D8 says 200 MB. */
export const DEFAULT_MAX_BYTES = 200 * 1024 * 1024

/**
 * Hosts a download may start from or redirect to. Keep this list small.
 * `release-assets.githubusercontent.com` / `objects.githubusercontent.com` are
 * GitHub's release storage hosts; `api.github.com` serves the asset bytes too.
 */
export const ALLOWED_HOSTS = new Set([
  'www.gyan.dev',
  'gyan.dev',
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'johnvansickle.com',
])

/**
 * @typedef {object} GithubAssetRef
 * @property {string} repo "owner/name"
 * @property {string} tag Release tag that rolls, e.g. "latest".
 * @property {string} asset Exact asset file name inside that release.
 */

/**
 * @typedef {object} BinarySource
 * @property {string} id Stable id, unique per platform/arch candidate.
 * @property {string} platform `process.platform` value.
 * @property {string} arch `process.arch` value.
 * @property {string|null} url Download URL, null when the platform has no automatic source.
 * @property {'zip'|'tar.xz'} format Archive format, used to pick a temp file suffix.
 * @property {string|null} sha256 Pinned digest as verified on {@link CHECKED_ON}.
 * @property {string|null} checksumUrl Where a live digest can be re-read.
 * @property {number} sizeHint Bytes at verification time.
 * @property {string} note Human note: build flavour, verification evidence.
 * @property {boolean} autoInstall False means "never downloaded automatically".
 * @property {string} [manual] Manual instructions when `autoInstall` is false.
 * @property {GithubAssetRef} [github] Resolved live through the GitHub API.
 */

/** @type {BinarySource[]} */
export const SOURCES = [
  {
    id: 'win32-x64-gyan-essentials',
    platform: 'win32',
    arch: 'x64',
    url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
    format: 'zip',
    sha256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba',
    checksumUrl: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256',
    sizeHint: 114_768_076,
    note:
      'gyan.dev essentials build (GPL, includes libx264/libx265). Preferred on Windows: ' +
      'the .sha256 file is served next to the zip and is re-read on every install. ' +
      'Verified 2026-11-16: alias resolved to ffmpeg-9.0.2-essentials_build.zip, ' +
      '114,768,076 bytes, Last-Modified 2026-09-19, `.sha256` body is one bare ' +
      '64-char hex digest (no filename column).',
    autoInstall: true,
  },
  {
    id: 'win32-x64-btbn-gpl',
    platform: 'win32',
    arch: 'x64',
    url: 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-win64-gpl-9.0.zip',
    format: 'zip',
    sha256: '27d00343f59fab96b58413e92998dacee17f549fbe730899646cca40de681080',
    checksumUrl: 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/latest/checksums.sha256',
    sizeHint: 194_988_423,
    github: { repo: 'FFmpeg-Builds/FFmpeg-Builds', tag: 'latest', asset: 'ffmpeg-n9.0-latest-win64-gpl-9.0.zip' },
    note:
      'BtbN GPL static build, n9.0 release line. Fallback for Windows. ' +
      'Verified 2026-11-16 through api.github.com (release id 446062914): ' +
      'asset size 194,988,423, digest sha256 27d00343…1080, same digest appears in ' +
      'the release checksums.sha256. Note: github.com itself was unreachable from the ' +
      'test machine (connect timeout) while api.github.com worked, so this entry is ' +
      'resolved through the API and downloaded from the asset endpoint.',
    autoInstall: true,
  },
  {
    id: 'win32-arm64-btbn-gpl',
    platform: 'win32',
    arch: 'arm64',
    url: 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-winarm64-gpl-9.0.zip',
    format: 'zip',
    sha256: 'd24cf43b959abb3fab64be4d226a4d77f3cf494346268987e80b9a0ef6a05801',
    checksumUrl: 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/latest/checksums.sha256',
    sizeHint: 136_234_281,
    github: { repo: 'FFmpeg-Builds/FFmpeg-Builds', tag: 'latest', asset: 'ffmpeg-n9.0-latest-winarm64-gpl-9.0.zip' },
    note:
      'BtbN GPL static build for Windows on ARM64. Verified 2026-11-16 via ' +
      'api.github.com asset digest + release checksums.sha256 (size 136,234,281). ' +
      'Not executed on hardware in this project — no ARM64 Windows machine available.',
    autoInstall: true,
  },
  {
    id: 'linux-x64-btbn-gpl',
    platform: 'linux',
    arch: 'x64',
    url: 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-linux64-gpl-9.0.tar.xz',
    format: 'tar.xz',
    sha256: '725c3a9cd9561ac30ddae8b2322045e9fd115dfa0a5577d9baaa0bebf6ca0e84',
    checksumUrl: 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/latest/checksums.sha256',
    sizeHint: 152_702_564,
    github: { repo: 'FFmpeg-Builds/FFmpeg-Builds', tag: 'latest', asset: 'ffmpeg-n9.0-latest-linux64-gpl-9.0.tar.xz' },
    note:
      'BtbN GPL static build, n9.0 release line, glibc. Verified 2026-11-16 via ' +
      'api.github.com asset digest sha256 725c3a9c…0e84 and release checksums.sha256 ' +
      '(152,702,564 bytes). Not executed on Linux in this project.',
    autoInstall: true,
  },
  {
    id: 'linux-x64-johnvansickle',
    platform: 'linux',
    arch: 'x64',
    url: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
    format: 'tar.xz',
    sha256: null,
    checksumUrl: null,
    sizeHint: 41_888_096,
    note:
      'johnvansickle static build. Verified 2026-11-16: 41,888,096 bytes, ' +
      'Last-Modified 2024-08-24, but the only published digest is an MD5 ' +
      '(`ffmpeg-release-amd64-static.tar.xz.md5` = 7fa72b652e19bf84c9461e332ea1cdf3). ' +
      'MD5 is a weak checksum, so per D8 this source never enters the automatic ' +
      'install path; it is listed as manual guidance only.',
    autoInstall: false,
    manual:
      'Download https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz, ' +
      'compare it with the published .md5, then unpack and put `ffmpeg` + `ffprobe` on PATH. ' +
      'Kumquat cannot verify this download automatically (MD5 only).',
  },
  {
    id: 'linux-arm64-btbn-gpl',
    platform: 'linux',
    arch: 'arm64',
    url: 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-linuxarm64-gpl-9.0.tar.xz',
    format: 'tar.xz',
    sha256: '69048af5505d945513904bcb8d150f0480ed3e03b419b672341638c21cf63390',
    checksumUrl: 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/latest/checksums.sha256',
    sizeHint: 128_361_060,
    github: { repo: 'FFmpeg-Builds/FFmpeg-Builds', tag: 'latest', asset: 'ffmpeg-n9.0-latest-linuxarm64-gpl-9.0.tar.xz' },
    note:
      'BtbN GPL static build for linux/arm64. Verified 2026-11-16 via ' +
      'api.github.com asset digest sha256 69048af5…3390 and release checksums.sha256 ' +
      '(128,361,060 bytes). Not executed on ARM64 Linux in this project.',
    autoInstall: true,
  },
  {
    id: 'linux-arm64-johnvansickle',
    platform: 'linux',
    arch: 'arm64',
    url: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz',
    format: 'tar.xz',
    sha256: null,
    checksumUrl: null,
    sizeHint: 19_337_412,
    note:
      'johnvansickle arm64 static build. Verified 2026-11-16: 19,337,412 bytes, ' +
      'Last-Modified 2024-08-24. Only an MD5 is published, so it stays out of the ' +
      'automatic install path (same rule as the amd64 entry).',
    autoInstall: false,
    manual:
      'Download https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz, ' +
      'compare it with the published .md5, then unpack and put `ffmpeg` + `ffprobe` on PATH.',
  },
  {
    id: 'darwin-x64-unsupported',
    platform: 'darwin',
    arch: 'x64',
    url: null,
    format: 'zip',
    sha256: null,
    checksumUrl: null,
    sizeHint: 26_198_325,
    note:
      'No macOS source with a SHA-256 could be verified on 2026-11-16, so macOS is ' +
      'explicitly unsupported for automatic install (D8: no checksum, no auto-install). ' +
      'evermeet.cx serves ffmpeg-9.0.2.zip (26,198,325 bytes) with a GPG `.sig` only — ' +
      'no SHA-256, and verifying GPG signatures would need an extra binary. ' +
      'BtbN publishes no macOS assets. ffmpeg.martin-riedl.de was unreachable from the ' +
      'test machine (connect timeout), so it could not be verified at all.',
    autoInstall: false,
    manual:
      'Install FFmpeg yourself, then Kumquat will find it: run `brew install ffmpeg` ' +
      '(Apple Silicon: /opt/homebrew/bin, Intel: /usr/local/bin) or download the zip from ' +
      'https://evermeet.cx/ffmpeg/ and verify its `.sig` with `gpg --verify`. ' +
      'You can also point Kumquat at an existing binary with the `ffmpegPath` setting.',
  },
  {
    id: 'darwin-arm64-unsupported',
    platform: 'darwin',
    arch: 'arm64',
    url: null,
    format: 'zip',
    sha256: null,
    checksumUrl: null,
    sizeHint: 26_198_325,
    note:
      'Same finding as darwin-x64 on 2026-11-16: no verifiable SHA-256 source, so no ' +
      'automatic install on macOS/arm64 either.',
    autoInstall: false,
    manual:
      'Run `brew install ffmpeg` (installs to /opt/homebrew/bin) or set `ffmpegPath` ' +
      'to an existing ffmpeg binary. Automatic download is disabled on macOS because ' +
      'no source publishes a SHA-256.',
  },
]

/**
 * @param {string} platform
 * @param {string} arch
 * @returns {BinarySource[]} Candidates in preference order (may be a single unsupported entry).
 */
export function getSources(platform, arch) {
  return SOURCES.filter((s) => s.platform === platform && s.arch === arch)
}

/**
 * Best candidate for a platform/arch pair.
 *
 * @param {string} platform
 * @param {string} arch
 * @returns {BinarySource|null}
 */
export function getSource(platform, arch) {
  const list = getSources(platform, arch)
  if (list.length === 0) return null
  return list.find((s) => s.autoInstall) ?? list[0]
}

/**
 * https + whitelisted host.
 *
 * @param {string|null|undefined} raw
 * @returns {boolean}
 */
export function isAllowedUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return false
  let url
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  return ALLOWED_HOSTS.has(url.hostname.toLowerCase())
}

/**
 * Like {@link isAllowedUrl} but throws a coded error.
 *
 * @param {string} raw
 * @returns {URL}
 */
export function assertAllowedUrl(raw) {
  if (!isAllowedUrl(raw)) {
    let host = ''
    try {
      host = new URL(raw).hostname
    } catch {}
    throw binaryError(
      'E_BINARY_SOURCE',
      `Refusing to download from ${host || raw}: only https URLs on the known FFmpeg mirror allow-list are allowed.`,
      'If you trust another mirror, add its host to ALLOWED_HOSTS in src/binary/sources.js.',
    )
  }
  return new URL(raw)
}

/**
 * Pull a SHA-256 out of a checksum file body.
 *
 * Understands the three formats the mirrors actually use:
 *  - `sha256sum` output: `<64 hex>  <filename>`;
 *  - `shasum -a 256` BSD style: `SHA256 (<filename>) = <64 hex>`;
 *  - a bare 64-char hex digest with no filename at all (gyan.dev).
 *
 * @param {string} text
 * @param {string} [fileName] Preferred file name; when omitted the first digest is returned.
 * @returns {string|null} Lower-case hex digest.
 */
export function parseChecksumText(text, fileName) {
  const body = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (body.length === 0) return null

  const bare = /^[0-9a-f]{64}$/i.exec(body)
  if (bare) return bare[0].toLowerCase()

  const wanted = fileName ? fileName.split('/').pop() : null
  /** @type {string|null} */
  let first = null
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const bsd = /^SHA256\s*\((.+)\)\s*=\s*([0-9a-f]{64})$/i.exec(trimmed)
    if (bsd) {
      const digest = bsd[2].toLowerCase()
      if (!wanted || baseName(bsd[1].trim()) === wanted) return digest
      first ??= digest
      continue
    }

    const gnu = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(trimmed)
    if (gnu) {
      const digest = gnu[1].toLowerCase()
      if (!wanted || baseName(gnu[2].trim()) === wanted) return digest
      first ??= digest
    }
  }
  return first
}

/**
 * @param {string} name
 * @returns {string} Last path segment of a forward- or backslash path.
 */
export function baseName(name) {
  const segments = String(name).split(/[/\\]/)
  return segments[segments.length - 1] ?? ''
}

/**
 * Fetch with a timeout, merging the caller's AbortSignal.
 *
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 * @param {{ signal?: AbortSignal, timeoutMs?: number, headers?: Record<string,string> }} [opts]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(fetchImpl, url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 20_000
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal
  try {
    return await fetchImpl(url, { redirect: 'follow', signal, headers: opts.headers })
  } catch (err) {
    if (opts.signal?.aborted) {
      throw binaryError('E_BINARY_CANCEL', 'Installation cancelled.', 'Nothing was changed on disk.')
    }
    throw binaryError(
      'E_BINARY_NETWORK',
      `Cannot reach ${new URL(url).hostname}: ${String(/** @type {any} */ (err)?.message || err)}`,
      'Check the network connection or proxy, then retry; or set `ffmpegPath` to a local FFmpeg.',
      { cause: err },
    )
  }
}

/**
 * Read the live SHA-256 of an artefact from its `checksumUrl`.
 *
 * @param {BinarySource} source
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal, fileName?: string }} [opts]
 * @returns {Promise<string|null>}
 */
export async function fetchChecksum(source, opts = {}) {
  if (!source.checksumUrl) return null
  assertAllowedUrl(source.checksumUrl)
  const fetchImpl = opts.fetchImpl ?? fetch
  const res = await fetchWithTimeout(fetchImpl, source.checksumUrl, { signal: opts.signal, timeoutMs: 15_000 })
  if (!res.ok) {
    throw binaryError('E_BINARY_HTTP', `Checksum file returned HTTP ${res.status}.`,
      'The mirror is unhappy. Retry later or use another source.')
  }
  const text = await res.text()
  const fileName = opts.fileName ?? baseName(new URL(source.url ?? '').pathname)
  return parseChecksumText(text, fileName)
}

/**
 * @typedef {object} ResolvedSource
 * @property {string} url Downgraded-to-actual download URL.
 * @property {string} sha256 Expected digest (never empty — callers must not proceed without one).
 * @property {number} size Expected byte count, used for progress before headers arrive.
 * @property {'live-checksum'|'pinned'|'github-digest'} via Where the digest came from.
 */

/**
 * Turn a source entry into a concrete `{ url, sha256, size }` triple.
 *
 * Returns null when the source has no SHA-256 at all — that is the switch that
 * keeps unverifiable mirrors out of the automatic install path.
 *
 * @param {BinarySource} source
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal }} [opts]
 * @returns {Promise<ResolvedSource|null>}
 */
export async function resolveSource(source, opts = {}) {
  if (!source.autoInstall || !source.url) return null
  assertAllowedUrl(source.url)
  const fetchImpl = opts.fetchImpl ?? fetch

  if (source.github) {
    const fromApi = await resolveGithubAsset(source.github, { fetchImpl, signal: opts.signal })
    if (fromApi) return fromApi
  }

  if (source.checksumUrl) {
    try {
      const live = await fetchChecksum(source, { fetchImpl, signal: opts.signal })
      if (live) {
        return { url: source.url, sha256: live, size: source.sizeHint, via: 'live-checksum' }
      }
    } catch {
      // fall through to the pinned digest; a stale pin fails closed at checksum time
    }
  }

  if (source.sha256) {
    return { url: source.url, sha256: source.sha256, size: source.sizeHint, via: 'pinned' }
  }
  return null
}

/**
 * Resolve a rolling GitHub release asset into a stable URL plus its live digest.
 * Uses `api.github.com` because `github.com` itself is unreachable on some networks
 * (it timed out from the machine this was verified on) while the API answered.
 *
 * @param {GithubAssetRef} ref
 * @param {{ fetchImpl: typeof fetch, signal?: AbortSignal }} opts
 * @returns {Promise<ResolvedSource|null>} null when the asset cannot be resolved.
 */
async function resolveGithubAsset(ref, opts) {
  const apiUrl = `https://api.github.com/repos/${ref.repo}/releases/tags/${encodeURIComponent(ref.tag)}`
  let res
  try {
    res = await fetchWithTimeout(opts.fetchImpl, apiUrl, {
      signal: opts.signal,
      timeoutMs: 20_000,
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'kumquat-binary' },
    })
  } catch (err) {
    if (/** @type {any} */ (err)?.code === 'E_BINARY_CANCEL') throw err
    return null
  }
  if (!res.ok) return null

  let json
  try {
    json = await res.json()
  } catch {
    return null
  }
  const assets = Array.isArray(json?.assets) ? json.assets : []
  const asset = assets.find((a) => a && a.name === ref.asset)
  if (!asset || typeof asset.id !== 'number') return null

  const digest = typeof asset.digest === 'string' ? asset.digest : ''
  const sha256 = digest.startsWith('sha256:') ? digest.slice(7).toLowerCase() : ''
  if (!/^[0-9a-f]{64}$/.test(sha256)) return null

  return {
    url: `https://api.github.com/repos/${ref.repo}/releases/assets/${asset.id}`,
    sha256,
    size: typeof asset.size === 'number' ? asset.size : 0,
    via: 'github-digest',
  }
}
