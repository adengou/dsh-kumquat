/**
 * E2E: format conversion through the public service contract.
 *
 * The suite talks only to `createService()`; while the wiring is missing every
 * test skips with “service not wired yet” instead of failing.
 *
 * Every test stages a uniquely named copy of its fixture, so parallel test
 * files never fight over the same output name.
 *
 * Covered:
 * - mp4 → mkv must stay on stream copy (fast, same codecs);
 * - mp4 → webm must re-encode (H.264 cannot live in WebM);
 * - mp3 → m4a must switch to AAC automatically (MP3 is not allowed in MP4);
 * - the four bad samples must fail with a typed, actionable error.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { FIXTURES, requireFixtures } from '../helpers/fixtures.mjs'
import {
  getService,
  makeWorkdir,
  outputPathOf,
  runExpectingFailure,
  runJob,
  stageFixture,
  uniqueToken,
} from '../helpers/service.mjs'

/**
 * @param {import('node:test').TestContext} t
 * @param {string[]} files
 * @returns {Promise<any | null>}
 */
async function setup(t, files) {
  const service = await getService(t)
  if (!service) return null
  if (!requireFixtures(t, files)) return null
  return service
}

/**
 * @param {any} job
 */
function assertDoneWithVerdict(job) {
  assert.equal(job.status, 'done', `job ${job.id} did not finish: ${JSON.stringify(job.error ?? null)}`)
  assert.ok(job.verdict, `job ${job.id} has no verdict`)
  const failed = (job.verdict.checks ?? []).filter((check) => check.outcome === 'fail')
  assert.equal(job.verdict.ok, true, `verdict not ok for ${job.id}: ${JSON.stringify(failed)}`)
  assert.ok(Array.isArray(job.verdict.checks) && job.verdict.checks.length > 0, 'verdict must contain checks')
}

test('mp4 → mkv uses stream copy and finishes fast', async (t) => {
  const service = await setup(t, [FIXTURES.bar12])
  if (!service) return
  const workdir = await makeWorkdir(t)
  const token = uniqueToken('conv-copy')
  const input = await stageFixture(FIXTURES.bar12, workdir, `${token}.mp4`)

  const started = Date.now()
  const job = await runJob(service, { kind: 'convert', input, to: 'mkv', copy: true })
  const wallMs = Date.now() - started

  assertDoneWithVerdict(job)
  const output = outputPathOf(job)
  assert.equal(path.extname(output).toLowerCase(), '.mkv', `unexpected output path: ${output}`)
  assert.ok(existsSync(output), `output file missing: ${output}`)

  const argvText = Array.isArray(job.argv) ? job.argv.join(' ') : ''
  assert.match(argvText, /(^|\s)copy(\s|$)/, `expected a stream-copy flag in argv, got: ${argvText}`)
  assert.ok(wallMs < 5000, `stream copy of a 12s file took ${wallMs}ms (budget 5000ms)`)

  const facts = await service.probe(output)
  assert.equal(facts.video?.codec, 'h264', `copy must keep H.264, got ${facts.video?.codec}`)
  assert.ok(facts.audio, 'copy must keep the audio track')
  assert.ok(Math.abs(facts.durationSec - 12) <= 0.2, `duration ${facts.durationSec}s, expected 12s ±0.2`)

  const [inputInfo, outputInfo] = await Promise.all([stat(input), stat(output)])
  assert.ok(
    outputInfo.size > inputInfo.size * 0.9,
    `copy output is unexpectedly small: ${outputInfo.size}B vs input ${inputInfo.size}B (re-encoded?)`,
  )
})

test('mp4 → webm re-encodes instead of copying H.264', async (t) => {
  const service = await setup(t, [FIXTURES.bar12])
  if (!service) return
  const workdir = await makeWorkdir(t)
  const token = uniqueToken('conv-webm')
  const input = await stageFixture(FIXTURES.bar12, workdir, `${token}.mp4`)

  const job = await runJob(service, { kind: 'convert', input, to: 'webm' })
  assertDoneWithVerdict(job)

  const output = outputPathOf(job)
  assert.equal(path.extname(output).toLowerCase(), '.webm', `unexpected output path: ${output}`)

  const facts = await service.probe(output)
  const videoCodec = facts.video?.codec ?? ''
  assert.match(videoCodec, /^(vp8|vp9|av1)$/, `WebM must use VP8/VP9/AV1, got ${videoCodec}`)
  assert.notEqual(videoCodec, 'h264', 'WebM cannot carry H.264')
  assert.match(facts.audio?.codec ?? '', /^(opus|vorbis)$/, `unexpected WebM audio codec: ${facts.audio?.codec}`)
  assert.match(facts.container ?? '', /webm/i, `unexpected container: ${facts.container}`)
  assert.ok(Math.abs(facts.durationSec - 12) <= 0.3, `duration ${facts.durationSec}s, expected 12s ±0.3`)
})

test('mp3 → m4a switches the audio codec to AAC automatically', async (t) => {
  const service = await setup(t, [FIXTURES.mp3])
  if (!service) return
  const workdir = await makeWorkdir(t)
  const token = uniqueToken('conv-m4a')
  const input = await stageFixture(FIXTURES.mp3, workdir, `${token}.mp3`)

  const job = await runJob(service, { kind: 'convert', input, to: 'm4a' })
  assertDoneWithVerdict(job)

  const output = outputPathOf(job)
  assert.equal(path.extname(output).toLowerCase(), '.m4a', `unexpected output path: ${output}`)

  const facts = await service.probe(output)
  assert.equal(facts.audio?.codec, 'aac', `mp3 cannot be copied into MP4; expected AAC, got ${facts.audio?.codec}`)
  assert.equal(facts.video, undefined, 'audio-only source must not gain a video stream')
  assert.ok(
    (facts.streams ?? []).every((stream) => stream.type !== 'video'),
    'm4a output must not contain a video stream',
  )
  assert.ok(Math.abs(facts.durationSec - 5) <= 0.3, `duration ${facts.durationSec}s, expected 5s ±0.3`)
})

test('bad samples fail with a typed, actionable error', async (t) => {
  const service = await setup(t, [FIXTURES.fake, FIXTURES.truncated, FIXTURES.bomList])
  if (!service) return
  const workdir = await makeWorkdir(t)
  const token = uniqueToken('conv-bad')

  const fake = await stageFixture(FIXTURES.fake, workdir, `${token}-fake.mp4`)
  const truncated = await stageFixture(FIXTURES.truncated, workdir, `${token}-truncated.mp4`)
  const bomList = await stageFixture(FIXTURES.bomList, workdir, `${token}-list-bom.txt`)

  /** @type {{ label: string, input: string, to: string, codes: string[], missingFile?: boolean }[]} */
  const cases = [
    {
      label: 'fake.mp4 (plain text renamed to .mp4)',
      input: fake,
      to: 'mkv',
      codes: ['E_INPUT', 'E_ENCODE', 'E_VERIFY'],
    },
    {
      label: 'truncated.mp4 (first 100KB, moov atom missing)',
      input: truncated,
      to: 'mkv',
      codes: ['E_INPUT', 'E_ENCODE', 'E_VERIFY'],
    },
    {
      label: 'list-bom.txt (UTF-8 BOM concat list)',
      input: bomList,
      to: 'mp4',
      codes: ['E_INPUT', 'E_ENCODE', 'E_VERIFY'],
    },
    {
      label: 'bad-sub.srt (path does not exist)',
      input: FIXTURES.missingSub,
      to: 'mkv',
      codes: ['E_INPUT'],
      missingFile: true,
    },
  ]

  for (const badCase of cases) {
    await t.test(badCase.label, async (subtest) => {
      if (badCase.missingFile && existsSync(badCase.input)) {
        return subtest.skip('bad-sub.srt unexpectedly exists; missing-path case not exercised')
      }
      const error = await runExpectingFailure(service, {
        kind: 'convert',
        input: badCase.input,
        to: badCase.to,
      })
      assert.ok(
        badCase.codes.includes(error?.code),
        `expected ${badCase.codes.join(' or ')} for ${badCase.label}, got ${JSON.stringify(error)}`,
      )
      assert.equal(typeof error.message, 'string', 'error.message must be a string')
      assert.ok(error.message.length > 0, 'error.message must not be empty')
      assert.equal(typeof error.hint, 'string', 'error.hint must be a string')
      assert.ok(error.hint.length > 0, `error.hint must tell the user what to do next: ${JSON.stringify(error)}`)
    })
  }
})
