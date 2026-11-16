import test from 'node:test'
import assert from 'node:assert/strict'

import { runChecks, summarizeChecks } from '../../src/verify/checks.js'

const REQUIRED_IDS = [
  'streams.count',
  'video.codec',
  'video.resolution',
  'video.fps',
  'duration.drift',
  'size.budget',
  'audio.codec',
  'audio.sampleRate',
  'audio.channels',
  'audio.loudness',
  'audio.truePeak',
  'decodable.sample',
  'decodable.full',
  'gif.duration',
  'gif.frames',
  'gif.loop'
]

function makeFacts(overrides = {}) {
  const video = overrides.noVideo
    ? null
    : {
        index: 0,
        type: 'video',
        codec: 'h264',
        width: 1280,
        height: 720,
        fps: 30,
        ...(overrides.video ?? {})
      }
  const audio = overrides.noAudio
    ? null
    : {
        index: 1,
        type: 'audio',
        codec: 'aac',
        sampleRate: 48000,
        channels: 2,
        ...(overrides.audio ?? {})
      }
  return {
    path: 'C:/out/result.mp4',
    bytes: overrides.bytes ?? 5 * 1024 * 1024,
    container: overrides.container ?? 'mp4',
    formatName: overrides.container ?? 'mp4',
    durationSec: overrides.durationSec ?? 12,
    streams: overrides.streams ?? [...(video ? [video] : []), ...(audio ? [audio] : [])],
    video: video ?? undefined,
    audio: audio ?? undefined,
    ffmpegVersion: '6.1.1'
  }
}

function makeSpec(overrides = {}) {
  const video = overrides.video === null
    ? undefined
    : { codec: 'h264', width: 1280, height: 720, fps: 30, ...(overrides.video ?? {}) }
  const audio = overrides.audio === null
    ? undefined
    : {
        codec: 'aac',
        sampleRate: 48000,
        channels: 2,
        loudnessLufs: [-15, -13],
        truePeakDbMax: -1,
        ...(overrides.audio ?? {})
      }
  const spec = {
    container: 'mp4',
    video,
    audio,
    durationSec: { expect: 12, toleranceSec: 0.2 },
    maxBytes: 8 * 1024 * 1024,
    decodable: 'sample',
    ...(overrides.rest ?? {})
  }
  if (overrides.durationSec !== undefined) spec.durationSec = overrides.durationSec
  if (overrides.maxBytes !== undefined) spec.maxBytes = overrides.maxBytes
  if (overrides.decodable !== undefined) spec.decodable = overrides.decodable
  if (overrides.gif !== undefined) spec.gif = overrides.gif
  return spec
}

function makeMeasurements(overrides = {}) {
  return {
    mode: 'reencode',
    vfr: false,
    loudness: {
      ok: true,
      integratedLufs: -14.2,
      lra: 6.1,
      truePeakDb: -1.5,
      errors: [],
      stderr: ''
    },
    decode: {
      sample: {
        ok: true,
        clean: true,
        stderr: '',
        windows: [
          { id: 'head', skipped: false, ok: true },
          { id: 'tail', skipped: false, ok: true },
          { id: 'middle', skipped: false, ok: true }
        ]
      }
    },
    ...overrides
  }
}

function find(checks, id) {
  const check = checks.find(item => item.id === id)
  assert.ok(check, `missing check ${id}`)
  return check
}

test('baseline: all required checks exist and every check states expected + actual', () => {
  const facts = makeFacts()
  const spec = makeSpec()
  const checks = runChecks(facts, spec, makeMeasurements())

  assert.deepEqual(checks.map(check => check.id), REQUIRED_IDS)
  for (const check of checks) {
    assert.ok(['L0', 'L1', 'L2'].includes(check.tier), `${check.id} tier`)
    assert.ok(['pass', 'warn', 'fail', 'skipped'].includes(check.outcome), `${check.id} outcome`)
    assert.equal(typeof check.expected, 'string', `${check.id} expected type`)
    assert.ok(check.expected.length > 0, `${check.id} expected non-empty`)
    assert.equal(typeof check.actual, 'string', `${check.id} actual type`)
    assert.ok(check.actual.length > 0, `${check.id} actual non-empty`)
  }

  const summary = summarizeChecks(checks)
  assert.equal(summary.fail, 0)
  assert.equal(summary.ok, true)
  assert.equal(find(checks, 'audio.loudness').outcome, 'pass')
  assert.equal(find(checks, 'duration.drift').outcome, 'pass')
  assert.equal(find(checks, 'decodable.sample').outcome, 'pass')
  assert.equal(find(checks, 'gif.duration').outcome, 'skipped')
  assert.match(find(checks, 'audio.loudness').expected, /-15\.00 ~ -13\.00 LUFS/)
})

test('loudness out of range fails, reports LU delta and proposes a closed-loop gain', () => {
  const facts = makeFacts()
  const measurements = makeMeasurements({
    loudness: { ok: true, integratedLufs: -19, lra: 5, truePeakDb: -2, errors: [], stderr: '' }
  })
  const checks = runChecks(facts, makeSpec(), measurements)
  const loudness = find(checks, 'audio.loudness')

  assert.equal(loudness.outcome, 'fail')
  assert.match(loudness.actual, /-19\.00 LUFS/)
  assert.match(loudness.delta, /低于下限 4\.00 LU/)
  assert.deepEqual(loudness.repair, { kind: 'gain', db: 5 })
  assert.match(loudness.hint, /最多 2 轮/)
  assert.equal(summarizeChecks(checks).ok, false)
})

test('true peak above ceiling fails and proposes a negative gain', () => {
  const measurements = makeMeasurements({
    loudness: { ok: true, integratedLufs: -14.2, lra: 5, truePeakDb: -0.2, errors: [], stderr: '' }
  })
  const checks = runChecks(makeFacts(), makeSpec(), measurements)
  const peak = find(checks, 'audio.truePeak')

  assert.equal(peak.outcome, 'fail')
  assert.match(peak.delta, /超出上限 0\.80 dB/)
  assert.equal(peak.repair.kind, 'gain')
  assert.ok(peak.repair.db < 0)
})

test('size over budget fails with the excess and the 0.85 width repair', () => {
  const facts = makeFacts({
    path: 'C:/out/cat.gif',
    container: 'gif',
    bytes: 10 * 1024 * 1024,
    durationSec: 5.2,
    noAudio: true,
    video: { codec: 'gif', width: 480, height: 270, fps: 12 }
  })
  const spec = makeSpec({
    video: { codec: 'gif', width: 480, height: 270, fps: 12 },
    audio: null,
    gif: { from: 3.2, to: 8.4, fps: 12, width: 480, loop: true },
    durationSec: { expect: 5.2, toleranceSec: 0.2 },
    maxBytes: 8 * 1024 * 1024
  })
  const measurements = makeMeasurements({
    task: { kind: 'gif', input: 'C:/in/cat.mp4', from: 3.2, to: 8.4, fps: 12, width: 480, maxBytes: 8 * 1024 * 1024 },
    gif: { frames: 62, loop: true, loopCount: 0, width: 480, height: 270, fps: 12, durationSec: 5.2 }
  })
  const checks = runChecks(facts, spec, measurements, measurements.task)
  const size = find(checks, 'size.budget')

  assert.equal(size.outcome, 'fail')
  assert.match(size.delta, /超限 2\.00 MB/)
  assert.deepEqual(size.repair, { kind: 'reencode', width: 408 })
  assert.match(size.hint, /×0\.85/)
  assert.equal(find(checks, 'gif.duration').outcome, 'pass')
  assert.equal(find(checks, 'gif.frames').outcome, 'pass')
  assert.equal(find(checks, 'gif.loop').outcome, 'pass')
})

test('GIF duration drift fails against the selected segment and asks for a rerun', () => {
  const facts = makeFacts({
    path: 'C:/out/cat.gif',
    container: 'gif',
    durationSec: 5.6,
    noAudio: true,
    video: { codec: 'gif', width: 480, height: 270, fps: 12 }
  })
  const spec = makeSpec({
    video: { codec: 'gif', width: 480, height: 270, fps: 12 },
    audio: null,
    gif: { from: 3.2, to: 8.4, fps: 12, width: 480, loop: true }
  })
  const checks = runChecks(facts, spec, makeMeasurements())
  const duration = find(checks, 'gif.duration')

  assert.equal(duration.outcome, 'fail')
  assert.match(duration.expected, /5\.20s/)
  assert.match(duration.delta, /\+0\.40s/)
  assert.equal(duration.repair.kind, 'rerun')
})

test('copy-mode duration drift is a warn with the keyframe explanation, never a fail', () => {
  const facts = makeFacts({ durationSec: 12.5 })
  const measurements = makeMeasurements({ mode: 'copy', startOffsetSec: 0.42 })
  const checks = runChecks(facts, makeSpec(), measurements)
  const duration = find(checks, 'duration.drift')

  assert.equal(duration.outcome, 'warn')
  assert.match(duration.actual, /0\.42s/)
  assert.match(duration.delta, /\+0\.50s/)
  assert.match(duration.hint, /关键帧/)
  assert.equal(summarizeChecks(checks).fail, 0)
})

test('VFR source warns even when the average fps matches', () => {
  const checks = runChecks(makeFacts(), makeSpec(), makeMeasurements({ vfr: true }))
  const fps = find(checks, 'video.fps')

  assert.equal(fps.outcome, 'warn')
  assert.match(fps.actual, /VFR/)
  assert.match(fps.hint, /fps=12/)
})

test('odd dimensions fail on re-encode and warn on stream copy', () => {
  const oddFacts = makeFacts({ video: { width: 1281 } })
  const reencode = find(runChecks(oddFacts, makeSpec(), makeMeasurements()), 'video.resolution')
  assert.equal(reencode.outcome, 'fail')
  assert.match(reencode.delta, /奇数/)

  const copy = find(
    runChecks(oddFacts, makeSpec(), makeMeasurements({ mode: 'copy' })),
    'video.resolution'
  )
  assert.equal(copy.outcome, 'warn')
  assert.match(copy.hint, /流拷贝/)
})

test('missing audio stream fails every audio expectation that was set', () => {
  const facts = makeFacts({ noAudio: true })
  const checks = runChecks(facts, makeSpec(), makeMeasurements())

  assert.equal(find(checks, 'audio.codec').outcome, 'fail')
  assert.equal(find(checks, 'audio.loudness').outcome, 'fail')
  assert.equal(find(checks, 'streams.count').outcome, 'fail')
  assert.match(find(checks, 'audio.codec').actual, /无音频流/)
})

test('sample decode failure is a fail with the first stderr line as hint', () => {
  const measurements = makeMeasurements({
    decode: {
      sample: {
        ok: false,
        clean: false,
        stderr: '[middle] Invalid data found when processing input',
        errors: ['[middle] Invalid data found when processing input'],
        windows: [
          { id: 'head', skipped: false, ok: true },
          { id: 'tail', skipped: false, ok: true },
          { id: 'middle', skipped: false, ok: false }
        ]
      }
    }
  })
  const checks = runChecks(makeFacts(), makeSpec(), measurements)
  const sample = find(checks, 'decodable.sample')

  assert.equal(sample.outcome, 'fail')
  assert.match(sample.delta, /1 个窗口/)
  assert.match(sample.hint, /Invalid data/)
})

test('full decode is skipped unless spec explicitly asks for it', () => {
  const skipped = find(runChecks(makeFacts(), makeSpec(), makeMeasurements()), 'decodable.full')
  assert.equal(skipped.outcome, 'skipped')
  assert.match(skipped.expected, /仅显式开启/)

  const measurements = makeMeasurements()
  measurements.decode.full = { ok: true, clean: true, stderr: '', errors: [] }
  const full = find(
    runChecks(makeFacts(), makeSpec({ decodable: 'full' }), measurements),
    'decodable.full'
  )
  assert.equal(full.outcome, 'pass')
  assert.match(full.actual, /全片解码通过/)
})

test('spec tolerance overrides the default duration tolerance', () => {
  const facts = makeFacts({ durationSec: 12.4 })
  const loose = find(
    runChecks(facts, makeSpec({ durationSec: { expect: 12, toleranceSec: 0.5 } }), makeMeasurements()),
    'duration.drift'
  )
  assert.equal(loose.outcome, 'pass')

  const strict = find(
    runChecks(facts, makeSpec({ durationSec: { expect: 12, toleranceSec: 0.2 } }), makeMeasurements()),
    'duration.drift'
  )
  assert.equal(strict.outcome, 'fail')
})
