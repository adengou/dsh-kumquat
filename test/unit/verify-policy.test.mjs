import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_POLICY,
  nextGifWidth,
  resolveLoudnessTarget,
  resolvePolicy
} from '../../src/verify/policy.js'

test('default tolerances match the design: 0.2s duration, 1.0 LU loudness, 0.2s GIF, two repair rounds', () => {
  assert.equal(DEFAULT_POLICY.duration.reencodeToleranceSec, 0.2)
  assert.equal(DEFAULT_POLICY.audio.loudnessToleranceLu, 1.0)
  assert.equal(DEFAULT_POLICY.audio.truePeakDbMax, -1.0)
  assert.equal(DEFAULT_POLICY.gif.durationToleranceSec, 0.2)
  assert.equal(DEFAULT_POLICY.gif.frameTolerance, 1)
  assert.equal(DEFAULT_POLICY.repair.maxLoudnessRounds, 2)
  assert.equal(DEFAULT_POLICY.repair.maxGifSizeRounds, 2)
  assert.equal(DEFAULT_POLICY.repair.gifWidthScale, 0.85)
  assert.equal(Object.isFrozen(DEFAULT_POLICY), true)
  assert.equal(Object.isFrozen(DEFAULT_POLICY.repair), true)
})

test('resolvePolicy lets MediaSpec override duration, true peak and decode mode', () => {
  const policy = resolvePolicy({
    durationSec: { expect: 5, toleranceSec: 0.5 },
    audio: { truePeakDbMax: -2 },
    decodable: 'full'
  })

  assert.equal(policy.duration.reencodeToleranceSec, 0.5)
  assert.equal(policy.gif.durationToleranceSec, 0.5, 'the one duration tolerance also covers GIF')
  assert.equal(policy.audio.truePeakDbMax, -2)
  assert.equal(policy.decode.mode, 'full')
  assert.equal(policy.repair.maxLoudnessRounds, 2, 'caps stay unless overridden')
})

test('resolvePolicy supports a deep policy override block without mutating defaults', () => {
  const policy = resolvePolicy({
    policy: {
      repair: { maxGifSizeRounds: 1 },
      video: { fpsToleranceRatio: 0.05 }
    }
  })

  assert.equal(policy.repair.maxGifSizeRounds, 1)
  assert.equal(policy.video.fpsToleranceRatio, 0.05)
  assert.equal(policy.repair.maxLoudnessRounds, 2)
  assert.equal(DEFAULT_POLICY.repair.maxGifSizeRounds, 2)
  assert.throws(() => resolvePolicy(null), /plain object/)
})

test('resolveLoudnessTarget: explicit range wins, a point gets ±1.0 LU, normalise uses -14', () => {
  assert.deepEqual(
    resolveLoudnessTarget({ audio: { loudnessLufs: [-16, -14] } }),
    { min: -16, max: -14, center: -15, source: 'spec.audio.loudnessLufs' }
  )
  assert.deepEqual(
    resolveLoudnessTarget({}, { expectedLoudnessLufs: -16 }),
    { min: -17, max: -15, center: -16, source: 'measurements.expectedLoudnessLufs' }
  )
  assert.deepEqual(
    resolveLoudnessTarget({}, { normalizeLoudness: true }),
    { min: -15, max: -13, center: -14, source: 'default' }
  )
  assert.equal(resolveLoudnessTarget({}, {}), null)
})

test('nextGifWidth applies 0.85, rounds to even, and never goes below 64', () => {
  assert.equal(nextGifWidth(480), 408)
  assert.equal(nextGifWidth(481), 408)
  assert.equal(nextGifWidth(64), 64)
  assert.equal(nextGifWidth(100), 86)
  assert.equal(nextGifWidth(0), 64)
  assert.equal(nextGifWidth(480) % 2, 0)
})
