import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AUDIO_TARGET_CODEC,
  AUDIO_EXTS,
  CONVERT_TARGETS,
  COPY_AUDIO_CODECS,
  COPY_VIDEO_CODECS,
  GIF_DEFAULTS,
  GIF_FPS_OPTIONS,
  GIF_WIDTH_OPTIONS,
  MUXER_ALIASES,
  VIDEO_EXTS,
  codecLabel,
  isAudioTarget,
  isVideoTarget,
  muxerSupports,
  normalizeCodec,
  normalizeTarget,
  targetLabel,
  targetOf,
} from '../../src/client/format.js'

test('format: 九种目标格式顺序与产品规格一致', () => {
  assert.deepEqual(CONVERT_TARGETS.map((target) => target.ext), [
    'mp4', 'mkv', 'mov', 'webm', 'avi', 'mp3', 'm4a', 'wav', 'flac',
  ])
  assert.deepEqual(CONVERT_TARGETS.map((target) => target.label), [
    'MP4', 'MKV', 'MOV', 'WEBM', 'AVI', 'MP3', 'M4A', 'WAV', 'FLAC',
  ])
  assert.deepEqual(VIDEO_EXTS, ['mp4', 'mkv', 'mov', 'webm', 'avi'])
  assert.deepEqual(AUDIO_EXTS, ['mp3', 'm4a', 'wav', 'flac'])
})

test('format: 每个目标都有容器与一句说明', () => {
  for (const target of CONVERT_TARGETS) {
    assert.equal(typeof target.container, 'string')
    assert.ok(target.container.length > 0)
    assert.ok(target.note.length > 0)
    assert.equal(target.kind, ['mp3', 'm4a', 'wav', 'flac'].includes(target.ext) ? 'audio' : 'video')
  }
})

test('format: 归一化与查表', () => {
  assert.equal(normalizeTarget('MP4'), 'mp4')
  assert.equal(normalizeTarget('.mkv'), 'mkv')
  assert.equal(normalizeTarget('gif'), null)
  assert.equal(normalizeTarget(''), null)
  assert.equal(normalizeTarget(null), null)
  assert.equal(targetOf('flac').label, 'FLAC')
  assert.equal(targetOf('gif'), null)
  assert.equal(targetLabel('m4a'), 'M4A')
  assert.equal(targetLabel('nope'), 'nope')
  assert.equal(isAudioTarget('mp3'), true)
  assert.equal(isAudioTarget('mp4'), false)
  assert.equal(isVideoTarget('webm'), true)
  assert.equal(isVideoTarget('wav'), false)
})

test('format: GIF 默认值与选项', () => {
  assert.deepEqual(GIF_DEFAULTS, {
    fps: 12,
    width: 480,
    maxMB: 8,
    spanSec: 5,
    minSpanSec: 0.2,
    maxSpanSec: 60,
  })
  assert.ok(GIF_FPS_OPTIONS.includes(12))
  assert.ok(GIF_WIDTH_OPTIONS.includes(480))
  assert.equal(GIF_FPS_OPTIONS[0], 8)
  assert.equal(GIF_WIDTH_OPTIONS[0], 320)
})

test('format: 音频目标都有要求的编码', () => {
  for (const ext of AUDIO_EXTS) {
    assert.equal(typeof AUDIO_TARGET_CODEC[ext], 'string')
  }
})

test('format: 每个视频容器都有拷贝白名单，MKV 通吃', () => {
  for (const ext of VIDEO_EXTS) {
    assert.ok(Object.prototype.hasOwnProperty.call(COPY_VIDEO_CODECS, ext))
    const allow = COPY_VIDEO_CODECS[ext]
    assert.ok(allow === '*' || Array.isArray(allow))
    assert.ok(Object.prototype.hasOwnProperty.call(COPY_AUDIO_CODECS, ext))
  }
  assert.equal(COPY_VIDEO_CODECS.mkv, '*')
  assert.equal(COPY_AUDIO_CODECS.mkv, '*')
})

test('format: 每个目标都有 muxer 别名', () => {
  for (const target of CONVERT_TARGETS) {
    assert.ok(Array.isArray(MUXER_ALIASES[target.ext]))
    assert.ok(MUXER_ALIASES[target.ext].length > 0)
  }
})

test('format: 能力未知时按可用处理，能力已知缺 muxer 时给出原因', () => {
  assert.deepEqual(muxerSupports(null, 'mp4'), { available: true, reason: null })
  assert.deepEqual(muxerSupports({ muxers: [] }, 'mp4'), { available: true, reason: null })

  const full = { muxers: ['mp4', 'matroska', 'ipod', 'wav', 'flac', 'mp3', 'webm', 'avi'] }
  for (const ext of ['mp4', 'mkv', 'm4a', 'wav', 'flac', 'mp3', 'webm', 'avi']) {
    assert.equal(muxerSupports(full, ext).available, true)
  }

  const missing = muxerSupports({ muxers: ['mp4'] }, 'flac')
  assert.equal(missing.available, false)
  assert.match(missing.reason, /FLAC/)
  assert.match(missing.reason, /flac/)
})

test('format: 编码名归一与可读名', () => {
  assert.equal(normalizeCodec('H264.High'), 'h264')
  assert.equal(normalizeCodec(' pcm_s16le '), 'pcm_s16le')
  assert.equal(normalizeCodec(null), '')
  assert.equal(codecLabel('h264'), 'H.264')
  assert.equal(codecLabel('hevc'), 'H.265')
  assert.equal(codecLabel('pcm_s24le'), 'PCM 24-bit')
  assert.equal(codecLabel('weirdcodec'), 'WEIRDCODEC')
  assert.equal(codecLabel(''), '未知编码')
})
