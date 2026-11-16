import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { buildConvert, buildGif, estimateGifBytes } from '../../src/engine/argv.js'

const CAPS = {
  ffmpeg: path.join('tools', 'ffmpeg'),
  ffprobe: path.join('tools', 'ffprobe'),
  version: '6.1.1',
  filters: ['fps', 'scale', 'split', 'palettegen', 'paletteuse'],
  encoders: [
    'libx264',
    'mpeg4',
    'aac',
    'libvpx-vp9',
    'libvpx',
    'libopus',
    'libvorbis',
    'libmp3lame',
    'pcm_s16le',
    'flac',
  ],
  muxers: ['mp4', 'mov', 'matroska', 'webm', 'avi', 'mp3', 'ipod', 'wav', 'flac'],
}

const VIDEO = { index: 0, type: 'video', codec: 'h264', width: 1920, height: 1080, fps: 30 }
const AUDIO = { index: 1, type: 'audio', codec: 'aac', sampleRate: 48000, channels: 2 }

/** @param {Record<string, unknown>} [overrides] */
function makeFacts(overrides = {}) {
  return {
    path: path.join('media', 'input.mp4'),
    bytes: 1024,
    container: 'mov',
    formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
    durationSec: 12.5,
    streams: [VIDEO, AUDIO],
    video: VIDEO,
    audio: AUDIO,
    ffmpegVersion: '6.1.1',
    ...overrides,
  }
}

/** @param {Record<string, unknown>} audio @param {Record<string, unknown>} [overrides] */
function audioOnlyFacts(audio, overrides = {}) {
  return {
    path: path.join('media', 'voice.flac'),
    bytes: 2048,
    container: 'flac',
    formatName: 'flac',
    durationSec: 30,
    streams: [audio],
    video: undefined,
    audio,
    ffmpegVersion: '6.1.1',
    ...overrides,
  }
}

test('buildConvert copy: h264 + aac fit mkv', () => {
  const facts = makeFacts()
  const result = buildConvert({ kind: 'convert', input: facts.path, to: 'mkv' }, facts, CAPS)

  assert.equal(result.copy, true)
  assert.match(result.reason, /^copy:/)
  assert.equal(result.outputPath, path.join('media', 'input.mkv'))
  assert.deepEqual(result.argv.slice(-5), ['-c', 'copy', '-f', 'matroska', result.outputPath])
  assert.equal(result.spec.container, 'mkv')
  assert.equal(result.spec.video?.codec, 'h264')
  assert.equal(result.spec.audio?.codec, 'aac')
  assert.deepEqual(result.spec.durationSec, { expect: 12.5, toleranceSec: 0.2 })
  assert.equal(result.spec.audio?.loudnessLufs, undefined, 'V1 does not retarget loudness')
  assert.equal(result.spec.audio?.truePeakDbMax, undefined, 'V1 does not retarget true peak')
  assert.equal(result.spec.decodable, 'sample')
  assert.ok(result.argv.includes('-progress'))
  assert.equal(result.argv.includes('-filter_complex'), false)
})

test('buildConvert copy: explicit copy:false forces a re-encode', () => {
  const facts = makeFacts()
  const result = buildConvert(
    { kind: 'convert', input: facts.path, to: 'mkv', copy: false },
    facts,
    CAPS,
  )

  assert.equal(result.copy, false)
  assert.match(result.reason, /copy disabled/)
  assert.ok(result.argv.includes('libx264'))
  assert.ok(result.argv.includes('aac'))
  assert.equal(result.outputPath, path.join('media', 'input.mkv'))
})

test('buildConvert re-encodes h264 into webm with vp9 + opus', () => {
  const facts = makeFacts()
  const result = buildConvert({ kind: 'convert', input: facts.path, to: 'webm' }, facts, CAPS)

  assert.equal(result.copy, false)
  assert.match(result.reason, /h264 video is not allowed in webm/)
  assert.ok(result.argv.includes('libvpx-vp9'))
  assert.ok(result.argv.includes('libopus'))
  assert.deepEqual(result.argv.slice(-3), ['-f', 'webm', result.outputPath])
  assert.equal(result.spec.video?.codec, 'vp9')
  assert.equal(result.spec.audio?.codec, 'opus')
  assert.equal(result.spec.audio?.sampleRate, undefined, 'Opus resamples to 48 kHz, so no promise')
  assert.equal(result.spec.audio?.channels, undefined)
})

test('buildConvert extracts audio to mp3 and drops video', () => {
  const facts = makeFacts()
  const result = buildConvert({ kind: 'convert', input: facts.path, to: 'mp3' }, facts, CAPS)

  assert.equal(result.copy, false)
  assert.match(result.reason, /aac audio is not allowed in mp3/)
  assert.ok(result.argv.includes('-vn'))
  assert.ok(result.argv.includes('libmp3lame'))
  assert.equal(result.argv.includes('0:v:0?'), false)
  assert.equal(result.outputPath, path.join('media', 'input.mp3'))
  assert.equal(result.spec.video, undefined)
  assert.equal(result.spec.audio?.codec, 'mp3')
  assert.equal(result.spec.container, 'mp3')
})

test('buildConvert copies mp3 audio into mp3 and drops video', () => {
  const mp3 = { index: 1, type: 'audio', codec: 'mp3', sampleRate: 44100, channels: 2 }
  const facts = makeFacts({
    path: path.join('media', 'clip.mp4'),
    audio: mp3,
    streams: [VIDEO, mp3],
  })
  const result = buildConvert({ kind: 'convert', input: facts.path, to: 'mp3' }, facts, CAPS)

  assert.equal(result.copy, true)
  assert.match(result.reason, /\(video dropped\)/)
  assert.deepEqual(result.argv.slice(-5), ['-c', 'copy', '-f', 'mp3', result.outputPath])
  assert.ok(result.argv.includes('-vn'))
})

test('buildConvert re-encodes vp9/opus from mkv into mp4', () => {
  const video = { index: 0, type: 'video', codec: 'vp9', width: 1280, height: 720, fps: 24 }
  const audio = { index: 1, type: 'audio', codec: 'opus', sampleRate: 48000, channels: 2 }
  const facts = makeFacts({
    path: path.join('media', 'clip.mkv'),
    container: 'matroska',
    formatName: 'matroska,webm',
    video,
    audio,
    streams: [video, audio],
  })
  const result = buildConvert({ kind: 'convert', input: facts.path, to: 'mov' }, facts, CAPS)

  assert.equal(result.copy, false)
  assert.match(result.reason, /vp9 video is not allowed in mov/)
  assert.ok(result.argv.includes('libx264'))
  assert.ok(result.argv.includes('aac'))
})

test('buildConvert treats mkv as accepting any codec', () => {
  const video = { index: 0, type: 'video', codec: 'ffv1', width: 640, height: 480, fps: 25 }
  const audio = { index: 1, type: 'audio', codec: 'pcm_s24le', sampleRate: 48000, channels: 2 }
  const facts = makeFacts({
    path: path.join('media', 'archive.mkv'),
    container: 'matroska',
    video,
    audio,
    streams: [video, audio],
  })
  const result = buildConvert({ kind: 'convert', input: facts.path, to: 'mkv' }, facts, CAPS)

  assert.equal(result.copy, true)
  assert.equal(result.outputPath, path.join('media', 'archive-converted.mkv'))
})

test('buildConvert re-encodes flac audio into wav pcm', () => {
  const flac = { index: 0, type: 'audio', codec: 'flac', sampleRate: 44100, channels: 2 }
  const facts = audioOnlyFacts(flac)
  const result = buildConvert({ kind: 'convert', input: facts.path, to: 'wav' }, facts, CAPS)

  assert.equal(result.copy, false)
  assert.match(result.reason, /flac audio is not allowed in wav/)
  assert.ok(result.argv.includes('pcm_s16le'))
  assert.equal(result.spec.audio?.codec, 'pcm_s16le')
})

test('buildConvert keeps pcm_s16le when copying wav to wav', () => {
  const pcm = { index: 0, type: 'audio', codec: 'pcm_s16le', sampleRate: 44100, channels: 2 }
  const facts = audioOnlyFacts(pcm, {
    path: path.join('media', 'voice.wav'),
    container: 'wav',
    formatName: 'wav',
  })
  const result = buildConvert({ kind: 'convert', input: facts.path, to: 'wav' }, facts, CAPS)

  assert.equal(result.copy, true)
  assert.equal(result.spec.audio?.codec, 'pcm_s16le')
  assert.equal(result.outputPath, path.join('media', 'voice-converted.wav'))
})

test('buildConvert drops incompatible subtitles but still copies A/V', () => {
  const subtitle = { index: 2, type: 'subtitle', codec: 'subrip' }
  const facts = makeFacts({ streams: [VIDEO, AUDIO, subtitle] })
  const result = buildConvert({ kind: 'convert', input: facts.path, to: 'mp4' }, facts, CAPS)

  assert.equal(result.copy, true)
  assert.match(result.reason, /dropped 1 incompatible subtitle stream/)
  assert.equal(result.argv.includes('0:2'), false)
})

test('buildConvert copies compatible subtitles by stream index', () => {
  const subtitle = { index: 2, type: 'subtitle', codec: 'subrip' }
  const facts = makeFacts({ streams: [VIDEO, AUDIO, subtitle] })
  const result = buildConvert({ kind: 'convert', input: facts.path, to: 'mkv' }, facts, CAPS)

  assert.equal(result.copy, true)
  assert.ok(result.argv.includes('-map'))
  assert.equal(result.argv[result.argv.indexOf('-map', result.argv.indexOf('0:a:0?')) + 1], '0:2')
  assert.doesNotMatch(result.reason, /dropped/)
})

test('buildConvert rejects nonsensical or unsupported targets', () => {
  assert.throws(
    () =>
      buildConvert(
        { kind: 'convert', input: 'clip.mp4', to: 'mp3' },
        makeFacts({ audio: undefined, streams: [VIDEO] }),
        CAPS,
      ),
    /no audio stream/,
  )
  assert.throws(
    () =>
      buildConvert(
        { kind: 'convert', input: 'voice.flac', to: 'mp4' },
        audioOnlyFacts({ index: 0, type: 'audio', codec: 'flac', sampleRate: 44100, channels: 2 }),
        CAPS,
      ),
    /no video stream/,
  )
  assert.throws(
    () => buildConvert({ kind: 'convert', input: 'clip.mp4', to: 'mkv2' }, makeFacts(), CAPS),
    /Unsupported target/,
  )
  assert.throws(
    () => buildConvert({ kind: 'convert', input: 'clip.mp4', to: 'mkv' }, makeFacts(), { ...CAPS, muxers: [] }),
    /cannot write mkv/,
  )
  assert.throws(
    () =>
      buildConvert(
        { kind: 'convert', input: 'clip.mp4', to: 'mkv', copy: false },
        makeFacts(),
        { ...CAPS, encoders: [], muxers: ['matroska'] },
      ),
    /no video encoder/,
  )
})

test('buildConvert honors container aliases and dotted extensions', () => {
  const facts = makeFacts()
  const fromAlias = buildConvert({ kind: 'convert', input: facts.path, to: 'matroska' }, facts, CAPS)
  const fromDotted = buildConvert({ kind: 'convert', input: facts.path, to: '.MKV' }, facts, CAPS)
  assert.equal(fromAlias.outputPath, fromDotted.outputPath)
  assert.equal(fromAlias.spec.container, 'mkv')
})

test('buildGif builds one-pass split palette argv with -ss before -i', () => {
  const input = path.join('media', 'clip.mp4')
  const result = buildGif({ kind: 'gif', input, from: 3.2, to: 8.4 })

  assert.equal(result.argv[0], 'ffmpeg')
  assert.equal(result.outputPath, path.join('media', 'clip_03.2-08.4.gif'))

  const ss = result.argv.indexOf('-ss')
  const inputIndex = result.argv.indexOf('-i')
  assert.ok(ss >= 0 && ss < inputIndex, '-ss must precede -i')
  assert.equal(result.argv[ss + 1], '3.2')
  assert.equal(result.argv[result.argv.indexOf('-t') + 1], '5.2')

  const graph = result.argv[result.argv.indexOf('-filter_complex') + 1]
  assert.match(graph, /^fps=12,scale=480:-2:flags=lanczos,split\[a\]\[b\];/)
  assert.match(graph, /\[a\]palettegen\[p\]/)
  assert.match(graph, /\[b\]\[p\]paletteuse$/)
  assert.deepEqual(result.argv.slice(-4), ['-an', '-loop', '0', result.outputPath])

  assert.equal(result.spec.container, 'gif')
  assert.deepEqual(result.spec.video, { codec: 'gif', width: 480, fps: 12 })
  assert.deepEqual(result.spec.gif, { from: 3.2, to: 8.4, fps: 12, width: 480, loop: true })
  assert.deepEqual(result.spec.durationSec, { expect: 5.2, toleranceSec: 0.2 })
  assert.equal(result.spec.maxBytes, undefined)
})

test('buildGif accepts explicit parameters, ffmpeg path and maxBytes', () => {
  const result = buildGif(
    { kind: 'gif', input: 'clip.mov', from: 0, to: 5, fps: 15, width: 360, maxBytes: 8_000_000 },
    { ffmpeg: path.join('tools', 'ffmpeg') },
  )

  assert.equal(result.argv[0], path.join('tools', 'ffmpeg'))
  assert.equal(result.outputPath, 'clip_00.0-05.0.gif')
  assert.match(result.argv[result.argv.indexOf('-filter_complex') + 1], /^fps=15,scale=360:-2/)
  assert.equal(result.spec.maxBytes, 8_000_000)
  assert.equal(result.spec.gif?.fps, 15)
  assert.equal(result.spec.gif?.width, 360)
})

test('buildGif validates its whitelist of parameters', () => {
  assert.throws(() => buildGif({ kind: 'gif', input: 'a.mp4', from: -1, to: 2 }), /from must be >= 0/)
  assert.throws(() => buildGif({ kind: 'gif', input: 'a.mp4', from: 2, to: 2 }), /greater than from/)
  assert.throws(() => buildGif({ kind: 'gif', input: 'a.mp4', from: 0, to: 2, fps: 0 }), /fps/)
  assert.throws(() => buildGif({ kind: 'gif', input: 'a.mp4', from: 0, to: 2, fps: 12.5 }), /fps/)
  assert.throws(() => buildGif({ kind: 'gif', input: 'a.mp4', from: 0, to: 2, width: 7 }), /width/)
  assert.throws(
    () => buildGif({ kind: 'gif', input: 'a.mp4', from: 0, to: 2, maxBytes: 0 }),
    /maxBytes/,
  )
  assert.throws(() => buildGif({ kind: 'convert', input: 'a.mp4', to: 'gif' }), /kind must be "gif"/)
})

test('estimateGifBytes follows the 480px/12fps 1.2 MB/s baseline', () => {
  assert.equal(estimateGifBytes(5, 480, 12), 6_000_000)
  assert.equal(estimateGifBytes(5, 960, 12), 24_000_000)
  assert.equal(estimateGifBytes(5, 480, 24), 12_000_000)
  assert.equal(estimateGifBytes(2.5, 480, 12), 3_000_000)
  assert.equal(estimateGifBytes(0, 480, 12), 0)
  assert.equal(estimateGifBytes(-1, 480, 12), 0)
  assert.equal(estimateGifBytes(5, 0, 12), 0)
  assert.equal(estimateGifBytes(5, 480, 0), 0)
})

