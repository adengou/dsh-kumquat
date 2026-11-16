import test from 'node:test'
import assert from 'node:assert/strict'

import { runChecks } from '../../src/verify/checks.js'
import { applyRepair, planRepairs } from '../../src/verify/repair.js'

function mp4Facts(overrides = {}) {
  const video = { index: 0, type: 'video', codec: 'h264', width: 1280, height: 720, fps: 30 }
  const audio = { index: 1, type: 'audio', codec: 'aac', sampleRate: 48000, channels: 2 }
  return {
    path: 'C:/out/result.mp4',
    bytes: 5 * 1024 * 1024,
    container: 'mp4',
    formatName: 'mp4',
    durationSec: 12,
    streams: [video, audio],
    video,
    audio,
    ffmpegVersion: '6.1.1',
    ...overrides
  }
}

function mp4Spec(overrides = {}) {
  return {
    container: 'mp4',
    video: { codec: 'h264', width: 1280, height: 720, fps: 30 },
    audio: {
      codec: 'aac',
      sampleRate: 48000,
      channels: 2,
      loudnessLufs: [-15, -13],
      truePeakDbMax: -1
    },
    durationSec: { expect: 12, toleranceSec: 0.2 },
    maxBytes: 8 * 1024 * 1024,
    decodable: 'sample',
    ...overrides
  }
}

function baseMeasurements(overrides = {}) {
  return {
    mode: 'reencode',
    loudness: { ok: true, integratedLufs: -14.2, lra: 6, truePeakDb: -1.5, errors: [] },
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

function loudnessVerdict(integratedLufs = -19) {
  const facts = mp4Facts()
  const spec = mp4Spec()
  const measurements = baseMeasurements({
    loudness: { ok: true, integratedLufs, lra: 6, truePeakDb: -1.5, errors: [] }
  })
  const task = { kind: 'convert', input: 'C:/in/source.mov', to: 'mp4', copy: false }
  const checks = runChecks(facts, spec, measurements, task)
  return { ok: false, task, spec, facts, checks, repairs: [] }
}

function gifVerdict() {
  const video = { index: 0, type: 'video', codec: 'gif', width: 480, height: 270, fps: 12 }
  const facts = {
    path: 'C:/out/cat.gif',
    bytes: 10 * 1024 * 1024,
    container: 'gif',
    formatName: 'gif',
    durationSec: 5.2,
    streams: [video],
    video,
    ffmpegVersion: '6.1.1'
  }
  const task = { kind: 'gif', input: 'C:/in/cat.mp4', from: 3.2, to: 8.4, fps: 12, width: 480, maxBytes: 8 * 1024 * 1024 }
  const spec = {
    container: 'gif',
    video: { codec: 'gif', width: 480, height: 270, fps: 12 },
    durationSec: { expect: 5.2, toleranceSec: 0.2 },
    maxBytes: 8 * 1024 * 1024,
    gif: { from: 3.2, to: 8.4, fps: 12, width: 480, loop: true },
    decodable: 'sample'
  }
  const measurements = baseMeasurements({
    task,
    gif: { frames: 62, loop: true, loopCount: 0, width: 480, height: 270, fps: 12, durationSec: 5.2 }
  })
  const checks = runChecks(facts, spec, measurements, task)
  return { ok: false, task, spec, facts, checks, repairs: [] }
}

test('planRepairs: loudness failure -> one gain action, no rerun', () => {
  const verdict = loudnessVerdict(-19)
  const actions = planRepairs(verdict, verdict.task, verdict.facts)

  assert.deepEqual(actions, [{ kind: 'gain', db: 5 }])
  assert.equal(verdict.checks.find(check => check.id === 'audio.loudness').outcome, 'fail')
})

test('planRepairs: no failed checks -> no actions', () => {
  const facts = mp4Facts()
  const spec = mp4Spec()
  const task = { kind: 'convert', input: 'C:/in/source.mov', to: 'mp4', copy: false }
  const checks = runChecks(facts, spec, baseMeasurements(), task)
  assert.deepEqual(planRepairs({ ok: true, task, spec, facts, checks, repairs: [] }, task, facts), [])
})

test('planRepairs: GIF over size -> reencode at even width 480 * 0.85 = 408', () => {
  const verdict = gifVerdict()
  const actions = planRepairs(verdict, verdict.task, verdict.facts)

  assert.equal(actions.length, 1)
  assert.deepEqual(actions[0], { kind: 'reencode', width: 408 })
})

test('planRepairs: GIF resize stops after two rounds and reports manual', () => {
  const verdict = gifVerdict()
  verdict.repairs = [
    { action: { kind: 'reencode', width: 408 }, ok: true, before: '10.0MB', after: '9.1MB' },
    { action: { kind: 'reencode', width: 346 }, ok: true, before: '9.1MB', after: '8.6MB' }
  ]
  const actions = planRepairs(verdict, verdict.task, verdict.facts)

  assert.equal(actions.length, 1)
  assert.equal(actions[0].kind, 'manual')
  assert.match(actions[0].reason, /缩宽已用 2\/2 轮/)
})

test('planRepairs: GIF width already at the floor -> manual', () => {
  const verdict = gifVerdict()
  verdict.facts.video.width = 64
  verdict.task.width = 64
  const actions = planRepairs(verdict, verdict.task, verdict.facts)

  assert.equal(actions[0].kind, 'manual')
  assert.match(actions[0].reason, /下限/)
})

test('planRepairs: copy-mode duration failure is manual with keyframe reason', () => {
  const verdict = {
    ok: false,
    mode: 'copy',
    task: { kind: 'convert', input: 'C:/in/source.mov', to: 'mp4', copy: true },
    spec: mp4Spec(),
    facts: mp4Facts({ durationSec: 13 }),
    repairs: [],
    checks: [
      {
        id: 'duration.drift',
        tier: 'L0',
        outcome: 'fail',
        expected: '12.00s ±0.20s（流拷贝）',
        actual: '13.00s',
        delta: '时长差 +1.00s'
      }
    ]
  }
  const actions = planRepairs(verdict)

  assert.equal(actions[0].kind, 'manual')
  assert.match(actions[0].reason, /关键帧/)
})

test('planRepairs: GIF duration failure reruns, then gives up after two reruns', () => {
  const verdict = gifVerdict()
  verdict.checks = [
    {
      id: 'gif.duration',
      tier: 'L0',
      outcome: 'fail',
      expected: '5.20s',
      actual: '5.60s',
      delta: '+0.40s',
      repair: { kind: 'rerun', reason: 'duration' }
    }
  ]
  assert.equal(planRepairs(verdict, verdict.task, verdict.facts)[0].kind, 'rerun')

  verdict.repairs = [
    { action: { kind: 'rerun', reason: 'a' }, ok: true, before: '5.6', after: '5.6' },
    { action: { kind: 'rerun', reason: 'b' }, ok: true, before: '5.6', after: '5.6' }
  ]
  const repeated = planRepairs(verdict, verdict.task, verdict.facts)
  assert.equal(repeated[0].kind, 'manual')
  assert.match(repeated[0].reason, /重跑已用 2\/2 轮/)
})

test('applyRepair: gain rebuilds audio only and keeps video as copy', () => {
  const verdict = loudnessVerdict(-19)
  const plan = applyRepair(verdict, { kind: 'gain', db: 5 }, verdict.task)

  assert.equal(plan.kind, 'audio-gain')
  assert.deepEqual(plan.rebuild, { video: 'copy', audio: 'encode', subtitle: 'copy', data: 'copy' })
  assert.equal(plan.filter, 'volume=+5.0dB')
  assert.equal(plan.round, 1)
  assert.equal(plan.maxRounds, 2)
  assert.equal(plan.audio.codec, 'aac')
  assert.ok(plan.notes.some(note => note.includes('-c:v copy')))
  assert.ok(!Object.prototype.hasOwnProperty.call(plan, 'argv'), 'caller owns argv')
})

test('applyRepair: GIF resize keeps selection and fps, rebuilds video only', () => {
  const verdict = gifVerdict()
  const plan = applyRepair(verdict, { kind: 'reencode', width: 408 }, verdict.task)

  assert.equal(plan.kind, 'gif-reencode')
  assert.deepEqual(plan.rebuild, { video: 'encode', audio: 'none' })
  assert.deepEqual(plan.selection, { from: 3.2, to: 8.4, lengthSec: 5.2 })
  assert.equal(plan.width, 408)
  assert.equal(plan.fps, 12)
  assert.match(plan.filter, /fps=12/)
  assert.match(plan.filter, /scale=408:-2/)
  assert.ok(plan.notes.some(note => note.includes('选区和帧率保持不变')))
})

test('applyRepair: gain without an audio stream returns null; manual returns null', () => {
  const verdict = loudnessVerdict(-19)
  verdict.facts = mp4Facts({ audio: undefined, streams: [{ index: 0, type: 'video', codec: 'h264' }] })
  assert.equal(applyRepair(verdict, { kind: 'gain', db: 3 }, verdict.task), null)
  assert.equal(applyRepair(loudnessVerdict(-19), { kind: 'manual', reason: 'x' }), null)
})

test('applyRepair: rerun plan states which streams it rebuilds', () => {
  const verdict = gifVerdict()
  const plan = applyRepair(verdict, { kind: 'rerun', reason: '时长不符' }, verdict.task)

  assert.equal(plan.kind, 'rerun')
  assert.deepEqual(plan.rebuild, { video: 'encode', audio: 'none', subtitle: 'copy' })
  assert.match(plan.notes.join(' '), /时长不符/)
})

test('applyRepair: unknown action kind throws', () => {
  assert.throws(
    () => applyRepair(loudnessVerdict(), { kind: 'magic' }),
    /unknown RepairAction kind/
  )
})
