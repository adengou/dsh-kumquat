/**
 * Live network tests for the binary manager.
 *
 * Skipped by default: they download a real ~110 MB archive from gyan.dev.
 * Run them with `KUMQUAT_TEST_DOWNLOAD=1 node --test --test-isolation=none test/unit/binary-live.test.mjs`.
 *
 * The default run only resolves the live checksum sidecar (a few hundred bytes),
 * which is enough to catch a mirror that changed shape.
 */

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'

import { download } from '../../src/binary/download.js'
import { getSource, isAllowedUrl, resolveSource } from '../../src/binary/sources.js'

const LIVE = process.env.KUMQUAT_TEST_DOWNLOAD === '1'

/** @type {string} */
let work
after(() => {
  if (work) rmSync(work, { recursive: true, force: true })
})

describe('live: gyan.dev checksum sidecar', { skip: LIVE ? false : 'set KUMQUAT_TEST_DOWNLOAD=1 to run network tests' }, () => {
  test('resolves a live SHA-256 for windows/x64', async () => {
    const source = getSource('win32', 'x64')
    assert.ok(source)
    const resolved = await resolveSource(source)
    assert.ok(resolved, 'a digest is available')
    assert.match(resolved.sha256, /^[0-9a-f]{64}$/)
    assert.equal(isAllowedUrl(resolved.url), true)
    assert.ok(resolved.size > 50 * 1024 * 1024, 'the artefacts are tens of MB')
  })
})

describe('live: full download', { skip: LIVE ? false : 'set KUMQUAT_TEST_DOWNLOAD=1 to run network tests' }, () => {
  test('downloads the gyan.dev archive and matches the live digest', async () => {
    work = mkdtempSync(join(tmpdir(), 'kumquat-live-'))
    const source = getSource('win32', 'x64')
    const resolved = await resolveSource(source)
    assert.ok(resolved)
    const startedAt = Date.now()
    const result = await download(resolved.url, {
      dest: join(work, 'ffmpeg.zip'),
      expectedSha256: resolved.sha256,
      maxBytes: 200 * 1024 * 1024,
    })
    const elapsedMs = Date.now() - startedAt
    assert.equal(result.sha256, resolved.sha256)
    assert.ok(result.bytes > 50 * 1024 * 1024)
    assert.equal(statSync(join(work, 'ffmpeg.zip')).size, result.bytes)
    assert.equal(existsSync(join(work, 'ffmpeg.zip.part')), false)
    console.log(`live download: ${(result.bytes / 1048576).toFixed(1)} MB in ${(elapsedMs / 1000).toFixed(1)} s`)
  })
})
