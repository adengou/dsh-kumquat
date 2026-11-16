import test from 'node:test'
import assert from 'node:assert/strict'

import { ERROR_RULES, mapError, mapVerifyFailure } from '../../src/verify/errors.js'

/** The ten stderr samples from report.md plus the silent-anomaly case. */
const SAMPLES = [
  {
    name: '1 输入不存在',
    stderr: 'C:\\in\\cat.mp4: No such file or directory',
    code: 'E_INPUT',
    message: /找不到输入文件/,
    hint: /盘符|路径/
  },
  {
    name: '2 容器写不了头',
    stderr: 'Could not write header for output file #0 (incorrect codec parameters ?): Invalid argument',
    code: 'E_ENCODE',
    message: /容器装不下/,
    hint: /换容器/
  },
  {
    name: '3 滤镜里的 Windows 路径未转义',
    stderr: 'Unable to parse option value "C:\\Users\\me\\clip.mp4" as image size',
    code: 'E_ENCODE',
    message: /反斜杠|解析失败/,
    hint: /正斜杠/
  },
  {
    name: '4 空格切断滤镜参数',
    stderr: "Error initializing filter 'drawtext' with args 'text=hi:fontfile=C:\\Windows\\font.ttf original_size=1920x1080'",
    code: 'E_ENCODE',
    message: /空格切断/,
    hint: /引号|空格/
  },
  {
    name: '5 输出没有流（无音轨）',
    stderr: 'Output file does not contain any stream',
    code: 'E_INPUT',
    message: /不含任何流/,
    hint: /probe|素材/
  },
  {
    name: '6 奇数宽高',
    stderr: '[libx264 @ 0x1] width not divisible by 2 (1921x1080)',
    code: 'E_ENCODE',
    message: /奇数/,
    hint: /scale=/
  },
  {
    name: '7 变速越界',
    stderr: 'tempo out of range',
    code: 'E_ENCODE',
    message: /变速/,
    hint: /0\.5–2\.0/
  },
  {
    name: '8 concat 列表 BOM 或坏文件',
    stderr: '[concat @ 0x1] Invalid data found when processing input',
    code: 'E_INPUT',
    message: /BOM|损坏/,
    hint: /BOM/
  },
  {
    name: '9 moov atom 缺失（伪 mp4）',
    stderr: 'moov atom not found',
    code: 'E_INPUT',
    message: /moov/,
    hint: /ffprobe|扩展名/
  },
  {
    name: '10 输出目录不存在',
    stderr: '[out#0/mp4 @ 0x1] Error opening output C:\\missing\\out.mp4: No such file or directory',
    code: 'E_COMMIT',
    message: /输出目录/,
    hint: /创建输出目录/
  }
]

test('10 stderr samples map to the right code with Chinese message + executable hint', () => {
  for (const sample of SAMPLES) {
    const error = mapError(sample.stderr)
    assert.ok(error, `${sample.name}: expected an error shape`)
    assert.equal(error.code, sample.code, sample.name)
    assert.match(error.message, /[\u4e00-\u9fa5]/, `${sample.name}: message must be Chinese`)
    assert.match(error.hint, /[\u4e00-\u9fa5]/, `${sample.name}: hint must be Chinese`)
    assert.match(error.message, sample.message, sample.name)
    assert.match(error.hint, sample.hint, sample.name)
  }
})

test('sample 1 and sample 10 stay distinguishable: input E_INPUT vs output E_COMMIT', () => {
  const input = mapError('C:\\in\\cat.mp4: No such file or directory', { input: 'C:\\in\\cat.mp4' })
  const output = mapError(
    '[out#0/mp4 @ 0x1] Error opening output C:\\missing\\out.mp4: No such file or directory',
    { output: 'C:\\missing\\out.mp4' }
  )
  assert.equal(input.code, 'E_INPUT')
  assert.equal(output.code, 'E_COMMIT')
  assert.notEqual(input.message, output.message)
  assert.match(output.message, /missing/)
})

test('context can disambiguate a bare "No such file or directory" for the output role', () => {
  const error = mapError('C:\\missing\\out.mp4: No such file or directory', {
    output: 'C:\\missing\\out.mp4',
    role: 'output'
  })
  assert.equal(error.code, 'E_COMMIT')
})

test('moov wins over a later Invalid data line in the same stderr blob', () => {
  const error = mapError('moov atom not found\n[aac @ 0x1] Invalid data found when processing input')
  assert.equal(error.code, 'E_INPUT')
  assert.match(error.message, /moov/)
})

test('sample 11: no stderr, but a failed check becomes E_VERIFY', () => {
  assert.equal(mapError(''), null)
  assert.equal(mapError('   \r\n '), null)

  const verdict = {
    ok: false,
    checks: [
      {
        id: 'video.resolution',
        tier: 'L0',
        outcome: 'fail',
        expected: '1280×720（偶数宽高）',
        actual: '1921×1080',
        delta: '宽度差 +641px；宽 1921×高 1080 含奇数（4:2:0 编码要求偶数）',
        hint: '用 scale=trunc(iw/2)*2:trunc(ih/2)*2 修正。'
      }
    ]
  }
  const error = mapVerifyFailure(verdict)
  assert.equal(error.code, 'E_VERIFY')
  assert.match(error.message, /验收不通过/)
  assert.match(error.message, /video\.resolution/)
  assert.match(error.hint, /scale=/)
})

test('mapVerifyFailure accepts a bare check array and returns null when everything passed', () => {
  const failed = [{ id: 'size.budget', outcome: 'fail', expected: '≤8MB', actual: '10MB' }]
  assert.equal(mapVerifyFailure(failed).code, 'E_VERIFY')
  assert.equal(mapVerifyFailure([{ id: 'size.budget', outcome: 'pass' }]), null)
  assert.equal(mapVerifyFailure({ checks: [] }), null)
  assert.equal(mapVerifyFailure(null), null)
})

test('unknown stderr falls back to a generic E_ENCODE with the first line', () => {
  const error = mapError('some totally new muxer explosion')
  assert.equal(error.code, 'E_ENCODE')
  assert.match(error.message, /未能归入已知类型/)
  assert.match(error.hint, /some totally new muxer explosion/)
})

test('missing encoder maps to E_CAPABILITY', () => {
  const error = mapError('Unknown encoder \'libx265\'')
  assert.equal(error.code, 'E_CAPABILITY')
  assert.match(error.hint, /-encoders/)
})

test('engine-layer probe and spawn messages keep their E_INPUT / E_CAPABILITY meaning', () => {
  const probeError = mapError('Cannot probe "C:\\in\\cat.mp4": file not found', {
    input: 'C:\\in\\cat.mp4'
  })
  assert.equal(probeError.code, 'E_INPUT')
  assert.match(probeError.message, /输入文件无法读取/)

  const spawnError = mapError(
    'Failed to start "ffmpeg": executable not found. Check that FFmpeg is installed and that the executable path is correct.'
  )
  assert.equal(spawnError.code, 'E_CAPABILITY')
  assert.match(spawnError.message, /FFmpeg/)
})

test('rule table is wide enough to cover the samples', () => {
  assert.ok(ERROR_RULES.length >= 11)
  assert.ok(ERROR_RULES.every(rule => rule.id && rule.code && typeof rule.test === 'function'))
})
