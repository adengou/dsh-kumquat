/**
 * Pure argv builders for the two Kumquat tasks.
 *
 * `buildConvert` is deliberately conservative: stream copy is only allowed
 * when the target container is known to accept every stream we keep. Anything
 * uncertain is re-encoded, with a human-readable `reason`.
 *
 * `buildGif` uses the measured single-pass split palette route (the two-pass
 * route produced byte-identical output for the same segment, see design.md).
 */
import path from 'node:path'
import { normalizeTrim } from './trim.js'
import { hasEncoder, hasMuxer } from './capability.js'

/** @typedef {import('../public/types.d.ts').MediaFacts} MediaFacts */
/** @typedef {import('../public/types.d.ts').Capabilities} Capabilities */
/** @typedef {import('../public/types.d.ts').ConvertTask} ConvertTask */
/** @typedef {import('../public/types.d.ts').GifTask} GifTask */
/** @typedef {import('../public/types.d.ts').MediaSpec} MediaSpec */

const ANY = '*'

/**
 * Supported targets and the streams each container can hold.
 * Lists are intentionally short and conservative; unknown codecs force a re-encode.
 */
const TARGETS = Object.freeze({
  mp4: {
    container: 'mp4',
    muxer: 'mp4',
    kind: 'video',
    video: ['h264', 'hevc', 'mpeg4', 'av1'],
    audio: ['aac', 'mp3', 'alac', 'ac3', 'eac3'],
    subtitles: ['mov_text'],
  },
  mov: {
    container: 'mov',
    muxer: 'mov',
    kind: 'video',
    video: ['h264', 'hevc', 'mpeg4', 'prores', 'dnxhd'],
    audio: ['aac', 'mp3', 'alac', 'pcm_s16le', 'pcm_s24le'],
    subtitles: ['mov_text'],
  },
  mkv: {
    container: 'mkv',
    muxer: 'matroska',
    kind: 'video',
    video: ANY,
    audio: ANY,
    subtitles: ANY,
  },
  webm: {
    container: 'webm',
    muxer: 'webm',
    kind: 'video',
    video: ['vp8', 'vp9', 'av1'],
    audio: ['opus', 'vorbis'],
    subtitles: [],
  },
  avi: {
    container: 'avi',
    muxer: 'avi',
    kind: 'video',
    video: ['mpeg4', 'h264', 'mjpeg'],
    audio: ['mp3', 'pcm_s16le', 'ac3'],
    subtitles: [],
  },
  mp3: {
    container: 'mp3',
    muxer: 'mp3',
    kind: 'audio',
    video: [],
    audio: ['mp3'],
    subtitles: [],
  },
  m4a: {
    container: 'm4a',
    muxer: 'ipod',
    kind: 'audio',
    video: [],
    audio: ['aac', 'alac'],
    subtitles: [],
  },
  wav: {
    container: 'wav',
    muxer: 'wav',
    kind: 'audio',
    video: [],
    audio: ['pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_u8'],
    subtitles: [],
  },
  aac: {
    container: 'adts',
    muxer: 'adts',
    kind: 'audio',
    video: [],
    audio: ['aac'],
    subtitles: [],
  },
  ogg: {
    container: 'ogg',
    muxer: 'ogg',
    kind: 'audio',
    video: [],
    audio: ['vorbis', 'opus'],
    subtitles: [],
  },
  opus: {
    container: 'opus',
    muxer: 'opus',
    kind: 'audio',
    video: [],
    audio: ['opus'],
    subtitles: [],
  },
  wma: {
    container: 'wma',
    muxer: 'asf',
    kind: 'audio',
    video: [],
    audio: ['wmav2'],
    subtitles: [],
  },
  flac: {
    container: 'flac',
    muxer: 'flac',
    kind: 'audio',
    video: [],
    audio: ['flac'],
    subtitles: [],
  },
})

const ALIASES = Object.freeze({
  mp4: 'mp4',
  m4v: 'mp4',
  mov: 'mov',
  quicktime: 'mov',
  mkv: 'mkv',
  matroska: 'mkv',
  webm: 'webm',
  avi: 'avi',
  mp3: 'mp3',
  m4a: 'm4a',
  wav: 'wav',
  flac: 'flac',
  aac: 'aac',
  ogg: 'ogg',
  opus: 'opus',
  wma: 'wma',
})

/** Preferred encoders, first available wins. */
const VIDEO_ENCODERS = {
  mp4: [
    { codec: 'h264', encoder: 'libx264', args: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18'] },
    { codec: 'mpeg4', encoder: 'mpeg4', args: ['-c:v', 'mpeg4', '-q:v', '3', '-pix_fmt', 'yuv420p'] },
  ],
  mov: [
    { codec: 'h264', encoder: 'libx264', args: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18'] },
    { codec: 'mpeg4', encoder: 'mpeg4', args: ['-c:v', 'mpeg4', '-q:v', '3', '-pix_fmt', 'yuv420p'] },
  ],
  mkv: [
    { codec: 'h264', encoder: 'libx264', args: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18'] },
    { codec: 'mpeg4', encoder: 'mpeg4', args: ['-c:v', 'mpeg4', '-q:v', '3', '-pix_fmt', 'yuv420p'] },
  ],
  webm: [
    { codec: 'vp9', encoder: 'libvpx-vp9', args: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p'] },
    { codec: 'vp8', encoder: 'libvpx', args: ['-c:v', 'libvpx', '-crf', '10', '-b:v', '2M', '-pix_fmt', 'yuv420p'] },
  ],
  avi: [
    { codec: 'mpeg4', encoder: 'mpeg4', args: ['-c:v', 'mpeg4', '-q:v', '3', '-pix_fmt', 'yuv420p'] },
    { codec: 'h264', encoder: 'libx264', args: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18'] },
  ],
}

const AUDIO_ENCODERS = {
  mp4: [{ codec: 'aac', encoder: 'aac', args: ['-c:a', 'aac', '-b:a', '192k'] }],
  mov: [{ codec: 'aac', encoder: 'aac', args: ['-c:a', 'aac', '-b:a', '192k'] }],
  mkv: [
    { codec: 'aac', encoder: 'aac', args: ['-c:a', 'aac', '-b:a', '192k'] },
    { codec: 'opus', encoder: 'libopus', args: ['-c:a', 'libopus', '-b:a', '128k'] },
  ],
  webm: [
    { codec: 'opus', encoder: 'libopus', args: ['-c:a', 'libopus', '-b:a', '128k'] },
    { codec: 'vorbis', encoder: 'libvorbis', args: ['-c:a', 'libvorbis', '-q:a', '5'] },
  ],
  avi: [{ codec: 'mp3', encoder: 'libmp3lame', args: ['-c:a', 'libmp3lame', '-b:a', '192k'] }],
  mp3: [{ codec: 'mp3', encoder: 'libmp3lame', args: ['-c:a', 'libmp3lame', '-b:a', '192k'] }],
  m4a: [{ codec: 'aac', encoder: 'aac', args: ['-c:a', 'aac', '-b:a', '192k'] }],
  wav: [{ codec: 'pcm_s16le', encoder: 'pcm_s16le', args: ['-c:a', 'pcm_s16le'] }],
  flac: [{ codec: 'flac', encoder: 'flac', args: ['-c:a', 'flac'] }],
  aac: [{ codec: 'aac', encoder: 'aac', args: ['-c:a', 'aac', '-b:a', '192k'] }],
  adts: [{ codec: 'aac', encoder: 'aac', args: ['-c:a', 'aac', '-b:a', '192k'] }],
  ogg: [{ codec: 'vorbis', encoder: 'libvorbis', args: ['-c:a', 'libvorbis', '-q:a', '5'] }],
  opus: [{ codec: 'opus', encoder: 'libopus', args: ['-c:a', 'libopus', '-b:a', '128k'] }],
  wma: [{ codec: 'wmav2', encoder: 'wmav2', args: ['-c:a', 'wmav2', '-b:a', '192k'] }],
}

/**
 * Build the conversion argv and the acceptance spec.
 * @param {ConvertTask} task
 * @param {MediaFacts} facts
 * @param {Capabilities} caps
 * @returns {{ argv: string[], copy: boolean, reason: string, outputPath: string, spec: MediaSpec }}
 */
export function buildConvert(task, facts, caps) {
  if (!task || task.kind !== 'convert') {
    throw new Error('buildConvert(task, facts, caps): task.kind must be "convert"')
  }
  if (!facts || typeof facts !== 'object' || typeof facts.path !== 'string') {
    throw new Error('buildConvert(task, facts, caps): facts must come from probe()')
  }
  if (!caps || typeof caps.ffmpeg !== 'string' || caps.ffmpeg.length === 0) {
    throw new Error('buildConvert(task, facts, caps): capabilities with an ffmpeg path are required')
  }

  const target = normalizeTarget(task.to)
  const input = typeof task.input === 'string' && task.input.length > 0 ? task.input : facts.path

  if (!hasMuxer(caps, target.muxer)) {
    throw new Error(
      `This FFmpeg build cannot write ${target.container}: the "${target.muxer}" muxer is missing. ` +
        'Reinstall a full FFmpeg build and retry.',
    )
  }

  if (target.kind === 'audio' && !facts.audio) {
    throw new Error(`The input has no audio stream, so it cannot be converted to ${target.container}.`)
  }
  if (target.kind === 'video' && !facts.video) {
    throw new Error(
      `The input has no video stream, so it cannot be converted to ${target.container}. ` +
        'Choose an audio target (mp3, m4a, wav, flac) instead.',
    )
  }

  const trim = normalizeTrim(task.trim, facts.durationSec)
  const decision = decideCopy(task, facts, target)
  const outputPath = convertOutputPath(input, target.container)

  if (decision.copy) {
    return {
      argv: buildCopyArgv(caps.ffmpeg, input, facts, target, outputPath, decision.subtitles, trim),
      copy: true,
      reason: decision.reason,
      outputPath,
      spec: buildSpec(facts, target, { copy: true }, trim),
    }
  }

  const videoEncoder = target.kind === 'video' ? pickEncoder(target.container, 'video', caps) : null
  const audioEncoder = facts.audio ? pickEncoder(target.container, 'audio', caps) : null

  return {
    argv: buildEncodeArgv(caps.ffmpeg, input, facts, target, outputPath, videoEncoder, audioEncoder, trim),
    copy: false,
    reason: decision.reason,
    outputPath,
    spec: buildSpec(facts, target, { copy: false, videoEncoder, audioEncoder }, trim),
  }
}

/**
 * Build the GIF argv and the acceptance spec. GIF is always re-encoded.
 * @param {GifTask} task
 * @param {{ ffmpeg?: string }} [options] concrete ffmpeg executable; defaults to `ffmpeg` on PATH
 * @returns {{ argv: string[], outputPath: string, spec: MediaSpec }}
 */
export function buildGif(task, options = {}) {
  if (!task || task.kind !== 'gif') {
    throw new Error('buildGif(task): task.kind must be "gif"')
  }
  if (typeof task.input !== 'string' || task.input.length === 0) {
    throw new Error('buildGif(task): task.input must be a non-empty path')
  }
  const from = finiteNumber(task.from)
  const to = finiteNumber(task.to)
  if (from === undefined || to === undefined) {
    throw new Error('buildGif(task): from and to must be finite numbers (seconds)')
  }
  if (from < 0) throw new Error('buildGif(task): from must be >= 0')
  if (to <= from) throw new Error('buildGif(task): to must be greater than from')

  const fps = boundedInteger(task.fps, 12, 'fps', 1, 60)
  const width = boundedInteger(task.width, 480, 'width', 8, 1920)
  let maxBytes
  if (task.maxBytes !== undefined && task.maxBytes !== null) {
    const value = Number(task.maxBytes)
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('buildGif(task): maxBytes must be a positive number when provided')
    }
    maxBytes = value
  }

  const duration = round3(to - from)
  const outputPath = gifOutputPath(task.input, from, to)
  const filter =
    `fps=${fps},scale=${width}:-2:flags=lanczos,` +
    `split[a][b];[a]palettegen[p];[b][p]paletteuse`

  const argv = [
    options.ffmpeg ?? 'ffmpeg',
    '-hide_banner',
    '-nostdin',
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    '-ss',
    formatSeconds(from),
    '-i',
    task.input,
    '-t',
    formatSeconds(duration),
    '-filter_complex',
    filter,
    '-an',
    '-loop',
    '0',
    outputPath,
  ]

  /** @type {MediaSpec} */
  const spec = {
    container: 'gif',
    video: { codec: 'gif', width, fps },
    durationSec: { expect: duration, toleranceSec: 0.2 },
    gif: { from, to, fps, width, loop: true },
    decodable: 'sample',
  }
  if (maxBytes !== undefined) spec.maxBytes = maxBytes

  return { argv, outputPath, spec }
}

/**
 * Estimate GIF size from the measured baseline: 480 px / 12 fps ~= 1.2 MB/s.
 * Area scales by width^2 and playback by fps; the aspect ratio is assumed kept.
 * @param {number} seconds
 * @param {number} [width]
 * @param {number} [fps]
 * @returns {number} estimated bytes (0 for non-positive input)
 */
export function estimateGifBytes(seconds, width = 480, fps = 12) {
  const duration = Number(seconds)
  const pixels = Number(width)
  const frameRate = Number(fps)
  if (!Number.isFinite(duration) || duration <= 0) return 0
  if (!Number.isFinite(pixels) || pixels <= 0) return 0
  if (!Number.isFinite(frameRate) || frameRate <= 0) return 0

  const bytesPerSecondAtBaseline = 1.2 * 1e6
  return Math.round(
    bytesPerSecondAtBaseline * duration * (pixels / 480) ** 2 * (frameRate / 12),
  )
}

/**
 * @param {string | undefined} raw
 */
function normalizeTarget(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error('buildConvert(task): task.to must name a target format (mp4, mkv, mp3, ...)')
  }
  const key = raw.trim().toLowerCase().replace(/^\./, '')
  const container = ALIASES[key]
  if (!container) {
    throw new Error(
      `Unsupported target format "${raw}". Supported: mp4, mov, mkv, webm, avi, mp3, m4a, wav, flac.`,
    )
  }
  return TARGETS[container]
}

/**
 * @param {ConvertTask} task
 * @param {MediaFacts} facts
 * @param {typeof TARGETS[keyof typeof TARGETS]} target
 * @returns {{ copy: boolean, reason: string, subtitles: import('../public/types.d.ts').StreamInfo[] }}
 */
function decideCopy(task, facts, target) {
  if (task.trim !== undefined && task.trim !== null) {
    return { copy: false, reason: 're-encode: trim needs an accurate cut', subtitles: [] }
  }
  if (task.copy === false) {
    return { copy: false, reason: 're-encode: copy disabled by task', subtitles: [] }
  }

  if (target.kind === 'audio') {
    if (!codecAllowed(target.audio, facts.audio.codec)) {
      return {
        copy: false,
        reason: `re-encode: ${facts.audio.codec} audio is not allowed in ${target.container}`,
        subtitles: [],
      }
    }
    const droppedVideo = facts.video ? ' (video dropped)' : ''
    return {
      copy: true,
      reason: `copy: ${facts.audio.codec} audio into ${target.container}${droppedVideo}`,
      subtitles: [],
    }
  }

  if (!codecAllowed(target.video, facts.video.codec)) {
    return {
      copy: false,
      reason: `re-encode: ${facts.video.codec} video is not allowed in ${target.container}`,
      subtitles: [],
    }
  }
  if (facts.audio && !codecAllowed(target.audio, facts.audio.codec)) {
    return {
      copy: false,
      reason: `re-encode: ${facts.audio.codec} audio is not allowed in ${target.container}`,
      subtitles: [],
    }
  }

  const sourceSubtitles = (facts.streams ?? []).filter((stream) => stream.type === 'subtitle')
  const keptSubtitles = sourceSubtitles.filter((stream) => codecAllowed(target.subtitles, stream.codec))
  const dropped = sourceSubtitles.length - keptSubtitles.length

  const streams = [facts.video.codec, facts.audio?.codec].filter(Boolean).join(' + ')
  const note = dropped > 0 ? `; dropped ${dropped} incompatible subtitle stream(s)` : ''
  return {
    copy: true,
    reason: `copy: ${streams} fit ${target.container}${note}`,
    subtitles: keptSubtitles,
  }
}

/**
 * @param {string} ffmpeg
 * @param {string} input
 * @param {MediaFacts} facts
 * @param {typeof TARGETS[keyof typeof TARGETS]} target
 * @param {string} outputPath
 * @param {import('../public/types.d.ts').StreamInfo[]} subtitles
 */
function buildCopyArgv(ffmpeg, input, facts, target, outputPath, subtitles, trim) {
  const argv = baseArgs(ffmpeg, input, trim)

  if (target.kind === 'audio') {
    argv.push('-map', '0:a:0?', '-vn')
  } else {
    argv.push('-map', '0:v:0?')
    if (facts.audio) argv.push('-map', '0:a:0?')
    for (const subtitle of subtitles) argv.push('-map', `0:${subtitle.index}`)
  }

  argv.push('-c', 'copy', '-f', target.muxer, outputPath)
  return argv
}

/**
 * @param {string} ffmpeg
 * @param {string} input
 * @param {MediaFacts} facts
 * @param {typeof TARGETS[keyof typeof TARGETS]} target
 * @param {string} outputPath
 * @param {{ args: string[] } | null} videoEncoder
 * @param {{ args: string[] } | null} audioEncoder
 */
function buildEncodeArgv(ffmpeg, input, facts, target, outputPath, videoEncoder, audioEncoder, trim) {
  const argv = baseArgs(ffmpeg, input, trim)

  if (target.kind === 'audio') {
    argv.push('-map', '0:a:0?', '-vn')
  } else {
    argv.push('-map', '0:v:0?')
    if (facts.audio && audioEncoder) argv.push('-map', '0:a:0?')
    else argv.push('-an')
  }
  argv.push('-sn')

  if (videoEncoder) argv.push(...videoEncoder.args)
  if (audioEncoder) argv.push(...audioEncoder.args)

  argv.push('-f', target.muxer, outputPath)
  return argv
}

/** @param {string} ffmpeg @param {string} input */
function baseArgs(ffmpeg, input, trim) {
  const argv = [ffmpeg, '-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats', '-i', input]
  if (trim) argv.push('-t', formatSeconds(trim.duration))
  return argv
}

/**
 * @param {MediaFacts} facts
 * @param {typeof TARGETS[keyof typeof TARGETS]} target
 * @param {{ copy: boolean, videoEncoder?: { codec: string } | null, audioEncoder?: { codec: string } | null }} chosen
 * @returns {MediaSpec}
 */
function buildSpec(facts, target, chosen, trim) {
  /** @type {MediaSpec} */
  const spec = {
    container: target.container,
    durationSec: { expect: trim ? trim.duration : facts.durationSec, toleranceSec: 0.2 },
    decodable: 'sample',
  }

  if (target.kind === 'video' && facts.video) {
    const codec = chosen.copy ? facts.video.codec : chosen.videoEncoder?.codec
    /** @type {NonNullable<MediaSpec['video']>} */
    const video = {}
    if (codec) video.codec = codec
    if (facts.video.width !== undefined) video.width = facts.video.width
    if (facts.video.height !== undefined) video.height = facts.video.height
    if (facts.video.fps !== undefined) video.fps = facts.video.fps
    spec.video = video
  }

  if (facts.audio) {
    const codec = chosen.copy ? facts.audio.codec : chosen.audioEncoder?.codec
    /** @type {NonNullable<MediaSpec['audio']>} */
    const audio = {}
    if (codec) audio.codec = codec
    // A copy preserves sample rate and channels exactly. An encoder may
    // resample (e.g. Opus always runs at 48 kHz) or downmix, so we do not
    // promise values we do not control.
    if (chosen.copy) {
      if (facts.audio.sampleRate !== undefined) audio.sampleRate = facts.audio.sampleRate
      if (facts.audio.channels !== undefined) audio.channels = facts.audio.channels
    }
    spec.audio = audio
  }

  return spec
}

/**
 * @param {string[] | string | undefined} allowed
 * @param {string} codec
 */
function codecAllowed(allowed, codec) {
  if (allowed === ANY) return true
  return Array.isArray(allowed) && allowed.includes(codec)
}

/**
 * @param {string} container
 * @param {'video' | 'audio'} kind
 * @param {Capabilities} caps
 */
function pickEncoder(container, kind, caps) {
  const table = kind === 'video' ? VIDEO_ENCODERS : AUDIO_ENCODERS
  const candidates = table[container] ?? []
  const chosen = candidates.find((candidate) => hasEncoder(caps, candidate.encoder))
  if (!chosen) {
    throw new Error(
      `This FFmpeg build has no ${kind} encoder for ${container}. ` +
        `Tried: ${candidates.map((candidate) => candidate.encoder).join(', ') || 'none'}. ` +
        'Reinstall a full FFmpeg build and retry.',
    )
  }
  return chosen
}

/** @param {string} input @param {string} container */
function convertOutputPath(input, container) {
  const dir = path.dirname(input)
  const base = path.basename(input, path.extname(input))
  const candidate = path.join(dir, `${base}.${container}`)
  if (path.resolve(candidate) === path.resolve(input)) {
    return path.join(dir, `${base}-converted.${container}`)
  }
  return candidate
}

/** @param {string} input @param {number} from @param {number} to */
function gifOutputPath(input, from, to) {
  const dir = path.dirname(input)
  const base = path.basename(input, path.extname(input))
  return path.join(dir, `${base}_${stamp(from)}-${stamp(to)}.gif`)
}

/** @param {number} seconds */
function stamp(seconds) {
  const fixed = round1(seconds).toFixed(1)
  const [whole, fraction] = fixed.split('.')
  return `${whole.padStart(2, '0')}.${fraction}`
}

/** @param {number} seconds */
function formatSeconds(seconds) {
  return String(round3(seconds))
}

/** @param {unknown} value @param {number} fallback @param {string} name @param {number} min @param {number} max */
function boundedInteger(value, fallback, name, min, max) {
  if (value === undefined || value === null) return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`buildGif(task): ${name} must be an integer between ${min} and ${max}`)
  }
  return number
}

/** @param {unknown} value */
function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

/** @param {number} value */
function round1(value) {
  return Math.round(value * 10) / 10
}

/** @param {number} value */
function round3(value) {
  return Math.round(value * 1000) / 1000
}

