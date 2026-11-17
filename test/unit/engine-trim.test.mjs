import test from 'node:test'
import assert from 'node:assert/strict'
import { buildConvert } from '../../src/engine/argv.js'
import { normalizeTrim } from '../../src/engine/trim.js'

const facts = {
  path: 'D:\\示例\\video.mp4',
  container: 'mov',
  durationSec: 12,
  video: { codec: 'h264', width: 1280, height: 720, fps: 30 },
  audio: { codec: 'aac', channels: 2, sampleRate: 48000 },
  streams: [],
}

const caps = { ffmpeg: 'ffmpeg', muxers: ['matroska', 'mp4'], encoders: ['libx264', 'aac'] }

test('trim: 归一化与边界', () => {
  assert.deepEqual(normalizeTrim({ from: 2, to: 5 }, 12), { from: 2, to: 5, duration: 3 })
  assert.equal(normalizeTrim(undefined, 12), null)
  assert.throws(() => normalizeTrim({ from: 5, to: 2 }, 12), /终点必须大于起点/)
  assert.throws(() => normalizeTrim({ from: -1, to: 2 }, 12), /不能小于 0/)
  assert.throws(() => normalizeTrim({ from: 0, to: 20 }, 12), /超出源时长/)
})

test('trim: 命令追加 -t，规格按裁剪后时长验收', () => {
  const plan = buildConvert(
    { kind: 'convert', input: facts.path, to: 'mkv', copy: true, trim: { from: 2, to: 5 } },
    facts,
    caps,
  )
  assert.equal(plan.copy, false)
  const tIndex = plan.argv.indexOf('-t')
  assert.ok(tIndex > 0)
  assert.equal(plan.argv[tIndex + 1], '3')
  assert.equal(plan.spec.durationSec.expect, 3)
})

test('trim: 未裁剪时仍按源时长验收', () => {
  const plan = buildConvert({ kind: 'convert', input: facts.path, to: 'mkv', copy: true }, facts, caps)
  assert.equal(plan.copy, true)
  assert.equal(plan.spec.durationSec.expect, 12)
})
