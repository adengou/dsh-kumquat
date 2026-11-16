/**
 * Verification checks. Every check is a pure function:
 *
 *   (facts, spec, measurements) -> Check
 *
 * - `facts`        MediaFacts of the produced file (measured, not self-reported)
 * - `spec`         MediaSpec expectation (may be sparse)
 * - `measurements` decoder/loudness/GIF measurements plus optional context:
 *                  { mode: 'copy' | 'reencode', task, startOffsetSec,
 *                    expected: {...}, loudness, decode, gif, vfr }
 *
 * Every Check carries both `expected` and `actual`, even when skipped.
 * No I/O, no process, no clock: unit-testable with plain objects.
 */

import { nextGifWidth, resolveLoudnessTarget, resolvePolicy } from './policy.js'

const MB = 1024 * 1024
const CODEC_ALIASES = Object.freeze({
  avc1: 'h264',
  avc3: 'h264',
  h265: 'hevc',
  hev1: 'hevc',
  hvc1: 'hevc',
  mp4a: 'aac',
  libfdk_aac: 'aac',
  libmp3lame: 'mp3',
  libx264: 'h264',
  libx265: 'hevc',
  libvpx: 'vp8',
  'libvpx-vp9': 'vp9',
  libvorbis: 'vorbis'
})

/**
 * The default catalogue, in display order.
 * @type {ReadonlyArray<(facts: object, spec: object, measurements: object) => object>}
 */
export const CHECKS = Object.freeze([
  checkStreamsCount,
  checkVideoCodec,
  checkVideoResolution,
  checkVideoFps,
  checkDurationDrift,
  checkSizeBudget,
  checkAudioCodec,
  checkAudioSampleRate,
  checkAudioChannels,
  checkAudioLoudness,
  checkAudioTruePeak,
  checkDecodableSample,
  checkDecodableFull,
  checkGifDuration,
  checkGifFrames,
  checkGifLoop
])

/**
 * Run every check.
 * @param {object} facts
 * @param {object} [spec]
 * @param {object} [measurements]
 * @param {object} [task] Optional task; merged into measurements for checks that need it.
 * @returns {object[]}
 */
export function runChecks(facts, spec = {}, measurements = {}, task) {
  const context = task
    ? { ...(measurements ?? {}), task: measurements?.task ?? task }
    : (measurements ?? {})
  return CHECKS.map(fn => fn(facts ?? {}, spec ?? {}, context))
}

/**
 * Aggregate a verdict from checks. Warn and skipped never make `ok` false;
 * only a failed check does.
 * @param {object[]} checks
 */
export function summarizeChecks(checks) {
  const counts = { pass: 0, warn: 0, fail: 0, skipped: 0 }
  for (const item of Array.isArray(checks) ? checks : []) {
    if (item && Object.prototype.hasOwnProperty.call(counts, item.outcome)) {
      counts[/** @type {'pass'|'warn'|'fail'|'skipped'} */ (item.outcome)] += 1
    }
  }
  return {
    ok: counts.fail === 0,
    total: counts.pass + counts.warn + counts.fail + counts.skipped,
    ...counts
  }
}

/**
 * @param {object} facts
 * @param {object} spec
 * @param {object} measurements
 */
export function checkStreamsCount(facts, spec = {}, measurements = {}) {
  const streams = Array.isArray(facts?.streams) ? facts.streams : []
  const videoCount = streams.filter(stream => stream?.type === 'video').length
  const audioCount = streams.filter(stream => stream?.type === 'audio').length
  const actual = streams.length === 0
    ? '0 路流'
    : `${streams.length} 路（${streams.map(stream => `${stream.type}:${stream.codec ?? '?'}`).join('、')}）`
  const gif = gifSelection(spec, measurements)

  if (gif) {
    const expected = '1 路视频、0 路音频（GIF 无声音）'
    if (videoCount === 1 && audioCount === 0 && streams.length === 1) {
      return check('streams.count', 'L0', 'pass', expected, actual)
    }
    const delta = [
      videoCount !== 1 ? `视频 ${videoCount} 路（期望 1）` : null,
      audioCount !== 0 ? `音频 ${audioCount} 路（期望 0）` : null,
      streams.length !== 1 ? `总流数 ${streams.length}（期望 1）` : null
    ].filter(Boolean).join('；')
    return check('streams.count', 'L0', 'fail', expected, actual, {
      delta,
      hint: 'GIF 只能有 1 路视频流且没有声音；检查是否把音频或字幕误映射进了输出。'
    })
  }

  if (Number.isFinite(measurements.expected?.streams)) {
    const expectedTotal = measurements.expected.streams
    const expected = `共 ${expectedTotal} 路流`
    if (streams.length === expectedTotal) {
      return check('streams.count', 'L0', 'pass', expected, actual)
    }
    return check('streams.count', 'L0', 'fail', expected, actual, {
      delta: `实际 ${streams.length} 路，差 ${streams.length - expectedTotal} 路`,
      hint: '流的数量与任务配方不一致；检查 -map 参数和源文件。'
    })
  }

  let expected
  let missing
  if (spec.video && spec.audio) {
    expected = '2 路：1 路视频 + 1 路音频（可含字幕流）'
    missing = videoCount < 1 || audioCount < 1
  } else if (spec.video) {
    expected = '至少 1 路视频（音频可选）'
    missing = videoCount < 1
  } else if (spec.audio) {
    expected = '至少 1 路音频（可含封面图流）'
    missing = audioCount < 1
  } else {
    expected = '至少 1 路流'
    missing = streams.length < 1
  }

  if (missing) {
    return check('streams.count', 'L0', 'fail', expected, actual, {
      delta: '缺少任务要求的流',
      hint: '源文件缺少对应流，或 -map 把流丢掉了；先 probe 输入再决定任务。'
    })
  }
  return check('streams.count', 'L0', 'pass', expected, actual)
}

export function checkVideoCodec(facts, spec = {}, measurements = {}) {
  const gif = gifSelection(spec, measurements)
  const video = videoStream(facts)
  const expected = normalizeCodec(
    spec.video?.codec ?? measurements.expected?.videoCodec ?? (gif ? 'gif' : null)
  )

  if (!expected) {
    return check('video.codec', 'L0', 'skipped',
      '未指定视频编码（仅记录实际值）',
      video ? `${normalizeCodec(video.codec) ?? '未知'}` : '无视频流')
  }
  if (!video) {
    return check('video.codec', 'L0', 'fail',
      `视频编码 ${expected}`,
      '无视频流', {
        delta: `缺少 ${expected} 视频流`,
        hint: '源文件没有视频流，或输出误用了纯音频容器；先 probe 输入确认。'
      })
  }
  const actual = normalizeCodec(video.codec)
  if (actual === expected) {
    return check('video.codec', 'L0', 'pass', `视频编码 ${expected}`, actual)
  }
  return check('video.codec', 'L0', 'fail', `视频编码 ${expected}`, actual, {
    delta: `实际 ${actual ?? '未知'}，期望 ${expected}`,
    hint: '容器与编码不匹配：换目标容器，或显式指定可用的编码器。'
  })
}

export function checkVideoResolution(facts, spec = {}, measurements = {}) {
  const policy = resolvePolicy(spec)
  const gif = gifSelection(spec, measurements)
  const video = videoStream(facts)
  const width = numberOrNull(video?.width)
  const height = numberOrNull(video?.height)

  if (gif) {
    const expectedWidth = numberOrNull(gif.width) ?? numberOrNull(measurements.expected?.gifWidth)
    const expected = expectedWidth === null ? '未指定 GIF 宽度' : `${expectedWidth}px 宽（高按比例，不要求偶数）`
    if (!video || width === null || height === null) {
      return check('video.resolution', 'L0', 'fail', expected, '无视频流', {
        delta: '缺少视频流',
        hint: 'GIF 必须有 1 路视频流；检查输入与 -map。'
      })
    }
    const actual = `${width}×${height}`
    if (expectedWidth === null) {
      return check('video.resolution', 'L0', 'skipped', expected, actual, {
        hint: '任务没有指定 GIF 宽度，只记录实际尺寸。'
      })
    }
    const diff = width - expectedWidth
    if (Math.abs(diff) <= policy.video.sizeTolerancePx) {
      return check('video.resolution', 'L0', 'pass', expected, actual)
    }
    return check('video.resolution', 'L0', 'fail', expected, actual, {
      delta: `宽度差 ${signed(diff, 0)}px`,
      hint: 'GIF 宽度由 scale=w:-2 决定；检查缩放滤镜是否被覆盖或参数被空格切断。'
    })
  }

  const specWidth = numberOrNull(spec.video?.width)
  const specHeight = numberOrNull(spec.video?.height)
  const expected = resolutionExpectation(specWidth, specHeight, policy.video.requireEvenDimensions)
  if (!video) {
    if (spec.video) {
      return check('video.resolution', 'L0', 'fail', expected, '无视频流', {
        delta: '缺少视频流',
        hint: '转换目标需要视频流，但输出没有；检查 -map 与源文件。'
      })
    }
    return check('video.resolution', 'L0', 'skipped', expected, '无视频流（音频任务）')
  }
  if (width === null || height === null) {
    return check('video.resolution', 'L0', 'skipped', expected, '视频流未报告宽高')
  }

  const actual = `${width}×${height}`
  const widthDiff = specWidth === null ? 0 : width - specWidth
  const heightDiff = specHeight === null ? 0 : height - specHeight
  const mismatch = (specWidth !== null && Math.abs(widthDiff) > policy.video.sizeTolerancePx) ||
    (specHeight !== null && Math.abs(heightDiff) > policy.video.sizeTolerancePx)
  const odd = policy.video.requireEvenDimensions && (width % 2 !== 0 || height % 2 !== 0)
  const copy = isCopyMode(measurements)
  const deltaParts = []
  if (mismatch) {
    if (specWidth !== null && Math.abs(widthDiff) > policy.video.sizeTolerancePx) {
      deltaParts.push(`宽度差 ${signed(widthDiff, 0)}px`)
    }
    if (specHeight !== null && Math.abs(heightDiff) > policy.video.sizeTolerancePx) {
      deltaParts.push(`高度差 ${signed(heightDiff, 0)}px`)
    }
  }
  if (odd) {
    deltaParts.push(`宽 ${width}×高 ${height} 含奇数（4:2:0 编码要求偶数）`)
  }

  if (mismatch) {
    return check('video.resolution', 'L0', 'fail', expected, actual, {
      delta: deltaParts.join('；'),
      hint: '尺寸与期望不符：用 scale=W:H 精确缩放，或用 -2 保持比例且保证偶数。'
    })
  }
  if (odd && copy) {
    return check('video.resolution', 'L0', 'warn', expected, actual, {
      delta: deltaParts.join('；'),
      hint: '纯流拷贝保留源尺寸，无法改奇偶；兼容性取决于编码 profile。要保证偶数请允许重编码。'
    })
  }
  if (odd) {
    return check('video.resolution', 'L0', 'fail', expected, actual, {
      delta: deltaParts.join('；'),
      hint: '奇数宽高在 yuv420p 下会失败或产生绿边；用 scale=trunc(iw/2)*2:trunc(ih/2)*2 修正。'
    })
  }
  return check('video.resolution', 'L0', 'pass', expected, actual)
}

export function checkVideoFps(facts, spec = {}, measurements = {}) {
  const policy = resolvePolicy(spec)
  const gif = gifSelection(spec, measurements)
  const video = videoStream(facts)
  const expectedFps = numberOrNull(spec.video?.fps) ?? numberOrNull(gif?.fps) ??
    numberOrNull(measurements.expected?.fps)
  const actualFps = numberOrNull(video?.fps) ?? numberOrNull(measurements.gif?.fps)
  const vfr = measurements.vfr === true || measurements.video?.vfr === true || facts?.video?.vfr === true

  if (vfr) {
    return check('video.fps', 'L0', 'warn',
      expectedFps === null ? '恒定帧率' : `${formatFps(expectedFps)} fps（恒定）`,
      actualFps === null ? 'VFR（帧间隔不固定，未给出平均帧率）' : `${formatFps(actualFps)} fps（VFR，帧间隔不固定）`, {
        delta: '帧率不恒定',
        hint: 'VFR 在剪辑、拼接或转 GIF 后会时间轴漂移；显式加 fps=12 之类固定帧率再转。'
      })
  }
  if (expectedFps === null) {
    return check('video.fps', 'L0', 'skipped',
      '未指定帧率（保持源帧率）',
      actualFps === null ? '视频流未报告帧率' : `${formatFps(actualFps)} fps`)
  }
  if (actualFps === null) {
    return check('video.fps', 'L0', 'skipped',
      `${formatFps(expectedFps)} fps`,
      '视频流未报告帧率', {
        hint: 'ffprobe 没有给出帧率；请检查流是否损坏。'
      })
  }
  const tolerance = Math.max(policy.video.fpsToleranceAbs, expectedFps * policy.video.fpsToleranceRatio)
  const diff = actualFps - expectedFps
  if (Math.abs(diff) <= tolerance + 1e-9) {
    return check('video.fps', 'L0', 'pass', `${formatFps(expectedFps)} fps（±${formatFps(tolerance)}）`, `${formatFps(actualFps)} fps`)
  }
  return check('video.fps', 'L0', 'fail', `${formatFps(expectedFps)} fps（±${formatFps(tolerance)}）`, `${formatFps(actualFps)} fps`, {
    delta: `${signed(diff, 2)} fps`,
    hint: '帧率不符：检查 fps 滤镜、目标容器上限和是否被 VFR 源文件带偏。'
  })
}

export function checkDurationDrift(facts, spec = {}, measurements = {}) {
  const policy = resolvePolicy(spec)
  const gif = gifSelection(spec, measurements)
  const actual = numberOrNull(facts?.durationSec)
  if (gif) {
    return check('duration.drift', 'L0', 'skipped',
      'GIF 任务由 gif.duration 单独验收',
      actual === null ? '时长未知' : secText(actual))
  }

  const expected = numberOrNull(spec.durationSec?.expect) ??
    numberOrNull(measurements.sourceDurationSec) ??
    numberOrNull(measurements.expected?.durationSec)
  if (expected === null) {
    return check('duration.drift', 'L0', 'skipped',
      '未指定预期时长',
      actual === null ? '时长未知' : secText(actual))
  }
  if (actual === null) {
    return check('duration.drift', 'L0', 'skipped',
      `${secText(expected)} ±${policy.duration.reencodeToleranceSec.toFixed(2)}s`,
      '时长未知', {
        hint: '容器没有报告时长；先 probe 失败，再查 moov/索引。'
      })
  }

  const copy = isCopyMode(measurements)
  const tolerance = copy
    ? policy.duration.copyWarnToleranceSec
    : policy.duration.reencodeToleranceSec
  const diff = actual - expected
  const startOffset = resolveStartOffset(measurements)
  const expectedText = `${secText(expected)} ±${tolerance.toFixed(2)}s（${copy ? '流拷贝' : '重编码'}）`
  const actualText = startOffset === null
    ? secText(actual)
    : `${secText(actual)}；实际起点比请求起点 ${signed(startOffset, 2)}s`
  const deltaText = `时长差 ${signed(diff, 2)}s`

  if (Math.abs(diff) <= tolerance + 1e-9) {
    return check('duration.drift', 'L0', 'pass', expectedText, actualText, { delta: deltaText })
  }

  if (copy) {
    return check('duration.drift', 'L0', 'warn', expectedText, actualText, {
      delta: `${deltaText}${startOffset === null ? '（未单独测量起点偏移）' : ''}`,
      hint: '流拷贝只能落在关键帧上，起点/终点会前后跳，偏差不算失败；要精确时长请改用重编码。'
    })
  }

  return check('duration.drift', 'L0', 'fail', expectedText, actualText, {
    delta: deltaText,
    hint: '重编码时长偏离：检查 -t/-to 精度与音视频时间基；修法是按原参数重跑一次。',
    repair: { kind: 'rerun', reason: `重编码时长 ${secText(actual)}，与期望 ${secText(expected)} 相差 ${signed(diff, 2)}s` }
  })
}

export function checkSizeBudget(facts, spec = {}, measurements = {}) {
  const policy = resolvePolicy(spec)
  const gif = gifSelection(spec, measurements)
  const bytes = numberOrNull(facts?.bytes)
  const limit = numberOrNull(spec.maxBytes) ??
    numberOrNull(measurements.task?.maxBytes) ??
    numberOrNull(measurements.maxBytes)

  if (limit === null || limit <= 0) {
    return check('size.budget', 'L0', 'skipped',
      '未设体积上限',
      bytes === null ? '文件大小未知' : bytesText(bytes))
  }
  if (bytes === null) {
    return check('size.budget', 'L0', 'skipped', `≤ ${bytesText(limit)}`, '文件大小未知')
  }

  const expected = `≤ ${bytesText(limit)}`
  const actual = bytesText(bytes)
  if (bytes <= limit) {
    const headroom = limit - bytes
    return check('size.budget', 'L0', 'pass', expected, actual, {
      delta: `余量 ${(headroom / MB).toFixed(2)} MB`
    })
  }

  const over = bytes - limit
  const percent = limit > 0 ? (over / limit) * 100 : 0
  const extra = {
    delta: `超限 ${(over / MB).toFixed(2)} MB（${percent.toFixed(1)}%）`
  }
  if (gif) {
    const width = numberOrNull(facts?.video?.width) ?? numberOrNull(gif.width) ?? 0
    extra.repair = { kind: 'reencode', width: nextGifWidth(width, policy) }
    extra.hint = 'GIF 超体积：宽度 ×0.85 重试，选区和帧率不动；最多两轮，仍超就报差多少。'
  } else {
    extra.hint = '体积超限：提高压缩率或降低码率；格式转换默认不做隐式降质。'
  }
  return check('size.budget', 'L0', 'fail', expected, actual, extra)
}

export function checkAudioCodec(facts, spec = {}, measurements = {}) {
  const gif = gifSelection(spec, measurements)
  if (gif) {
    return check('audio.codec', 'L0', 'skipped', '不适用（GIF 无音轨）', '无音频流')
  }
  const audio = audioStream(facts)
  const expected = normalizeCodec(spec.audio?.codec ?? measurements.expected?.audioCodec)
  if (!expected) {
    return check('audio.codec', 'L0', 'skipped',
      '未指定音频编码（仅记录实际值）',
      audio ? `${normalizeCodec(audio.codec) ?? '未知'}` : '无音频流')
  }
  if (!audio) {
    return check('audio.codec', 'L0', 'fail', `音频编码 ${expected}`, '无音频流', {
      delta: '缺少音频流',
      hint: '目标需要音频但输出没有音轨；确认源文件含音频，且 -map 没有漏掉 0:a。'
    })
  }
  const actual = normalizeCodec(audio.codec)
  if (actual === expected) {
    return check('audio.codec', 'L0', 'pass', `音频编码 ${expected}`, actual)
  }
  return check('audio.codec', 'L0', 'fail', `音频编码 ${expected}`, actual, {
    delta: `实际 ${actual ?? '未知'}，期望 ${expected}`,
    hint: '音频编码与规格不符：换编码器或修正目标容器默认编码。'
  })
}

export function checkAudioSampleRate(facts, spec = {}, measurements = {}) {
  const policy = resolvePolicy(spec)
  const gif = gifSelection(spec, measurements)
  if (gif) {
    return check('audio.sampleRate', 'L0', 'skipped', '不适用（GIF 无音轨）', '无音频流')
  }
  const audio = audioStream(facts)
  const expected = numberOrNull(spec.audio?.sampleRate)
  if (expected === null) {
    return check('audio.sampleRate', 'L0', 'skipped',
      '未指定采样率（仅记录实际值）',
      audio ? `${audio.sampleRate ?? '未知'} Hz` : '无音频流')
  }
  if (!audio) {
    return check('audio.sampleRate', 'L0', 'fail', `${expected} Hz`, '无音频流', {
      delta: '缺少音频流',
      hint: '目标要求音频采样率，但输出没有音轨。'
    })
  }
  const actual = numberOrNull(audio.sampleRate)
  if (actual === null) {
    return check('audio.sampleRate', 'L0', 'skipped', `${expected} Hz`, '音频流未报告采样率')
  }
  const diff = actual - expected
  if (Math.abs(diff) <= policy.audio.sampleRateToleranceHz) {
    return check('audio.sampleRate', 'L0', 'pass', `${expected} Hz`, `${actual} Hz`)
  }
  return check('audio.sampleRate', 'L0', 'fail', `${expected} Hz`, `${actual} Hz`, {
    delta: `${signed(diff, 0)} Hz`,
    hint: '采样率不符：加 -ar 目标值，或换支持该采样率的编码器。'
  })
}

export function checkAudioChannels(facts, spec = {}, measurements = {}) {
  const gif = gifSelection(spec, measurements)
  if (gif) {
    return check('audio.channels', 'L0', 'skipped', '不适用（GIF 无音轨）', '无音频流')
  }
  const audio = audioStream(facts)
  const expected = numberOrNull(spec.audio?.channels)
  if (expected === null) {
    return check('audio.channels', 'L0', 'skipped',
      '未指定声道数（仅记录实际值）',
      audio ? `${audio.channels ?? '未知'} 声道` : '无音频流')
  }
  if (!audio) {
    return check('audio.channels', 'L0', 'fail', `${expected} 声道`, '无音频流', {
      delta: '缺少音频流',
      hint: '目标要求声道数，但输出没有音轨。'
    })
  }
  const actual = numberOrNull(audio.channels)
  if (actual === null) {
    return check('audio.channels', 'L0', 'skipped', `${expected} 声道`, '音频流未报告声道数')
  }
  if (actual === expected) {
    return check('audio.channels', 'L0', 'pass', `${expected} 声道`, `${actual} 声道`)
  }
  return check('audio.channels', 'L0', 'fail', `${expected} 声道`, `${actual} 声道`, {
    delta: `差 ${signed(actual - expected, 0)} 声道`,
    hint: '声道数不符：加 -ac 目标值；抽音时注意 5.1 下混会改变响度。'
  })
}

export function checkAudioLoudness(facts, spec = {}, measurements = {}) {
  const policy = resolvePolicy(spec)
  const gif = gifSelection(spec, measurements)
  const audio = audioStream(facts)
  const m = measurements.loudness
  if (gif) {
    return check('audio.loudness', 'L1', 'skipped', '不适用（GIF 无音轨）', '无音频流')
  }

  const target = resolveLoudnessTarget(spec, measurements, policy)
  if (!target) {
    return check('audio.loudness', 'L1', 'skipped',
      '未设置响度目标（仅记录实测）',
      m && isMeasuredNumber(m.integratedLufs) ? lufsText(m.integratedLufs) : '未测量')
  }

  const expected = `${target.min.toFixed(2)} ~ ${target.max.toFixed(2)} LUFS`
  if (!audio) {
    return check('audio.loudness', 'L1', 'fail', expected, '无音频流', {
      delta: '无音频流可测',
      hint: '响度任务需要音轨；先 probe 输入，或去掉响度要求。'
    })
  }
  if (!m) {
    return check('audio.loudness', 'L1', 'skipped', expected, '未测量响度（L1 未执行）', {
      hint: '调用 measure.loudness(path)；不要采信 loudnorm 滤镜自报的数值。'
    })
  }
  if (m.ok === false) {
    return check('audio.loudness', 'L1', 'skipped', expected,
      `测量失败：${firstLine(m.errors?.[0] ?? m.stderr) || 'ebur128 未给出结果'}`, {
        hint: '先确认音轨可解码；测量失败不算产物不合格，但不能签发通过。'
      })
  }

  const actual = m.integratedLufs
  if (actual === null || actual === undefined || Number.isNaN(actual)) {
    return check('audio.loudness', 'L1', 'fail', expected, '未测到有效响度', {
      delta: 'ebur128 Summary 缺少 I 行',
      hint: '音轨可能为空或损坏；先全片解码定位坏区间，再谈响度。'
    })
  }
  if (actual === -Infinity) {
    return check('audio.loudness', 'L1', 'fail', expected, lufsText(actual), {
      delta: '整段静音，低于下限',
      hint: '先确认音轨不是静音；静音不能靠增益修复。'
    })
  }

  const centerDelta = actual - target.center
  if (actual >= target.min && actual <= target.max) {
    return check('audio.loudness', 'L1', 'pass', expected, lufsText(actual), {
      delta: `在容差内（偏离中心 ${signed(centerDelta, 2)} LU）`
    })
  }

  const below = actual < target.min
  const delta = below
    ? `低于下限 ${(target.min - actual).toFixed(2)} LU`
    : `高于上限 ${(actual - target.max).toFixed(2)} LU`
  const rawGain = target.center - actual
  const gain = clamp(round1(rawGain), -policy.repair.maxGainDb, policy.repair.maxGainDb)
  const extra = { delta }
  if (Math.abs(gain) >= policy.repair.gainMinDb) {
    extra.repair = { kind: 'gain', db: gain }
    extra.hint = `闭环增益 ${signed(gain, 1)} dB：只重编音频（-c:v copy）后再测，最多 ${policy.repair.maxLoudnessRounds} 轮，不采信滤镜自报。`
  } else {
    extra.hint = '偏差小于可执行增益；先确认测量是否落在同一段音频上。'
  }
  return check('audio.loudness', 'L1', 'fail', expected, lufsText(actual), extra)
}

export function checkAudioTruePeak(facts, spec = {}, measurements = {}) {
  const policy = resolvePolicy(spec)
  const gif = gifSelection(spec, measurements)
  const audio = audioStream(facts)
  const m = measurements.loudness
  if (gif) {
    return check('audio.truePeak', 'L1', 'skipped', '不适用（GIF 无音轨）', '无音频流')
  }

  const target = resolveLoudnessTarget(spec, measurements, policy)
  let maxDb = numberOrNull(spec.audio?.truePeakDbMax) ?? numberOrNull(measurements.truePeakDbMax)
  if (maxDb === null && target) maxDb = policy.audio.truePeakDbMax
  if (maxDb === null) {
    return check('audio.truePeak', 'L1', 'skipped',
      '未设置真峰值上限（仅记录实测）',
      m && isMeasuredNumber(m.truePeakDb) ? dbText(m.truePeakDb) : '未测量')
  }

  const expected = `≤ ${maxDb.toFixed(2)} dBTP`
  if (!audio) {
    return check('audio.truePeak', 'L1', 'fail', expected, '无音频流', {
      delta: '无音频流可测',
      hint: '真峰值任务需要音轨；先 probe 输入。'
    })
  }
  if (!m) {
    return check('audio.truePeak', 'L1', 'skipped', expected, '未测量真峰值（L1 未执行）', {
      hint: '调用 measure.loudness(path)，ebur128=peak=true 会同时给出真峰值。'
    })
  }
  if (m.ok === false) {
    return check('audio.truePeak', 'L1', 'skipped', expected,
      `测量失败：${firstLine(m.errors?.[0] ?? m.stderr) || 'ebur128 未给出结果'}`, {
        hint: '测量失败不能签发真峰值通过；先确认音轨可解码再复测。'
      })
  }
  const peak = m.truePeakDb
  if (peak === null || peak === undefined || Number.isNaN(peak)) {
    return check('audio.truePeak', 'L1', 'skipped', expected, 'ebur128 未给出真峰值', {
      hint: '部分素材/版本没有 Peak 行；可换 -af ebur128=peak=true 重测。'
    })
  }
  if (peak === -Infinity || peak <= maxDb) {
    return check('audio.truePeak', 'L1', 'pass', expected, dbText(peak))
  }

  const gain = clamp(
    round1(maxDb - peak - policy.audio.truePeakRepairMarginDb),
    -policy.repair.maxGainDb,
    0
  )
  const extra = {
    delta: `超出上限 ${(peak - maxDb).toFixed(2)} dB`,
    hint: '先降增益或加限幅器，保证真峰值不超上限；下一轮复测。'
  }
  if (Math.abs(gain) >= policy.repair.gainMinDb) {
    extra.repair = { kind: 'gain', db: gain }
  }
  return check('audio.truePeak', 'L1', 'fail', expected, dbText(peak), extra)
}

export function checkDecodableSample(facts, spec = {}, measurements = {}) {
  const mode = spec.decodable ?? measurements.decodeMode ?? null
  if (mode === 'none') {
    return check('decodable.sample', 'L1', 'skipped',
      '不要求解码（spec.decodable=none）',
      '未执行解码')
  }

  const sample = measurements.decode?.sample
  if (!sample) {
    return check('decodable.sample', 'L1', 'skipped',
      '首 5s、末 5s、中段 2s 可解码',
      '未执行采样解码', {
        hint: '调用 measure.decode(path, { sample: "sample" }) 后再验收。'
      })
  }

  const windows = Array.isArray(sample.windows) ? sample.windows : []
  const executed = windows.filter(window => !window.skipped)
  const failed = executed.filter(window => window.ok === false)
  const label = executed.map(window => windowLabel(window.id)).join(' / ') || '无窗口'
  const actual = executed.length === 0
    ? '没有可执行的采样窗口'
    : `${executed.length - failed.length}/${executed.length} 个窗口通过（${label}）`
  if (sample.ok === false || failed.length > 0) {
    return check('decodable.sample', 'L1', 'fail',
      '首 5s、末 5s、中段 2s 均可解码',
      actual, {
        delta: failed.length > 0 ? `${failed.length} 个窗口解码失败` : '采样解码失败',
        hint: `先看第一行错误：${firstLine(sample.errors?.[0] ?? sample.stderr) || '无 stderr'}；坏区间可能只在局部。`
      })
  }
  if (sample.clean === false || String(sample.stderr ?? '').trim() !== '') {
    return check('decodable.sample', 'L1', 'warn',
      '采样窗口解码无错误输出',
      actual, {
        delta: '解码通过但有 stderr',
        hint: `ffmpeg 仍报：${firstLine(sample.stderr)}；可能是时间戳/丢帧告警，全片解码可进一步确认。`
      })
  }
  return check('decodable.sample', 'L1', 'pass',
    '首 5s、末 5s、中段 2s 均可解码',
    actual)
}

export function checkDecodableFull(facts, spec = {}, measurements = {}) {
  const full = measurements.decode?.full
  if (spec.decodable !== 'full') {
    return check('decodable.full', 'L2', 'skipped',
      '仅显式开启（spec.decodable=full）',
      full ? '本次已额外执行全片解码' : '未执行全片解码')
  }
  if (!full) {
    return check('decodable.full', 'L2', 'skipped',
      '全片解码无错误',
      '未执行全片解码', {
        hint: 'spec 要求全片解码，但调用方没有传入 measurements.decode.full。'
      })
  }
  const actual = full.ok === false
    ? `全片解码失败（${firstLine(full.errors?.[0] ?? full.stderr) || '无 stderr'}）`
    : '全片解码通过'
  if (full.ok === false) {
    return check('decodable.full', 'L2', 'fail', '全片解码无错误', actual, {
      delta: '存在不可解码区间',
      hint: '全片解码失败通常意味着源文件损坏或编码器输出截断；先定位时间点再决定重跑或换源。'
    })
  }
  if (full.clean === false || String(full.stderr ?? '').trim() !== '') {
    return check('decodable.full', 'L2', 'warn', '全片解码无错误输出', actual, {
      delta: '解码通过但有 stderr',
      hint: `ffmpeg 仍报：${firstLine(full.stderr)}`
    })
  }
  return check('decodable.full', 'L2', 'pass', '全片解码无错误', actual)
}

export function checkGifDuration(facts, spec = {}, measurements = {}) {
  const policy = resolvePolicy(spec)
  const gif = gifSelection(spec, measurements)
  // GIF often has no format duration in ffprobe; gifInfo falls back to frame
  // delays. Prefer that measured value over facts.durationSec.
  const actual = numberOrNull(measurements.gif?.durationSec) ?? numberOrNull(facts?.durationSec)
  if (!gif) {
    return check('gif.duration', 'L0', 'skipped',
      '非 GIF 任务',
      actual === null ? '时长未知' : secText(actual))
  }
  const expected = gif.lengthSec
  const expectedText = `${secText(expected)}（选区 ${gif.from.toFixed(2)}s ~ ${gif.to.toFixed(2)}s，±${policy.gif.durationToleranceSec.toFixed(2)}s）`
  if (actual === null) {
    return check('gif.duration', 'L0', 'skipped', expectedText, 'GIF 时长未知', {
      hint: '用 ffprobe 读 GIF 时长；读不到说明帧延迟表异常。'
    })
  }
  const diff = actual - expected
  const actualText = secText(actual)
  if (Math.abs(diff) <= policy.gif.durationToleranceSec + 1e-9) {
    return check('gif.duration', 'L0', 'pass', expectedText, actualText, {
      delta: `时长差 ${signed(diff, 2)}s`
    })
  }
  return check('gif.duration', 'L0', 'fail', expectedText, actualText, {
    delta: `时长差 ${signed(diff, 2)}s（超出 ±${policy.gif.durationToleranceSec.toFixed(2)}s）`,
    hint: 'GIF 时长应按选区生成；检查 -ss/-t 与 fps 滤镜，帧延迟取整会带来 ±1 帧。',
    repair: { kind: 'rerun', reason: `GIF 时长 ${secText(actual)} 与选区 ${secText(expected)} 相差 ${signed(diff, 2)}s` }
  })
}

export function checkGifFrames(facts, spec = {}, measurements = {}) {
  const policy = resolvePolicy(spec)
  const gif = gifSelection(spec, measurements)
  if (!gif) {
    return check('gif.frames', 'L1', 'skipped', '非 GIF 任务', '未检查帧数')
  }
  const fps = numberOrNull(gif.fps) ?? numberOrNull(measurements.gif?.fps) ??
    numberOrNull(facts?.video?.fps)
  if (fps === null) {
    return check('gif.frames', 'L1', 'skipped',
      '选段帧率未知，无法计算期望帧数',
      measurements.gif?.frames === undefined ? '未测量帧数' : `${measurements.gif.frames} 帧`)
  }
  const expectedFrames = Math.round(gif.lengthSec * fps)
  const expected = `≈ ${expectedFrames} 帧（${secText(gif.lengthSec)} × ${formatFps(fps)} fps，±${policy.gif.frameTolerance} 帧）`
  const frames = numberOrNull(measurements.gif?.frames)
  if (frames === null) {
    return check('gif.frames', 'L1', 'skipped', expected, '未测量帧数（L1 未执行）', {
      hint: '调用 measure.gifInfo(path)，帧数来自 ffprobe -count_frames。'
    })
  }
  const actual = `${frames} 帧`
  const diff = frames - expectedFrames
  if (frames < 1) {
    return check('gif.frames', 'L1', 'fail', expected, actual, {
      delta: '没有有效帧',
      hint: 'GIF 为空：检查选区是否落在视频范围外，或 -frames:v 是否误用。'
    })
  }
  if (Math.abs(diff) <= policy.gif.frameTolerance) {
    return check('gif.frames', 'L1', 'pass', expected, actual, { delta: `${signed(diff, 0)} 帧` })
  }
  if (Math.abs(diff) <= policy.gif.frameWarnTolerance) {
    return check('gif.frames', 'L1', 'warn', expected, actual, {
      delta: `${signed(diff, 0)} 帧`,
      hint: '差 2 帧以内通常是首尾帧取整；不影响观看，但时长会略偏。'
    })
  }
  return check('gif.frames', 'L1', 'fail', expected, actual, {
    delta: `${signed(diff, 0)} 帧`,
    hint: '帧数与选区×帧率不符：检查 -t 是否被空格截断、fps 滤镜顺序、以及帧选择表达式。'
  })
}

export function checkGifLoop(facts, spec = {}, measurements = {}) {
  const gif = gifSelection(spec, measurements)
  const expected = '无限循环（NETSCAPE2.0 loop=0）'
  if (!gif) {
    return check('gif.loop', 'L0', 'skipped', '非 GIF 任务', '未检查循环扩展块')
  }
  const info = measurements.gif
  if (!info || info.loop === undefined) {
    return check('gif.loop', 'L0', 'skipped', expected, '未检查循环扩展块（L0 未执行）', {
      hint: '调用 measure.gifInfo(path)，循环来自对 GIF 字节流的 NETSCAPE2.0 扫描。'
    })
  }
  if (info.malformed) {
    return check('gif.loop', 'L0', 'fail', expected, 'NETSCAPE2.0 扩展块不完整', {
      delta: '扩展块长度或子块结构不合法',
      hint: '重新导出 GIF 并确保写入 -loop 0；不完整的扩展块会让播放器只播一次。'
    })
  }
  if (!info.loop) {
    return check('gif.loop', 'L0', 'fail', expected,
      info.netscape ? '找到 NETSCAPE2.0 但缺少循环子块' : '未找到 NETSCAPE2.0 扩展块', {
        delta: '缺少循环扩展块',
        hint: 'ffmpeg 需加 -loop 0；某些封装会丢弃应用扩展块，可用 gifsicle --loop=0 复查。'
      })
  }
  const count = numberOrNull(info.loopCount)
  if (count === null) {
    return check('gif.loop', 'L0', 'warn', expected, 'NETSCAPE2.0 已找到但读不出循环次数', {
      delta: '循环次数未知',
      hint: '用十六进制查看 21 FF 0B 后第 14-15 字节（小端）；0 表示无限循环。'
    })
  }
  if (count !== 0) {
    return check('gif.loop', 'L0', 'warn', expected,
      `NETSCAPE2.0 loop=${count}（播放 ${count} 次后停止）`, {
        delta: `循环次数 ${count}，不是无限`,
        hint: '-loop 0 才是无限循环；-loop N 会播放 N 次后停。'
      })
  }
  return check('gif.loop', 'L0', 'pass', expected, 'NETSCAPE2.0 loop=0（无限循环）')
}

/**
 * Effective GIF selection from spec or task. Returns null for non-GIF work or
 * an invalid selection (from >= to).
 * @param {object} spec
 * @param {object} measurements
 */
function gifSelection(spec, measurements) {
  const fromSpec = spec?.gif
  if (validSelection(fromSpec)) {
    return {
      from: fromSpec.from,
      to: fromSpec.to,
      lengthSec: fromSpec.to - fromSpec.from,
      fps: numberOrNull(fromSpec.fps),
      width: numberOrNull(fromSpec.width),
      loop: fromSpec.loop !== false,
      maxBytes: numberOrNull(fromSpec.maxBytes)
    }
  }
  const task = measurements?.task
  if (task?.kind === 'gif' && validSelection(task)) {
    return {
      from: task.from,
      to: task.to,
      lengthSec: task.to - task.from,
      fps: numberOrNull(task.fps),
      width: numberOrNull(task.width),
      loop: true,
      maxBytes: numberOrNull(task.maxBytes)
    }
  }
  return null
}

/** @param {unknown} value */
function validSelection(value) {
  return Boolean(value) &&
    Number.isFinite(value.from) &&
    Number.isFinite(value.to) &&
    value.to > value.from
}

/**
 * @param {object} measurements
 * @returns {boolean}
 */
function isCopyMode(measurements) {
  const mode = typeof measurements?.mode === 'string' ? measurements.mode.toLowerCase() : ''
  if (mode === 'copy' || mode === 'stream-copy' || mode === 'streamcopy') return true
  if (mode === 'reencode' || mode === 'encode') return false
  if (measurements?.copy === true) return true
  return measurements?.task?.kind === 'convert' && measurements.task.copy === true
}

/**
 * @param {object} measurements
 * @returns {number | null}
 */
function resolveStartOffset(measurements) {
  const direct = numberOrNull(measurements?.startOffsetSec)
  if (direct !== null) return direct
  const requested = numberOrNull(measurements?.requestedStartSec)
  const actual = numberOrNull(measurements?.actualStartSec)
  return requested !== null && actual !== null ? actual - requested : null
}

/** @param {object} facts */
function videoStream(facts) {
  if (facts?.video) return facts.video
  return Array.isArray(facts?.streams)
    ? facts.streams.find(stream => stream?.type === 'video') ?? null
    : null
}

/** @param {object} facts */
function audioStream(facts) {
  if (facts?.audio) return facts.audio
  return Array.isArray(facts?.streams)
    ? facts.streams.find(stream => stream?.type === 'audio') ?? null
    : null
}

/**
 * @param {string} id
 * @param {'L0' | 'L1' | 'L2'} tier
 * @param {'pass' | 'warn' | 'fail' | 'skipped'} outcome
 * @param {string} expected
 * @param {string} actual
 * @param {{ delta?: string, hint?: string, repair?: object }} [extra]
 */
function check(id, tier, outcome, expected, actual, extra = {}) {
  /** @type {Record<string, unknown>} */
  const result = {
    id,
    tier,
    outcome,
    expected: text(expected),
    actual: text(actual)
  }
  if (extra.delta !== undefined) result.delta = text(extra.delta)
  if (extra.hint !== undefined) result.hint = text(extra.hint)
  if (extra.repair !== undefined) result.repair = extra.repair
  return result
}

/** @param {unknown} value */
function text(value) {
  const string = value === null || value === undefined ? '' : String(value).trim()
  return string === '' ? '未记录' : string
}

/** @param {unknown} codec */
function normalizeCodec(codec) {
  if (typeof codec !== 'string' || codec.trim() === '') return null
  const key = codec.trim().toLowerCase()
  return CODEC_ALIASES[key] ?? key.replace(/^lib/, '')
}

/**
 * @param {number | null} width
 * @param {number | null} height
 * @param {boolean} evenRequired
 */
function resolutionExpectation(width, height, evenRequired) {
  const suffix = evenRequired ? '（偶数宽高）' : ''
  if (width !== null && height !== null) return `${width}×${height}${suffix}`
  if (width !== null) return `宽 ${width}px${suffix}`
  if (height !== null) return `高 ${height}px${suffix}`
  return evenRequired ? '偶数宽高（未指定具体值）' : '未指定尺寸（仅记录实际值）'
}

/** @param {string} id */
function windowLabel(id) {
  switch (id) {
    case 'head': return '首 5s'
    case 'tail': return '末 5s'
    case 'middle': return '中段 2s'
    case 'full': return '全片'
    default: return id
  }
}

/** @param {unknown} value */
function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** @param {unknown} value */
function isMeasuredNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value)
}

/** @param {number} value */
function round1(value) {
  return Math.round(value * 10) / 10
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** @param {number} value */
function sign(value) {
  return value > 0 ? '+' : ''
}

/** @param {number} value @param {number} digits */
function signed(value, digits) {
  return `${sign(value)}${value.toFixed(digits)}`
}

/** @param {number} value */
function secText(value) {
  if (!Number.isFinite(value)) return value === -Infinity ? '-∞s' : '未知'
  return `${value.toFixed(2)}s`
}

/** @param {number} value */
function lufsText(value) {
  if (value === -Infinity) return '静音（-∞ LUFS）'
  if (value === Infinity) return '+∞ LUFS'
  if (!Number.isFinite(value)) return '未测得'
  return `${value.toFixed(2)} LUFS`
}

/** @param {number} value */
function dbText(value) {
  if (value === -Infinity) return '-∞ dBTP'
  if (!Number.isFinite(value)) return '未测得'
  return `${value.toFixed(2)} dBTP`
}

/** @param {number} value */
function bytesText(value) {
  if (!Number.isFinite(value)) return '未知'
  return `${(value / MB).toFixed(2)} MB（${value} 字节）`
}

/** @param {number} value */
function formatFps(value) {
  if (!Number.isFinite(value)) return '未知'
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/** @param {unknown} value */
function firstLine(value) {
  const line = String(value ?? '').split(/\r?\n/).map(item => item.trim()).find(Boolean) ?? ''
  return line.length > 180 ? `${line.slice(0, 177)}...` : line
}
