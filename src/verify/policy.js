/**
 * Central policy for verification: every default tolerance, limit and retry cap
 * lives here. Checks and repairs must not hard-code numbers.
 *
 * `resolvePolicy(spec)` merges, in order:
 *   1. DEFAULT_POLICY
 *   2. spec.policy (optional deep override block, for callers that need a knob)
 *   3. the documented MediaSpec fields (durationSec.toleranceSec, audio.*, decodable)
 *
 * Pure data only. No I/O, no process, no time.
 */

/**
 * @typedef {object} DurationPolicy
 * @property {number} reencodeToleranceSec  Re-encode duration tolerance (seconds).
 * @property {number} copyWarnToleranceSec  Unused slack; copy mode never fails on duration.
 */

/**
 * @typedef {object} Policy
 * @property {DurationPolicy} duration
 * @property {{ fpsToleranceRatio: number, fpsToleranceAbs: number, requireEvenDimensions: boolean, sizeTolerancePx: number }} video
 * @property {{ loudnessToleranceLu: number, defaultTargetLufs: number, truePeakDbMax: number, truePeakRepairMarginDb: number, sampleRateToleranceHz: number }} audio
 * @property {{ durationToleranceSec: number, frameTolerance: number, frameWarnTolerance: number, requireLoop: boolean }} gif
 * @property {{ mode?: 'sample' | 'full' | 'none', sample: { headSec: number, tailSec: number, middleSec: number } }} decode
 * @property {{ maxLoudnessRounds: number, maxGifSizeRounds: number, maxRerunRounds: number, gainMinDb: number, maxGainDb: number, gifWidthScale: number, gifMinWidth: number }} repair
 */

/** @type {Readonly<Policy>} */
export const DEFAULT_POLICY = deepFreeze({
  duration: {
    /** Re-encoded duration may drift this much before it is a failure. */
    reencodeToleranceSec: 0.2,
    /** Copy mode drift is reported as warn, never fail. Value kept for display only. */
    copyWarnToleranceSec: 0.2
  },
  video: {
    /** Relative fps tolerance (2%). */
    fpsToleranceRatio: 0.02,
    /** Absolute fps floor for the tolerance (24 vs 25 should not pass). */
    fpsToleranceAbs: 0.05,
    /** 4:2:0 encoders fail on odd dimensions; warn only for pure stream copy. */
    requireEvenDimensions: true,
    /** Pixels of slack when a spec pins an exact width/height. */
    sizeTolerancePx: 1
  },
  audio: {
    /** Loudness target is a range; this is the default half-width when only a point is given. */
    loudnessToleranceLu: 1.0,
    /** Used only when the task explicitly asks for loudness normalisation. */
    defaultTargetLufs: -14,
    /** Default true-peak ceiling when loudness work is requested. */
    truePeakDbMax: -1.0,
    /** Headroom left below the ceiling when a true-peak repair is proposed. */
    truePeakRepairMarginDb: 0.1,
    sampleRateToleranceHz: 0
  },
  gif: {
    /** GIF duration must be within this of the selected segment. */
    durationToleranceSec: 0.2,
    /** Allowed |actual-expected| frame difference before warn/fail. */
    frameTolerance: 1,
    frameWarnTolerance: 2,
    requireLoop: true
  },
  decode: {
    sample: {
      headSec: 5,
      tailSec: 5,
      middleSec: 2
    }
  },
  repair: {
    /** Closed-loop loudness gain: at most two attempts. */
    maxLoudnessRounds: 2,
    /** GIF width shrink: at most two attempts. */
    maxGifSizeRounds: 2,
    /** Generic reruns for duration / decode failures. */
    maxRerunRounds: 2,
    /** Do not emit a gain repair smaller than this. */
    gainMinDb: 0.05,
    /** Safety clamp for a computed gain. */
    maxGainDb: 20,
    /** Width multiplier per GIF size repair round. */
    gifWidthScale: 0.85,
    /** Never shrink a GIF below this width. */
    gifMinWidth: 64
  }
})

/**
 * Resolve the effective policy for one verification run.
 * @param {object} [spec] MediaSpec (or a sparse object from the app layer).
 * @returns {Readonly<Policy>}
 */
export function resolvePolicy(spec = {}) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new TypeError('resolvePolicy(spec): spec must be a plain object')
  }

  const overrides = isPlainObject(spec.policy) ? spec.policy : {}
  const policy = deepMerge(DEFAULT_POLICY, overrides)

  const durationTolerance = spec.durationSec?.toleranceSec
  if (isNonNegativeNumber(durationTolerance)) {
    policy.duration.reencodeToleranceSec = durationTolerance
    // The one duration tolerance the caller can set also applies to GIF segments.
    policy.gif.durationToleranceSec = durationTolerance
  }

  const truePeakMax = spec.audio?.truePeakDbMax
  if (Number.isFinite(truePeakMax)) policy.audio.truePeakDbMax = truePeakMax

  const sampleRateTolerance = spec.audio?.sampleRateToleranceHz
  if (isNonNegativeNumber(sampleRateTolerance)) {
    policy.audio.sampleRateToleranceHz = sampleRateTolerance
  }

  if (spec.decodable === 'none' || spec.decodable === 'sample' || spec.decodable === 'full') {
    policy.decode.mode = spec.decodable
  }

  return deepFreeze(policy)
}

/**
 * Format the loudness expectation range for one verification run.
 * Returns null when the spec does not ask for loudness work.
 * @param {object} spec
 * @param {object} [measurements]
 * @param {Readonly<Policy>} [policy]
 * @returns {{ min: number, max: number, center: number, source: string } | null}
 */
export function resolveLoudnessTarget(spec = {}, measurements = {}, policy = resolvePolicy(spec)) {
  const specRange = spec.audio?.loudnessLufs
  if (Array.isArray(specRange) && specRange.length === 2 &&
      Number.isFinite(specRange[0]) && Number.isFinite(specRange[1])) {
    const min = Math.min(specRange[0], specRange[1])
    const max = Math.max(specRange[0], specRange[1])
    return { min, max, center: (min + max) / 2, source: 'spec.audio.loudnessLufs' }
  }

  const measuredTarget = measurements.expectedLoudnessLufs ?? measurements.loudnessTargetLufs
  if (Number.isFinite(measuredTarget)) {
    return pointTarget(measuredTarget, policy.audio.loudnessToleranceLu, 'measurements.expectedLoudnessLufs')
  }

  if (measurements.normalizeLoudness === true) {
    return pointTarget(policy.audio.defaultTargetLufs, policy.audio.loudnessToleranceLu, 'default')
  }

  return null
}

/**
 * Even width after one GIF size-repair round, respecting the minimum width.
 * @param {number} width
 * @param {Readonly<Policy>} [policy]
 * @returns {number}
 */
export function nextGifWidth(width, policy = DEFAULT_POLICY) {
  if (!Number.isFinite(width) || width <= 0) return Math.max(policy.repair.gifMinWidth, 2)
  const scaled = Math.round((width * policy.repair.gifWidthScale) / 2) * 2
  return Math.max(policy.repair.gifMinWidth, scaled || 2)
}

/**
 * @param {number} target
 * @param {number} halfWidth
 * @param {string} source
 */
function pointTarget(target, halfWidth, source) {
  return {
    min: target - halfWidth,
    max: target + halfWidth,
    center: target,
    source
  }
}

/** @param {unknown} value */
function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Deep clone-merge plain objects and arrays; later values win.
 * @template T
 * @param {T} base
 * @param {unknown} patch
 * @returns {T}
 */
function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return clone(base)
  const out = /** @type {Record<string, unknown>} */ (clone(base))
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value)
    } else if (Array.isArray(value)) {
      out[key] = value.slice()
    } else {
      out[key] = value
    }
  }
  return /** @type {T} */ (out)
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function clone(value) {
  if (Array.isArray(value)) return /** @type {T} */ (value.map(item => clone(item)))
  if (isPlainObject(value)) {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = clone(item)
    return /** @type {T} */ (out)
  }
  return value
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}
