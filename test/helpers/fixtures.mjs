/**
 * Fixture catalogue for the e2e suite.
 *
 * Fixtures are generated, not committed (`fixtures/` is gitignored). Tests must
 * be runnable on a clean checkout after `node scripts/make-fixtures.mjs`, and
 * must skip — not fail — when the fixtures are absent.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { statSync } from 'node:fs'

/** Absolute path to the generated-fixtures directory. */
export const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/', import.meta.url))

/**
 * Every fixture the suite knows about. Names match `scripts/make-fixtures.mjs`.
 * `missingSub` is intentionally never generated: it is the “path does not
 * exist” sample and must stay absent.
 */
export const FIXTURES = Object.freeze({
  /** 1280x720 @30fps, 440Hz stereo, 12s. The happy-path convert/GIF source. */
  bar12: path.join(FIXTURES_DIR, 'bar-12s.mp4'),
  /** 640x360 @30fps, g=300 (10s keyframe interval), 30s. Long-job / copy-gop source. */
  longGop: path.join(FIXTURES_DIR, 'bar-30s-longgop.mp4'),
  /** 48kHz stereo PCM WAV, 30s. */
  wav: path.join(FIXTURES_DIR, 'tone-30s.wav'),
  /** 24kHz mono MP3, 5s. Exercises the mp3→m4a “must switch to AAC” path. */
  mp3: path.join(FIXTURES_DIR, 'tone-5s.mp3'),
  /** 640x360 @30fps, no audio stream, 4s. */
  noAudio: path.join(FIXTURES_DIR, 'noaudio-4s.mp4'),
  /** 1080x1920 portrait, with audio, 4s. */
  vertical: path.join(FIXTURES_DIR, 'vertical-4s.mp4'),
  /** Plain text renamed to .mp4. */
  fake: path.join(FIXTURES_DIR, 'fake.mp4'),
  /** First 100KB of bar-12s.mp4, so the moov atom is missing. */
  truncated: path.join(FIXTURES_DIR, 'truncated.mp4'),
  /** concat demuxer list written with a UTF-8 BOM. */
  bomList: path.join(FIXTURES_DIR, 'list-bom.txt'),
  /** Deliberately absent: used to assert E_INPUT for a missing path. */
  missingSub: path.join(FIXTURES_DIR, 'bad-sub.srt'),
})

/** Fixtures that `make-fixtures.mjs` must produce. */
export const GENERATED_FIXTURES = Object.freeze([
  FIXTURES.bar12,
  FIXTURES.longGop,
  FIXTURES.wav,
  FIXTURES.mp3,
  FIXTURES.noAudio,
  FIXTURES.vertical,
  FIXTURES.fake,
  FIXTURES.truncated,
  FIXTURES.bomList,
])

/**
 * A fixture is “ready” only when it exists and is non-empty.
 * @param {string} file
 * @returns {boolean}
 */
export function isFixtureReady(file) {
  try {
    const info = statSync(file)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}

/**
 * @param {string[]} files
 * @returns {string[]} basenames that are missing or empty
 */
export function missingFixtures(files) {
  return files.filter((file) => !isFixtureReady(file)).map((file) => path.basename(file))
}

/**
 * Skip the current test (via t.skip) when required fixtures are missing.
 * Returns false so callers can `if (!requireFixtures(...)) return`.
 * @param {import('node:test').TestContext} t
 * @param {string[]} files
 * @returns {boolean}
 */
export function requireFixtures(t, files) {
  const missing = missingFixtures(files)
  if (missing.length === 0) return true
  t.diagnostic(`fixtures missing: ${missing.join(', ')} — run: node scripts/make-fixtures.mjs`)
  t.skip(`fixtures missing (${missing.join(', ')})`)
  return false
}
