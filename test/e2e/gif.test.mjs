/**
 * E2E: video → GIF through the public service contract.
 *
 * Every test stages a uniquely named fixture copy so parallel test files cannot
 * collide on output names.
 *
 * Covered:
 * - a 5s selection at 12fps/480px produces ≈5s, ≈60 frames, under 8MB, silent,
 *   and carries the GIF looping extension;
 * - a source without an audio track still yields a silent GIF;
 * - a deliberately oversized GIF is judged unqualified by `verify()` and the
 *   verdict carries a “make it smaller” repair suggestion.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { countVideoFrames, durationOf, hasFfprobe, probeJson } from '../helpers/ffmpeg.mjs'
import { FIXTURES, requireFixtures } from '../helpers/fixtures.mjs'
import {
  getService,
  makeWorkdir,
  outputPathOf,
  runJob,
  stageFixture,
  uniqueToken,
} from '../helpers/service.mjs'

const GIF_FPS = 12
const GIF_WIDTH = 480
const MAX_GIF_BYTES = 8 * 1024 * 1024

/**
 * @param {import('node:test').TestContext} t
 * @param {string[]} files
 * @returns {Promise<any | null>}
 */
async function setup(t, files) {
  const service = await getService(t)
  if (!service) return null
  if (!hasFfprobe()) {
    t.diagnostic('ffprobe not found — frame/duration assertions need it (ffmpeg essentials ships it)')
    t.skip('ffprobe not found')
    return null
  }
  if (!requireFixtures(t, files)) return null
  return service
}

/**
 * @param {any} job
 */
function assertGifJobOk(job) {
  assert.equal(job.status, 'done', `job ${job.id} did not finish: ${JSON.stringify(job.error ?? null)}`)
  assert.ok(job.verdict, `job ${job.id} has no verdict`)
  assert.equal(
    job.verdict.ok,
    true,
    `verdict not ok: ${JSON.stringify((job.verdict.checks ?? []).filter((check) => check.outcome === 'fail'))}`,
  )
}

test('GIF: 5s segment at 12fps/480px is ≈5s, ≈60 frames, <8MB, silent and looping', async (t) => {
  const service = await setup(t, [FIXTURES.bar12])
  if (!service) return
  const workdir = await makeWorkdir(t)
  const token = uniqueToken('gif-main')
  const input = await stageFixture(FIXTURES.bar12, workdir, `${token}.mp4`)

  const job = await runJob(service, {
    kind: 'gif',
    input,
    from: 1,
    to: 6,
    fps: GIF_FPS,
    width: GIF_WIDTH,
    maxBytes: MAX_GIF_BYTES,
  })
  assertGifJobOk(job)

  const output = outputPathOf(job)
  assert.equal(path.extname(output).toLowerCase(), '.gif', `unexpected output path: ${output}`)

  const info = await stat(output)
  assert.ok(info.size > 0, 'GIF file is empty')
  assert.ok(info.size < MAX_GIF_BYTES, `GIF is ${info.size}B, expected under ${MAX_GIF_BYTES}B`)

  const probe = await probeJson(output)
  const streams = Array.isArray(probe.streams) ? probe.streams : []
  assert.deepEqual(
    streams.filter((stream) => stream.codec_type === 'audio'),
    [],
    'GIF must not contain an audio stream',
  )

  const frames = await countVideoFrames(output)
  assert.ok(frames >= 57 && frames <= 63, `expected ≈60 frames for 5s at 12fps, got ${frames}`)

  const duration = durationOf(probe) ?? frames / GIF_FPS
  assert.ok(Math.abs(duration - 5) <= 0.25, `GIF duration ${duration}s, expected 5s ±0.25`)

  // `-loop 0` writes the NETSCAPE2.0 application extension; GIFs without it play once.
  const bytes = await readFile(output)
  assert.ok(bytes.includes(Buffer.from('NETSCAPE2.0')), 'GIF is missing the NETSCAPE2.0 looping extension')

  const facts = await service.probe(output)
  assert.equal(facts.audio, undefined, 'service.probe() reports an audio track for a GIF')
  if (facts.video?.fps !== undefined) {
    assert.equal(Math.round(facts.video.fps), GIF_FPS, `GIF fps ${facts.video.fps}, expected ${GIF_FPS}`)
  }
})

test('GIF: a source without audio still produces a silent GIF', async (t) => {
  const service = await setup(t, [FIXTURES.noAudio])
  if (!service) return
  const workdir = await makeWorkdir(t)
  const token = uniqueToken('gif-silent')
  const input = await stageFixture(FIXTURES.noAudio, workdir, `${token}.mp4`)

  const job = await runJob(service, {
    kind: 'gif',
    input,
    from: 0,
    to: 4,
    fps: GIF_FPS,
    width: 320,
  })
  assertGifJobOk(job)

  const output = outputPathOf(job)
  const probe = await probeJson(output)
  const streams = Array.isArray(probe.streams) ? probe.streams : []
  assert.deepEqual(streams.filter((stream) => stream.codec_type === 'audio'), [], 'GIF must stay silent')

  const frames = await countVideoFrames(output)
  assert.ok(frames >= 45 && frames <= 51, `expected ≈48 frames for 4s at 12fps, got ${frames}`)
  const duration = durationOf(probe) ?? frames / GIF_FPS
  assert.ok(Math.abs(duration - 4) <= 0.25, `GIF duration ${duration}s, expected 4s ±0.25`)
})

test('verify() rejects an oversized GIF and suggests a smaller width', async (t) => {
  const service = await setup(t, [FIXTURES.bar12])
  if (!service) return
  const workdir = await makeWorkdir(t)
  const token = uniqueToken('gif-big')
  const input = await stageFixture(FIXTURES.bar12, workdir, `${token}.mp4`)

  // A deliberately heavy GIF: 720px wide, 24fps, 5 seconds. No maxBytes on the
  // task, so the file is committed as-is; the limit is then applied by verify().
  const job = await runJob(service, {
    kind: 'gif',
    input,
    from: 6,
    to: 11,
    fps: 24,
    width: 720,
  })
  assertGifJobOk(job)

  const output = outputPathOf(job)
  const info = await stat(output)
  const limit = Math.max(64 * 1024, Math.floor(info.size / 2))
  assert.ok(info.size > limit, `test setup error: GIF ${info.size}B does not exceed limit ${limit}B`)

  const verdict = await service.verify(output, { maxBytes: limit })
  assert.equal(verdict.ok, false, `oversized GIF (${info.size}B) should fail a ${limit}B budget`)
  const failures = (verdict.checks ?? []).filter((check) => check.outcome === 'fail')
  assert.ok(failures.length > 0, 'a failed verdict must contain at least one failing check')

  const sizeFailure = failures.find((check) =>
    /byte|size|max|mb|体积|大小/i.test(`${check.id ?? ''} ${check.expected ?? ''} ${check.actual ?? ''} ${check.hint ?? ''}`),
  )
  assert.ok(sizeFailure, `no size-related failing check: ${JSON.stringify(failures)}`)

  // The product promise: a failing check says what was expected, what happened,
  // and how to fix it.
  for (const field of ['expected', 'actual']) {
    assert.equal(typeof sizeFailure[field], 'string', `size check is missing ${field}`)
    assert.ok(sizeFailure[field].length > 0, `size check ${field} must not be empty`)
  }

  const widthRepair = failures.find(
    (check) => check.repair?.kind === 'reencode' && Number.isFinite(Number(check.repair.width)),
  )
  const widthHint = failures.find((check) =>
    /width|宽度|尺寸|缩放|downscale/i.test(`${check.hint ?? ''} ${JSON.stringify(check.repair ?? {})}`),
  )
  assert.ok(
    widthRepair || widthHint,
    `expected a downscale suggestion (repair.kind="reencode" with width, or a hint): ${JSON.stringify(failures)}`,
  )
  if (widthRepair) {
    const suggested = Number(widthRepair.repair.width)
    assert.ok(
      suggested > 0 && suggested < 720,
      `suggested width ${suggested} must be smaller than the current 720`,
    )
  }
})
