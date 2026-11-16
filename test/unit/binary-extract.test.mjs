/**
 * Unit tests for the archive screening in src/binary/extract.js.
 *
 * These exercise the pure parsing layer: the `tar -tf` listing is passed in as a
 * string, so no archive and no child process is involved. The rule under test is
 * the D8 one: absolute paths and `..` never reach the extractor.
 */

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import {
  classifyEntries,
  parseListing,
  pickBinaryEntries,
  sweepStaleStaging,
  unsafeReason,
} from '../../src/binary/extract.js'

const WIN_NAMES = { ffmpeg: 'ffmpeg.exe', ffprobe: 'ffprobe.exe' }
const NIX_NAMES = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }

describe('listing: unsafe entries are rejected', () => {
  const cases = [
    ['/etc/passwd', 'absolute path'],
    ['/usr/local/bin/ffmpeg', 'absolute path'],
    ['\\Windows\\System32\\ffmpeg.exe', 'absolute path'],
    ['C:\\Windows\\ffmpeg.exe', 'drive-letter path'],
    ['c:/windows/ffmpeg.exe', 'drive-letter path'],
    ['\\\\server\\share\\ffmpeg.exe', 'network (UNC) path'],
    ['../ffmpeg', 'parent-directory segment (..)'],
    ['bin/../../ffmpeg.exe', 'parent-directory segment (..)'],
    ['bin/..\\ffmpeg.exe', 'parent-directory segment (..)'],
    ['./ffmpeg', 'current-directory segment (.)'],
    ['~/ffmpeg', 'home-relative path'],
  ]

  for (const [entry, expected] of cases) {
    test(`rejects ${JSON.stringify(entry)}`, () => {
      assert.equal(unsafeReason(entry), expected)
      assert.throws(() => parseListing(`${entry}\n`), (err) => {
        assert.equal(err.code, 'E_BINARY_ARCHIVE')
        assert.match(err.message, /unsafe entr/)
        return true
      })
    })
  }

  test('classifyEntries reports rather than throws, so callers can screen first', () => {
    const report = classifyEntries([
      'ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe',
      '../escape.sh',
      '/abs/path',
      'ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe',
    ].join('\n'))
    assert.equal(report.entries.length, 2)
    assert.equal(report.rejected.length, 2)
    assert.deepEqual(report.rejected.map((r) => r.reason).sort(), ['absolute path', 'parent-directory segment (..)'])
  })

  test('a fully safe listing passes through untouched, CRLF included', () => {
    const entries = parseListing(
      'ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe\r\nffmpeg-9.0.2-essentials_build/bin/ffprobe.exe\r\n',
    )
    assert.deepEqual(entries, [
      'ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe',
      'ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe',
    ])
  })

  test('an empty listing is empty, not an error', () => {
    assert.deepEqual(parseListing(''), [])
    assert.deepEqual(classifyEntries('\n\n  \n'), { entries: [], rejected: [] })
  })

  test('a NUL byte in an entry is rejected', () => {
    assert.equal(unsafeReason('bin/ffmpeg.exe\0.sh'), 'contains a NUL byte')
  })
})

describe('staging: crash leftovers', () => {
  /** @type {string} */
  let root
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'kumquat-sweep-'))
  })
  after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('removes only old .staging-* directories', () => {
    const old = join(root, '.staging-old')
    const fresh = join(root, '.staging-fresh')
    const keep = join(root, 'win32-x64')
    for (const dir of [old, fresh, keep]) mkdirSync(dir, { recursive: true })
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    utimesSync(old, twoHoursAgo, twoHoursAgo)

    const removed = sweepStaleStaging(root)
    assert.deepEqual(removed, [old])
    assert.equal(existsSync(old), false)
    assert.equal(existsSync(fresh), true, 'a live staging directory is left alone')
    assert.equal(existsSync(keep), true, 'the install directory is never touched')
  })

  test('a tick of a root that does not exist is not an error', () => {
    assert.deepEqual(sweepStaleStaging(join(root, 'nope')), [])
  })
})

describe('listing: binary selection', () => {
  test('picks the shallowest exact match, Windows flavour', () => {
    const entries = [
      'ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe',
      'ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe',
      'ffmpeg-9.0.2-essentials_build/doc/ffmpeg.txt',
      'ffmpeg-9.0.2-essentials_build/bin/ffplay.exe',
    ]
    const picked = pickBinaryEntries(entries, WIN_NAMES)
    assert.equal(picked.ffmpeg, 'ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe')
    assert.equal(picked.ffprobe, 'ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe')
    assert.deepEqual(picked.picks, [
      'ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe',
      'ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe',
    ])
  })

  test('picks the shallowest copy when a build ships duplicates', () => {
    const entries = ['a/deep/bin/ffmpeg', 'bin/ffmpeg', 'bin/ffprobe']
    const picked = pickBinaryEntries(entries, NIX_NAMES)
    assert.equal(picked.ffmpeg, 'bin/ffmpeg')
  })

  test('never matches a look-alike name', () => {
    const entries = ['bin/ffmpeg.exe.bak', 'doc/ffmpeg.html', 'bin/ffplay.exe', 'tools/ffprobe.txt']
    const picked = pickBinaryEntries(entries, WIN_NAMES)
    assert.equal(picked.ffmpeg, null)
    assert.equal(picked.ffprobe, null)
    assert.deepEqual(picked.picks, [])
  })

  test('a listing with only ffmpeg reports a missing ffprobe', () => {
    const picked = pickBinaryEntries(['bin/ffmpeg'], NIX_NAMES)
    assert.equal(picked.ffmpeg, 'bin/ffmpeg')
    assert.equal(picked.ffprobe, null)
    assert.deepEqual(picked.picks, ['bin/ffmpeg'])
  })

  test('johnvansickle layout is understood', () => {
    const entries = [
      'ffmpeg-7.0.2-amd64-static/',
      'ffmpeg-7.0.2-amd64-static/ffmpeg',
      'ffmpeg-7.0.2-amd64-static/ffprobe',
      'ffmpeg-7.0.2-amd64-static/ffplay',
      'ffmpeg-7.0.2-amd64-static/readme.txt',
    ]
    const picked = pickBinaryEntries(entries, NIX_NAMES)
    assert.deepEqual(picked.picks, ['ffmpeg-7.0.2-amd64-static/ffmpeg', 'ffmpeg-7.0.2-amd64-static/ffprobe'])
  })
})
