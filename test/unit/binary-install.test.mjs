/**
 * Unit tests for src/binary/install.js — the full pipeline with a fake network.
 *
 * A tiny real `tar` archive stands in for the FFmpeg build, the fake `fetch`
 * serves it (and its checksum sidecar), and `-version` is injected. So the test
 * covers download → SHA-256 → `tar -tf` screening → extraction → commit → status
 * without touching the internet or executing an untrusted binary.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { runToFile } from '../../src/binary/exec.js'
import { installBinary } from '../../src/binary/install.js'
import { binaryNames, platformDir } from '../../src/binary/status.js'

const PLATFORM = process.platform
const ARCH = process.arch
const NAMES = binaryNames(PLATFORM)
/** The fake network only serves the gyan.dev entry, which exists for win32/x64. */
const CAN_USE_FAKE = PLATFORM === 'win32' && ARCH === 'x64'

/** @type {string} */
let work
/** @type {string} */
let archive
/** @type {string} */
let archiveSha
/** @type {boolean} */
let hasTar = true

before(async () => {
  work = mkdtempSync(join(tmpdir(), 'kumquat-install-'))
  const payload = join(work, 'payload')
  mkdirSync(join(payload, 'bin'), { recursive: true })
  // Larger than the 1 KiB sanity floor enforced by extract.js.
  writeFileSync(join(payload, 'bin', NAMES.ffmpeg), Buffer.alloc(4096, 0x11))
  writeFileSync(join(payload, 'bin', NAMES.ffprobe), Buffer.alloc(4096, 0x22))
  archive = join(work, 'fake-build.tar')
  const res = await runToFile('tar', ['-cf', archive, '-C', payload, 'bin']).catch(() => null)
  if (!res || res.code !== 0) {
    hasTar = false
    return
  }
  archiveSha = createHash('sha256').update(readFileSync(archive)).digest('hex')
})

after(() => {
  rmSync(work, { recursive: true, force: true })
})

/**
 * Fake network: checksum sidecars return `sha`, archive URLs return the tar.
 * @param {{ sha?: string }} [opts]
 */
function fakeFetch(opts = {}) {
  const calls = []
  /** @type {any} */
  const impl = async (url) => {
    const href = String(url)
    calls.push(href)
    if (href.endsWith('.sha256')) {
      return new Response(`${opts.sha ?? archiveSha}\n`, { status: 200 })
    }
    if (opts.sha && opts.sha !== archiveSha) {
      return new Response('not found', { status: 404 })
    }
    if (href.startsWith('https://www.gyan.dev/') && href.endsWith('.zip')) {
      const bytes = readFileSync(archive)
      return new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })
    }
    return new Response('nope', { status: 404 })
  }
  impl.calls = calls
  return impl
}

const okVersion = async (exe, o) => (o?.tool === 'ffprobe' ? '9.0.2-test' : '9.0.2-test')

describe('install: happy path', () => {

  test('downloads, verifies, extracts, runs -version and lands the binaries', async (t) => {
    if (!CAN_USE_FAKE) return t.skip('the fake gyan.dev source is win32/x64 only')
    if (!hasTar) return t.skip('system tar is unavailable')
    const root = join(work, 'root-happy')
    const fetchImpl = fakeFetch()
    /** @type {any[]} */
    const progress = []

    const result = await installBinary({
      root,
      platform: PLATFORM,
      arch: ARCH,
      fetchImpl,
      readVersionImpl: okVersion,
      onProgress: (p) => progress.push(p),
    })

    assert.equal(result.source, 'downloaded')
    assert.equal(result.version, '9.0.2-test')
    assert.equal(result.state, 'cached')
    assert.equal(result.sha256, archiveSha)
    assert.equal(result.bytes, statSync(archive).size)
    assert.equal(result.sourceId, 'win32-x64-gyan-essentials')

    const dir = platformDir(root, PLATFORM, ARCH)
    assert.deepEqual(readdirSync(dir).sort(), [NAMES.ffmpeg, NAMES.ffprobe].sort())
    assert.equal(readFileSync(join(dir, NAMES.ffmpeg)).length, 4096)

    const phases = progress.map((p) => p.phase)
    for (const phase of ['resolve', 'download', 'extract', 'verify', 'commit', 'done']) {
      assert.ok(phases.includes(phase), `progress includes ${phase}`)
    }

    // The archive is cleaned up after a successful install.
    const downloads = join(root, '.downloads')
    const leftovers = existsSync(downloads) ? readdirSync(downloads) : []
    assert.deepEqual(leftovers, [])
    // No staging directories remain either.
    assert.deepEqual(readdirSync(root).filter((n) => n.startsWith('.staging-')), [])
  })

  test('a second call is served from disk without touching the network', async (t) => {
    if (!CAN_USE_FAKE) return t.skip('the fake gyan.dev source is win32/x64 only')
    if (!hasTar) return t.skip('system tar is unavailable')
    const root = join(work, 'root-cached')
    const first = fakeFetch()
    await installBinary({ root, platform: PLATFORM, arch: ARCH, fetchImpl: first, readVersionImpl: okVersion })

    const second = fakeFetch()
    const result = await installBinary({ root, platform: PLATFORM, arch: ARCH, fetchImpl: second, readVersionImpl: okVersion })
    assert.equal(result.source, 'cached')
    assert.equal(result.version, '9.0.2-test')
    assert.equal(second.calls.length, 0, 'no request is made when the install is already good')
  })
})

describe('install: failures leave nothing behind', () => {
  test('a checksum mismatch aborts the install', async (t) => {
    if (!CAN_USE_FAKE) return t.skip('the fake gyan.dev source is win32/x64 only')
    if (!hasTar) return t.skip('system tar is unavailable')
    const root = join(work, 'root-badsum')
    const fetchImpl = fakeFetch({ sha: 'f'.repeat(64) })
    await assert.rejects(
      installBinary({ root, platform: PLATFORM, arch: ARCH, fetchImpl, readVersionImpl: okVersion }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_SOURCE', 'the aggregate error says every source failed')
        assert.match(err.message, /Every FFmpeg source failed/)
        return true
      },
    )
    assert.equal(existsSync(platformDir(root, PLATFORM, ARCH)), false)
    assert.deepEqual(readdirSync(root).filter((n) => n.startsWith('.staging-')), [])
  })

  test('macOS is refused with a coded error and manual guidance', async () => {
    const root = join(work, 'root-mac')
    const fetchImpl = fakeFetch()
    await assert.rejects(
      installBinary({ root, platform: 'darwin', arch: 'arm64', fetchImpl, readVersionImpl: okVersion }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_UNSUPPORTED')
        assert.match(err.hint, /brew install ffmpeg/)
        return true
      },
    )
    assert.equal(fetchImpl.calls.length, 0, 'nothing is downloaded on an unsupported platform')
  })

  test('a pre-aborted signal cancels before any work', async () => {
    const root = join(work, 'root-cancel')
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      installBinary({
        root,
        platform: PLATFORM,
        arch: ARCH,
        signal: controller.signal,
        fetchImpl: fakeFetch(),
        readVersionImpl: okVersion,
      }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_CANCEL')
        return true
      },
    )
    assert.equal(existsSync(platformDir(root, PLATFORM, ARCH)), false)
  })

  test('extracted binaries that fail -version are rejected', async (t) => {
    if (!CAN_USE_FAKE) return t.skip('the fake gyan.dev source is win32/x64 only')
    if (!hasTar) return t.skip('system tar is unavailable')
    const root = join(work, 'root-badbin')
    await assert.rejects(
      installBinary({
        root,
        platform: PLATFORM,
        arch: ARCH,
        fetchImpl: fakeFetch(),
        readVersionImpl: async () => null,
      }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_SOURCE')
        return true
      },
    )
    assert.equal(existsSync(platformDir(root, PLATFORM, ARCH)), false)
  })
})
