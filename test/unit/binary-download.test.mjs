/**
 * Unit tests for src/binary/download.js.
 *
 * Everything here runs against a fake `fetch`, so no network is touched. The
 * fake responses are real `Response` objects with real `ReadableStream` bodies,
 * which keeps the production pipeline (stream → hash → file) under test.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { download, formatBytes, parseContentRange } from '../../src/binary/download.js'

/** @type {string} */
let work
before(() => {
  work = mkdtempSync(join(tmpdir(), 'kumquat-dl-'))
})
after(() => {
  rmSync(work, { recursive: true, force: true })
})

/** @param {string} name */
const dest = (name) => join(work, name)
/** @param {Buffer} buf */
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/**
 * Build a fake fetch that serves `chunks` for the first call.
 * @param {Buffer[]} chunks
 * @param {{ status?: number, headers?: Record<string,string>, url?: string, onCall?: (init: RequestInit) => void }} [opts]
 */
function fakeFetch(chunks, opts = {}) {
  const calls = []
  /** @type {any} */
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    opts.onCall?.(init)
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new Uint8Array(chunk))
          await new Promise((resolve) => setTimeout(resolve, 1))
        }
        controller.close()
      },
    })
    const res = new Response(stream, { status: opts.status ?? 200, headers: opts.headers ?? {} })
    if (opts.url) Object.defineProperty(res, 'url', { value: opts.url })
    return res
  }
  impl.calls = calls
  return impl
}

describe('download: happy path', () => {
  test('streams to the destination, verifies the digest, removes the .part file', async () => {
    const payload = Buffer.from('ffmpeg-binary-'.repeat(2048))
    const target = dest('ok.bin')
    /** @type {any[]} */
    const progress = []

    const result = await download('https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', {
      dest: target,
      expectedSha256: sha256(payload),
      fetchImpl: fakeFetch([payload.subarray(0, 5000), payload.subarray(5000)]),
      onProgress: (p) => progress.push(p),
    })

    assert.equal(result.bytes, payload.length)
    assert.equal(result.sha256, sha256(payload))
    assert.equal(result.resumed, false)
    assert.equal(readFileSync(target).length, payload.length)
    assert.equal(existsSync(`${target}.part`), false)

    assert.ok(progress.length >= 2, 'progress fires at least twice')
    assert.equal(progress[0].received, 0)
    assert.equal(progress.at(-1).received, payload.length)
    assert.equal(progress.at(-1).percent, null, 'percent stays null without a length or a size hint')
  })

  test('reports total from Content-Length and a monotonic percent', async () => {
    const payload = Buffer.alloc(8000, 7)
    /** @type {any[]} */
    const progress = []
    await download('https://www.gyan.dev/x.zip', {
      dest: dest('total.bin'),
      fetchImpl: fakeFetch([payload], { headers: { 'content-length': String(payload.length) } }),
      onProgress: (p) => progress.push(p),
    })
    assert.equal(progress.at(-1).total, payload.length)
    for (let i = 1; i < progress.length; i += 1) {
      assert.ok(progress[i].received >= progress[i - 1].received)
    }
  })

  test('uses expectedBytes for progress when the server sends no length', async () => {
    /** @type {any[]} */
    const progress = []
    await download('https://www.gyan.dev/x.zip', {
      dest: dest('nolen.bin'),
      expectedBytes: 4000,
      fetchImpl: fakeFetch([Buffer.alloc(4000, 1)]),
      onProgress: (p) => progress.push(p),
    })
    assert.equal(progress[0].total, 4000)
    assert.equal(progress.at(-1).percent, 100)
  })
})

describe('download: failures clean up', () => {
  test('SHA-256 mismatch fails with E_BINARY_CHECKSUM and leaves nothing behind', async () => {
    const payload = Buffer.from('tampered')
    const target = dest('mismatch.bin')
    await assert.rejects(
      download('https://www.gyan.dev/x.zip', {
        dest: target,
        expectedSha256: 'a'.repeat(64),
        fetchImpl: fakeFetch([payload]),
      }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_CHECKSUM')
        assert.match(err.message, /SHA-256 mismatch/)
        assert.equal(existsSync(target), false)
        assert.equal(existsSync(`${target}.part`), false)
        return true
      },
    )
    assert.ok(sha256(payload) !== 'a'.repeat(64))
  })

  test('an oversized Content-Length is rejected before writing a byte', async () => {
    const target = dest('big-header.bin')
    let fetched = 0
    const impl = /** @type {any} */ (async () => {
      fetched += 1
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-length': String(500 * 1024 * 1024) } })
    })
    await assert.rejects(
      download('https://www.gyan.dev/x.zip', { dest: target, maxBytes: 200 * 1024 * 1024, fetchImpl: impl }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_TOO_LARGE')
        assert.match(err.message, /limit/)
        return true
      },
    )
    assert.equal(fetched, 1)
    assert.equal(existsSync(target), false)
    assert.equal(existsSync(`${target}.part`), false)
  })

  test('an oversized body without Content-Length trips the cap mid-stream', async () => {
    const target = dest('big-body.bin')
    const payload = Buffer.alloc(64 * 1024, 3)
    await assert.rejects(
      download('https://www.gyan.dev/x.zip', {
        dest: target,
        maxBytes: 10 * 1024,
        fetchImpl: fakeFetch([payload, payload]),
      }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_TOO_LARGE')
        return true
      },
    )
    assert.equal(existsSync(target), false)
    assert.equal(existsSync(`${target}.part`), false)
  })

  test('an already-aborted signal fails immediately with E_BINARY_CANCEL', async () => {
    const controller = new AbortController()
    controller.abort()
    let fetched = 0
    const impl = /** @type {any} */ (async () => {
      fetched += 1
      return new Response('nope')
    })
    await assert.rejects(
      download('https://www.gyan.dev/x.zip', { dest: dest('cancel0.bin'), signal: controller.signal, fetchImpl: impl }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_CANCEL')
        return true
      },
    )
    assert.equal(fetched, 0, 'no request is made once the caller has cancelled')
  })

  test('aborting mid-stream removes the partial file', async () => {
    const controller = new AbortController()
    const target = dest('cancel1.bin')
    const payload = Buffer.alloc(16 * 1024, 9)
    const impl = fakeFetch([payload, payload, payload, payload])
    const run = download('https://www.gyan.dev/x.zip', {
      dest: target,
      signal: controller.signal,
      fetchImpl: impl,
    })
    setTimeout(() => controller.abort(), 3)
    await assert.rejects(run, (err) => {
      assert.equal(err.code, 'E_BINARY_CANCEL')
      return true
    })
    assert.equal(existsSync(target), false)
    assert.equal(existsSync(`${target}.part`), false)
  })

  test('HTTP 404 is reported as E_BINARY_HTTP', async () => {
    await assert.rejects(
      download('https://www.gyan.dev/x.zip', {
        dest: dest('404.bin'),
        fetchImpl: fakeFetch([Buffer.from('not found')], { status: 404 }),
      }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_HTTP')
        assert.match(err.message, /404/)
        return true
      },
    )
  })
})

describe('download: URL allow-list', () => {
  test('a host outside the allow-list is refused before any request', async () => {
    let fetched = 0
    const impl = /** @type {any} */ (async () => {
      fetched += 1
      return new Response('x')
    })
    await assert.rejects(
      download('https://evil.example/ffmpeg.zip', { dest: dest('evil.bin'), fetchImpl: impl }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_SOURCE')
        assert.match(err.message, /allow-list/)
        return true
      },
    )
    assert.equal(fetched, 0)
  })

  test('plain http is refused even on an allowed host', async () => {
    await assert.rejects(
      download('http://www.gyan.dev/ffmpeg.zip', { dest: dest('http.bin'), fetchImpl: fakeFetch([Buffer.from('x')]) }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_SOURCE')
        return true
      },
    )
  })

  test('a redirect to a non-allow-listed host is refused', async () => {
    await assert.rejects(
      download('https://www.gyan.dev/x.zip', {
        dest: dest('redirect.bin'),
        fetchImpl: fakeFetch([Buffer.from('x')], { url: 'https://cdn.evil.example/x.zip' }),
      }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_SOURCE')
        assert.match(err.message, /redirected/)
        return true
      },
    )
  })
})

describe('download: resume', () => {
  test('continues an existing .part with a Range request and hashes the whole file', async () => {
    const whole = Buffer.from('0123456789abcdef'.repeat(1024))
    const cut = 5000
    const target = dest('resume.bin')
    writeFileSync(`${target}.part`, whole.subarray(0, cut))
    /** @type {any[]} */
    const calls = []

    const impl = /** @type {any} */ (async (url, init) => {
      calls.push(init)
      assert.equal(init.headers.range, `bytes=${cut}-`)
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(whole.subarray(cut)))
          controller.close()
        },
      })
      return new Response(body, {
        status: 206,
        headers: {
          'content-range': `bytes ${cut}-${whole.length - 1}/${whole.length}`,
          'content-length': String(whole.length - cut),
        },
      })
    })

    /** @type {any[]} */
    const progress = []
    const result = await download('https://www.gyan.dev/x.zip', {
      dest: target,
      resume: true,
      expectedSha256: sha256(whole),
      fetchImpl: impl,
      onProgress: (p) => progress.push(p),
    })

    assert.equal(result.resumed, true)
    assert.equal(result.bytes, whole.length)
    assert.equal(result.sha256, sha256(whole))
    assert.deepEqual(readFileSync(target), whole)
    assert.equal(progress[0].received, cut, 'progress starts where the partial file ended')
    assert.equal(calls.length, 1)
  })

  test('falls back to a full download when the server ignores Range', async () => {
    const whole = Buffer.from('abcdef'.repeat(4000))
    const target = dest('resume-200.bin')
    writeFileSync(`${target}.part`, Buffer.alloc(1000, 0))
    const result = await download('https://www.gyan.dev/x.zip', {
      dest: target,
      resume: true,
      expectedSha256: sha256(whole),
      fetchImpl: fakeFetch([whole], { status: 200 }),
    })
    assert.equal(result.resumed, false)
    assert.deepEqual(readFileSync(target), whole)
  })

  test('parseContentRange understands the three shapes', () => {
    assert.deepEqual(parseContentRange('bytes 100-199/1000'), { start: 100, end: 199, total: 1000 })
    assert.deepEqual(parseContentRange('bytes 0-0/*'), { start: 0, end: 0, total: null })
    assert.equal(parseContentRange('garbage'), null)
    assert.equal(parseContentRange(null), null)
  })
})

describe('download: helpers', () => {
  test('formatBytes is human readable', () => {
    assert.equal(formatBytes(109 * 1024 * 1024), '109 MB')
    assert.equal(formatBytes(2048), '2 KB')
    assert.equal(formatBytes(-1), '?')
  })

  test('an empty destination path is a caller bug', async () => {
    await assert.rejects(download('https://www.gyan.dev/x.zip', { dest: '' }), (err) => {
      assert.equal(err.code, 'E_BINARY_IO')
      return true
    })
  })

  test('a zero maxBytes is a caller bug', async () => {
    await assert.rejects(
      download('https://www.gyan.dev/x.zip', { dest: dest('zero.bin'), maxBytes: 0 }),
      (err) => {
        assert.equal(err.code, 'E_BINARY_IO')
        return true
      },
    )
  })
})
