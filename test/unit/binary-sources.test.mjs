/**
 * Unit tests for src/binary/sources.js — the allow-list and checksum parsing that
 * decide whether a download may happen at all.
 */

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  ALLOWED_HOSTS,
  CHECKED_ON,
  DEFAULT_MAX_BYTES,
  SOURCES,
  getSource,
  getSources,
  isAllowedUrl,
  parseChecksumText,
  resolveSource,
} from '../../src/binary/sources.js'

describe('sources: table invariants', () => {
  test('the table was verified on a real date', () => {
    assert.match(CHECKED_ON, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('every platform/arch pair has at least one entry', () => {
    for (const [platform, arch] of [['win32', 'x64'], ['linux', 'x64'], ['linux', 'arm64'], ['darwin', 'x64'], ['darwin', 'arm64']]) {
      const list = getSources(platform, arch)
      assert.ok(list.length > 0, `${platform}/${arch} has a source entry`)
    }
  })

  test('an entry that may be auto-installed always carries a SHA-256 path', () => {
    for (const source of SOURCES.filter((s) => s.autoInstall)) {
      const hasPin = typeof source.sha256 === 'string' && /^[0-9a-f]{64}$/.test(source.sha256)
      const hasSidecar = typeof source.checksumUrl === 'string' && source.checksumUrl.startsWith('https://')
      const hasGithub = Boolean(source.github)
      assert.ok(hasPin || hasSidecar || hasGithub, `${source.id} has a checksum route`)
      assert.ok(source.url, `${source.id} has a url`)
      assert.equal(isAllowedUrl(source.url), true, `${source.id} url is allow-listed`)
      assert.ok(source.sizeHint > 0, `${source.id} has a size hint`)
      assert.ok(source.sizeHint <= DEFAULT_MAX_BYTES, `${source.id} fits under the 200 MB cap`)
      assert.ok(['zip', 'tar.xz'].includes(source.format), `${source.id} has a known format`)
      assert.ok(source.note.length > 20, `${source.id} documents how it was verified`)
    }
  })

  test('an entry that may not be auto-installed explains itself', () => {
    for (const source of SOURCES.filter((s) => !s.autoInstall)) {
      assert.equal(source.sha256, null, `${source.id} has no digest claim`)
      assert.ok(typeof source.manual === 'string' && source.manual.length > 20, `${source.id} has manual guidance`)
      assert.ok(source.note.length > 20)
    }
  })

  test('weak-checksum mirrors are present but excluded from auto-install', () => {
    const jvs = SOURCES.filter((s) => s.id.includes('johnvansickle'))
    assert.ok(jvs.length >= 2)
    for (const source of jvs) assert.equal(source.autoInstall, false)
  })

  test('macOS is marked unsupported, not silently missing', () => {
    for (const arch of ['x64', 'arm64']) {
      const [source] = getSources('darwin', arch)
      assert.ok(source, `darwin/${arch} entry exists`)
      assert.equal(source.autoInstall, false)
      assert.equal(source.url, null)
      assert.match(source.manual, /brew install ffmpeg/)
    }
  })

  test('getSource returns the first auto-installable entry', () => {
    assert.equal(getSource('win32', 'x64').id, 'win32-x64-gyan-essentials')
    assert.equal(getSource('linux', 'x64').id, 'linux-x64-btbn-gpl')
    assert.equal(getSource('darwin', 'arm64').autoInstall, false)
    assert.equal(getSource('freebsd', 'x64'), null)
  })

  test('size hints match the verified artefacts', () => {
    const gyan = getSource('win32', 'x64')
    assert.equal(gyan.sizeHint, 114_768_076)
    assert.equal(gyan.sha256, '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba')
  })
})

describe('sources: URL allow-list', () => {
  test('accepts the mirrors we actually use', () => {
    for (const host of ['www.gyan.dev', 'api.github.com', 'johnvansickle.com', 'release-assets.githubusercontent.com']) {
      assert.equal(isAllowedUrl(`https://${host}/some/file.zip`), true, host)
    }
    assert.ok(ALLOWED_HOSTS.has('www.gyan.dev'))
  })

  test('rejects everything else', () => {
    const bad = [
      'http://www.gyan.dev/x.zip',
      'ftp://www.gyan.dev/x.zip',
      'https://evil.example/x.zip',
      'https://www.gyan.dev.evil.example/x.zip',
      'https://user:pass@www.gyan.dev/x.zip',
      'not a url',
      '',
      null,
      undefined,
      42,
    ]
    for (const url of bad) assert.equal(isAllowedUrl(url), false, String(url))
  })
})

describe('sources: checksum parsing', () => {
  const digest = 'a3f1'.padEnd(64, '0')

  test('bare digest (gyan.dev .sha256)', () => {
    assert.equal(parseChecksumText(`${digest}\n`), digest)
    assert.equal(parseChecksumText(`${digest}\r\n`), digest)
    assert.equal(parseChecksumText(digest.toUpperCase()), digest)
  })

  test('sha256sum output picks the requested file', () => {
    const body = [
      `${'1'.repeat(64)}  ffmpeg-master-latest-win64-gpl.zip`,
      `${digest}  ffmpeg-n9.0-latest-win64-gpl-9.0.zip`,
    ].join('\n')
    assert.equal(parseChecksumText(body, 'ffmpeg-n9.0-latest-win64-gpl-9.0.zip'), digest)
    assert.equal(parseChecksumText(body, 'ffmpeg-master-latest-win64-gpl.zip'), '1'.repeat(64))
  })

  test('BSD style lines are understood', () => {
    const body = `SHA256 (ffmpeg.zip) = ${digest}`
    assert.equal(parseChecksumText(body, 'ffmpeg.zip'), digest)
  })

  test('an unknown file name still yields the first digest', () => {
    const body = `${digest}  something-else.zip`
    assert.equal(parseChecksumText(body, 'ffmpeg.zip'), digest)
  })

  test('junk yields null instead of a bogus digest', () => {
    assert.equal(parseChecksumText(''), null)
    assert.equal(parseChecksumText('404: Not Found'), null)
    assert.equal(parseChecksumText('md5 7fa72b652e19bf84c9461e332ea1cdf3'), null)
  })
})

describe('sources: resolveSource', () => {
  test('an auto-installable entry resolves to a digest', async () => {
    const resolved = await resolveSource(getSource('win32', 'x64'), {
      fetchImpl: /** @type {any} */ (async () => new Response(`${'b'.repeat(64)}\n`)),
    })
    assert.ok(resolved)
    assert.equal(resolved.sha256, 'b'.repeat(64))
    assert.equal(resolved.via, 'live-checksum')
    assert.equal(resolved.url, getSource('win32', 'x64').url)
  })

  test('a checksum endpoint that fails falls back to the pinned digest', async () => {
    const resolved = await resolveSource(getSource('win32', 'x64'), {
      fetchImpl: /** @type {any} */ (async () => new Response('boom', { status: 500 })),
    })
    assert.ok(resolved)
    assert.equal(resolved.via, 'pinned')
    assert.match(resolved.sha256, /^[0-9a-f]{64}$/)
  })

  test('an unsupported entry resolves to null — nothing to download', async () => {
    assert.equal(await resolveSource(getSources('darwin', 'arm64')[0]), null)
  })

  test('a GitHub asset resolves through the API digest', async () => {
    const asset = 'ffmpeg-n9.0-latest-linux64-gpl-9.0.tar.xz'
    const impl = /** @type {any} */ (async () => Response.json({
      assets: [
        { name: 'other.zip', id: 1, size: 10, digest: `sha256:${'c'.repeat(64)}` },
        { name: asset, id: 42, size: 152_702_564, digest: `sha256:${'d'.repeat(64)}` },
      ],
    }))
    const resolved = await resolveSource(getSource('linux', 'x64'), { fetchImpl: impl })
    assert.ok(resolved)
    assert.equal(resolved.via, 'github-digest')
    assert.equal(resolved.sha256, 'd'.repeat(64))
    assert.equal(resolved.size, 152_702_564)
    assert.match(resolved.url, /\/releases\/assets\/42$/)
  })

  test('a GitHub asset without a digest is not trusted', async () => {
    const impl = /** @type {any} */ (async () => Response.json({
      assets: [{ name: 'ffmpeg-n9.0-latest-linux64-gpl-9.0.tar.xz', id: 42, size: 1 }],
    }))
    const resolved = await resolveSource(getSource('linux', 'x64'), { fetchImpl: impl })
    // Falls through to the pinned digest rather than downloading unverified.
    assert.ok(resolved)
    assert.equal(resolved.via, 'pinned')
  })
})
