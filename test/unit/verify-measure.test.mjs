import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  measure,
  parseEbur128,
  parseFrameProbe,
  scanGifLoop,
  scanGifTiming
} from '../../src/verify/measure.js'

function argValue(argv, flag) {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : null
}

function recorder(handler) {
  const calls = []
  return {
    calls,
    run: async argv => {
      calls.push(argv)
      return handler(argv, calls.length)
    }
  }
}

function gifBuffer(loopCount) {
  return Buffer.concat([
    Buffer.from('GIF89a', 'latin1'),
    Buffer.from([0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from([0x21, 0xff, 0x0b]),
    Buffer.from('NETSCAPE2.0', 'latin1'),
    Buffer.from([0x03, 0x01, loopCount & 0xff, (loopCount >> 8) & 0xff, 0x00]),
    Buffer.from([0x3b])
  ])
}

/** Minimal GIF with one graphic-control + image-descriptor block per delay (1/100 s). */
function gifWithFrames(delaysCs, loopCount = null) {
  const parts = [
    Buffer.from('GIF89a', 'latin1'),
    Buffer.from([0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00])
  ]
  if (loopCount !== null) {
    parts.push(
      Buffer.from([0x21, 0xff, 0x0b]),
      Buffer.from('NETSCAPE2.0', 'latin1'),
      Buffer.from([0x03, 0x01, loopCount & 0xff, (loopCount >> 8) & 0xff, 0x00])
    )
  }
  for (const delay of delaysCs) {
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x00, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00]))
    parts.push(Buffer.from([
      0x2c,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0x02,
      0x02, 0x44, 0x01,
      0x00
    ]))
  }
  parts.push(Buffer.from([0x3b]))
  return Buffer.concat(parts)
}

test('decode sample: head 5s, tail 5s, middle 2s, one ffmpeg call per window', async () => {
  const probeCalls = []
  const { calls, run } = recorder(() => ({ code: 0, stdout: '', stderr: '' }))
  const m = measure({
    run,
    probe: async filePath => {
      probeCalls.push(filePath)
      return { durationSec: 20 }
    },
    ffmpeg: 'C:\\tools\\ffmpeg.exe'
  })
  const result = await m.decode('C:\\in\\a.mp4', { sample: 'sample' })

  assert.equal(probeCalls.length, 1)
  assert.equal(calls.length, 3)
  assert.equal(calls[0][0], 'C:\\tools\\ffmpeg.exe')
  assert.equal(argValue(calls[0], '-ss'), '0')
  assert.equal(argValue(calls[0], '-t'), '5')
  assert.equal(argValue(calls[1], '-ss'), '15')
  assert.equal(argValue(calls[2], '-ss'), '9')
  assert.equal(argValue(calls[2], '-t'), '2')
  assert.equal(argValue(calls[0], '-map'), '0:v:0?')
  assert.deepEqual(calls[0].slice(-3), ['-f', 'null', '-'])
  assert.equal(result.ok, true)
  assert.equal(result.clean, true)
  assert.deepEqual(result.windows.map(window => window.id), ['head', 'tail', 'middle'])
})

test('decode sample: a short file is fully covered by the head window', async () => {
  const { calls, run } = recorder(() => ({ code: 0, stderr: '' }))
  const m = measure({ run, probe: async () => ({ durationSec: 3 }), ffmpeg: 'ffmpeg' })
  const result = await m.decode('short.mp4', { sample: 'sample' })

  assert.equal(calls.length, 1)
  assert.equal(result.ok, true)
  assert.equal(result.windows.filter(window => window.skipped).length, 2)
  assert.match(result.windows[1].reason, /短于|覆盖/)
})

test('decode full: one call, no -ss/-t, window id full', async () => {
  const { calls, run } = recorder(() => ({ code: 0, stderr: '' }))
  const m = measure({ run, probe: async () => ({ durationSec: 10 }), ffmpeg: 'ffmpeg' })
  const result = await m.decode('a.mp4', { sample: 'full' })

  assert.equal(calls.length, 1)
  assert.equal(argValue(calls[0], '-ss'), null)
  assert.equal(result.mode, 'full')
  assert.equal(result.windows[0].id, 'full')
})

test('decode failures keep per-window stderr and aggregated errors', async () => {
  const { run } = recorder(argv => {
    if (argValue(argv, '-ss') === '15') {
      return { code: 1, stdout: '', stderr: 'Invalid data found when processing input' }
    }
    return { code: 0, stdout: '', stderr: '' }
  })
  const m = measure({ run, probe: async () => ({ durationSec: 20 }), ffmpeg: 'ffmpeg' })
  const result = await m.decode('a.mp4', { sample: 'sample' })

  assert.equal(result.ok, false)
  assert.match(result.stderr, /Invalid data/)
  assert.ok(result.errors.some(line => line.startsWith('[tail]')))
})

test('probe failure is reported instead of throwing', async () => {
  const { calls, run } = recorder(() => ({ code: 0, stderr: '' }))
  const m = measure({
    run,
    probe: async () => {
      throw new Error('probe exploded')
    },
    ffmpeg: 'ffmpeg'
  })
  const result = await m.decode('missing.mp4')

  assert.equal(result.ok, false)
  assert.equal(result.probeError, 'probe exploded')
  assert.equal(calls.length, 0)
})

test('loudness parses the ebur128 Summary block', async () => {
  const summary = [
    '[Parsed_ebur128_0 @ 0x1] Summary:',
    '',
    '  Integrated loudness:',
    '    I:         -16.5 LUFS',
    '    Threshold: -26.5 LUFS',
    '',
    '  Loudness range:',
    '    LRA:         7.2 LU',
    '    Threshold: -36.5 LUFS',
    '    LRA low:   -22.0 LUFS',
    '    LRA high:  -14.8 LUFS',
    '',
    '  True peak:',
    '    Peak:       -1.1 dBFS'
  ].join('\n')
  const { calls, run } = recorder(() => ({ code: 0, stdout: '', stderr: summary }))
  const m = measure({ run, probe: async () => ({}), ffmpeg: 'ffmpeg' })
  const result = await m.loudness('C:\\in\\a.mp4')

  assert.equal(result.ok, true)
  assert.equal(result.integratedLufs, -16.5)
  assert.equal(result.lra, 7.2)
  assert.equal(result.truePeakDb, -1.1)
  assert.deepEqual(result.summary, {
    I: 'I:         -16.5 LUFS',
    LRA: 'LRA:         7.2 LU',
    Peak: 'Peak:       -1.1 dBFS'
  })
  assert.equal(argValue(calls[0], '-af'), 'ebur128=peak=true')
  assert.equal(argValue(calls[0], '-map'), '0:a:0')
  assert.deepEqual(calls[0].slice(-3), ['-f', 'null', '-'])
})

test('loudness preserves -inf for a silent track and fails cleanly without a summary', async () => {
  const silent = measure({
    run: async () => ({ code: 0, stderr: 'I: -inf LUFS\nLRA: 0.0 LU\nPeak: -inf dBFS' }),
    probe: async () => ({}),
    ffmpeg: 'ffmpeg'
  }).loudness('silent.mp4')
  const silentResult = await silent
  assert.equal(silentResult.ok, true)
  assert.equal(silentResult.integratedLufs, -Infinity)
  assert.equal(silentResult.truePeakDb, -Infinity)

  const broken = await measure({
    run: async () => ({ code: 1, stderr: 'Output file does not contain any stream' }),
    probe: async () => ({}),
    ffmpeg: 'ffmpeg'
  }).loudness('noaudio.mp4')
  assert.equal(broken.ok, false)
  assert.equal(broken.integratedLufs, null)
})

test('parseEbur128 handles CRLF, extra spaces and missing sections', () => {
  const parsed = parseEbur128(
    '  Integrated loudness:\r\n    I:  -23.0 LUFS\r\n  Loudness range:\r\n    LRA: 0.1 LU\r\n  True peak:\r\n    Peak: 0.0 dBFS\r\n'
  )
  assert.equal(parsed.integratedLufs, -23)
  assert.equal(parsed.lra, 0.1)
  assert.equal(parsed.truePeakDb, 0)

  const empty = parseEbur128('nothing here')
  assert.equal(empty.integratedLufs, null)
  assert.equal(empty.lra, null)
  assert.equal(empty.truePeakDb, null)
})

test('scanGifLoop reads the NETSCAPE2.0 loop count (0 = infinite)', () => {
  const infinite = scanGifLoop(gifBuffer(0))
  assert.equal(infinite.loop, true)
  assert.equal(infinite.loopCount, 0)
  assert.equal(infinite.malformed, false)

  const finite = scanGifLoop(gifBuffer(3))
  assert.equal(finite.loop, true)
  assert.equal(finite.loopCount, 3)

  const noLoop = scanGifLoop(Buffer.from('GIF89a', 'latin1'))
  assert.equal(noLoop.loop, false)
  assert.equal(noLoop.loopCount, null)
  assert.equal(noLoop.netscape, false)

  const malformed = scanGifLoop(Buffer.concat([
    Buffer.from('GIF89a', 'latin1'),
    Buffer.from('NETSCAPE2.0', 'latin1'),
    Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00])
  ]))
  assert.equal(malformed.netscape, true)
  assert.equal(malformed.loop, false)
  assert.equal(malformed.malformed, true)

  assert.throws(() => scanGifLoop('not a buffer'), /Buffer/)
})

test('scanGifTiming sums frame delays when ffprobe has no duration', () => {
  const timing = scanGifTiming(gifWithFrames([10, 20]))
  assert.equal(timing.frameCount, 2)
  assert.equal(timing.delayCount, 2)
  assert.equal(timing.totalDelayMs, 300)
  assert.equal(timing.durationSec, 0.3)
  assert.equal(timing.minDelayMs, 100)
  assert.equal(timing.maxDelayMs, 200)
  assert.equal(timing.allFramesHaveDelay, true)

  const noFrames = scanGifTiming(gifBuffer(0))
  assert.equal(noFrames.frameCount, 0)
  assert.equal(noFrames.malformed, true)

  assert.throws(() => scanGifTiming('nope'), /Buffer/)
})

test('gifInfo falls back to GIF frame delays when probe duration is 0', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kumquat-gif-'))
  const file = path.join(dir, 'timed.gif')
  try {
    await writeFile(file, gifWithFrames([10, 20], 0))
    const m = measure({
      run: async () => ({
        code: 0,
        stdout: JSON.stringify({
          streams: [{
            nb_read_frames: '2',
            width: '1',
            height: '1',
            avg_frame_rate: '10/1',
            codec_name: 'gif'
          }]
        }),
        stderr: ''
      }),
      probe: async () => ({ durationSec: 0, video: { width: 1, height: 1, fps: 10 } }),
      ffmpeg: 'ffmpeg'
    })
    const info = await m.gifInfo(file)

    assert.equal(info.frames, 2)
    assert.equal(info.durationSec, 0.3)
    assert.equal(info.durationSource, 'gif-delays')
    assert.equal(info.timing.frameCount, 2)
    assert.equal(info.loop, true)
    assert.equal(info.loopCount, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('gifInfo: frames from ffprobe -count_frames, loop from binary scan, size from probe', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kumquat-gif-'))
  const file = path.join(dir, 'cat.gif')
  try {
    await writeFile(file, gifBuffer(0))
    const size = (await stat(file)).size
    const calls = []
    const m = measure({
      run: async argv => {
        calls.push(argv)
        return {
          code: 0,
          stdout: JSON.stringify({
            streams: [{
              nb_read_frames: '60',
              width: 480,
              height: 270,
              avg_frame_rate: '12/1',
              codec_name: 'gif'
            }]
          }),
          stderr: ''
        }
      },
      probe: async () => ({
        durationSec: 5,
        bytes: size,
        video: { width: 480, height: 270, fps: 12 }
      }),
      ffmpeg: { path: 'C:\\tools\\ffmpeg.exe', ffprobe: 'C:\\tools\\ffprobe.exe' }
    })
    const info = await m.gifInfo(file)

    assert.equal(calls[0][0], 'C:\\tools\\ffprobe.exe')
    assert.ok(calls[0].includes('-count_frames'))
    assert.equal(argValue(calls[0], '-select_streams'), 'v:0')
    assert.equal(info.ok, true)
    assert.equal(info.frames, 60)
    assert.equal(info.loop, true)
    assert.equal(info.loopCount, 0)
    assert.equal(info.width, 480)
    assert.equal(info.height, 270)
    assert.equal(info.fps, 12)
    assert.equal(info.durationSec, 5)
    assert.equal(info.bytes, size)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('parseFrameProbe tolerates JSON, garbage and N/A fields', () => {
  const parsed = parseFrameProbe('{"streams":[{"nb_read_frames":"62","width":"480","height":"270","avg_frame_rate":"12/1","codec_name":"gif"}]}')
  assert.equal(parsed.frames, 62)
  assert.equal(parsed.width, 480)
  assert.equal(parsed.height, 270)
  assert.equal(parsed.fps, 12)

  assert.deepEqual(parseFrameProbe('not json'), {
    frames: null,
    width: null,
    height: null,
    fps: null,
    codec: null
  })
  assert.equal(parseFrameProbe('{"streams":[{"nb_read_frames":"N/A"}]}').frames, null)
})
