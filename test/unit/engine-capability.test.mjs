import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { capabilities, hasEncoder, hasFilter, hasMuxer } from '../../src/engine/capability.js'

const FILTERS = [
  'Filters:',
  '  T.. = Timeline support',
  '  .S. = Slice threading',
  '  ..C = Command support',
  '  A = Audio input/output',
  '  V = Video input/output',
  '  N = Dynamic number and/or type of input/output',
  '  | = Source or sink filter',
  ' ... abench            A->A       Benchmark part of a filtergraph.',
  ' TSC adrc              A->A       Audio Spectral Dynamic Range Controller.',
  ' ... fps               V->V       Force constant framerate.',
  ' ..C palettegen        V->V       Generate a palette from an image.',
  ' ..C paletteuse        VV->V      Use a palette to downsample an input video stream.',
  ' T.. scale             V->V       Scale the input video size and/or convert the image format.',
  ' .S. split             V->N       Split input into several identical outputs.',
].join('\r\n')

const ENCODERS = [
  'Encoders:',
  ' V..... = Video',
  ' A..... = Audio',
  ' S..... = Subtitle',
  ' .F.... = Frame-level multithreading',
  ' ..S... = Slice-level multithreading',
  ' ...X.. = Codec is experimental',
  ' ....B. = Supports draw_horiz_band',
  ' .....D = Supports direct rendering method 1',
  ' ------',
  ' V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC (codec h264)',
  ' V....D libx265              libx265 H.265 / HEVC (codec hevc)',
  ' A....D aac                  AAC (Advanced Audio Coding)',
  ' A....D libmp3lame           libmp3lame MP3 (MPEG audio layer 3)',
  ' A....D libopus              libopus Opus',
  ' V....D libvpx-vp9           libvpx VP9 (codec vp9)',
  ' A....D pcm_s16le            PCM signed 16-bit little-endian',
  ' A....D flac                 FLAC (Free Lossless Audio Codec)',
].join('\n')

const MUXERS = [
  'File formats:',
  ' D. = Demuxing supported',
  ' .E = Muxing supported',
  ' --',
  '  E 3gp             3GP (3GPP file format)',
  '  E avi             AVI (Audio Video Interleaved)',
  '  E flac            Raw FLAC',
  '  E ipod            iPod H.264 MP4 (MPEG-4 Part 14)',
  '  E matroska        Matroska',
  '  E mov             QuickTime / MOV',
  '  E mp3             MP3 (MPEG audio layer 3)',
  '  E mp4             MP4 (MPEG-4 Part 14)',
  '  E wav             WAV / WAVE (Waveform Audio)',
  '  E webm            WebM',
  '  D dash            DASH Muxer',
].join('\r\n')

/** @param {string} command */
function fixtureFor(command) {
  if (command.includes('-filters')) return { code: 0, stdout: FILTERS, stderr: '' }
  if (command.includes('-encoders')) return { code: 0, stdout: ENCODERS, stderr: '' }
  if (command.includes('-muxers')) return { code: 0, stdout: MUXERS, stderr: '' }
  return { code: 0, stdout: 'ffmpeg version 9.9.9-fixture Copyright', stderr: '' }
}

test('capabilities parses aligned filters/encoders/muxers tables', async () => {
  /** @type {string[][]} */
  const calls = []
  const run = async (argv) => {
    calls.push(argv)
    return fixtureFor(argv)
  }
  const caps = await capabilities({
    ffmpeg: path.join('tools', 'ffmpeg'),
    version: 'fixture-parse-1',
    run,
  })

  for (const name of ['fps', 'scale', 'split', 'palettegen', 'paletteuse', 'abench']) {
    assert.ok(caps.filters.includes(name), `filter ${name}`)
  }
  assert.equal(caps.filters.includes('Timeline'), false)
  assert.equal(caps.filters.includes('='), false)

  for (const name of ['libx264', 'libx265', 'aac', 'libmp3lame', 'libopus', 'libvpx-vp9', 'pcm_s16le', 'flac']) {
    assert.ok(caps.encoders.includes(name), `encoder ${name}`)
  }
  assert.equal(caps.encoders.includes('='), false)
  assert.equal(caps.encoders.includes('------'), false)

  for (const name of ['mp4', 'mov', 'matroska', 'webm', 'avi', 'mp3', 'ipod', 'wav', 'flac', '3gp']) {
    assert.ok(caps.muxers.includes(name), `muxer ${name}`)
  }
  assert.equal(caps.muxers.includes('='), false)
  assert.equal(caps.muxers.includes('dash'), false, 'demux-only rows must not count as muxers')

  assert.equal(caps.version, 'fixture-parse-1')
  assert.equal(caps.ffprobe, path.join('tools', 'ffprobe'))
  assert.equal(calls.length, 3)
  assert.ok(calls.every((argv) => argv[0] === path.join('tools', 'ffmpeg')))

  assert.equal(hasFilter(caps, 'paletteuse'), true)
  assert.equal(hasEncoder(caps, 'libx264'), true)
  assert.equal(hasMuxer(caps, 'matroska'), true)
  assert.equal(hasFilter(caps, 'nope'), false)
  assert.equal(hasEncoder(caps, 'nope'), false)
  assert.equal(hasMuxer(caps, 'nope'), false)
  assert.equal(hasFilter({ ...caps, filters: undefined }, 'fps'), false)
})

test('capabilities caches parsed lists by version and ffmpeg path', async () => {
  let calls = 0
  const run = async (argv) => {
    calls += 1
    return fixtureFor(argv)
  }
  const ffmpeg = path.join('tools', 'ffmpeg')
  const otherFfmpeg = path.join('tools', 'other-ffmpeg')

  const first = await capabilities({ ffmpeg, version: 'fixture-cache-1', run })
  assert.equal(calls, 3)

  const second = await capabilities({ ffmpeg, version: 'fixture-cache-1', run })
  assert.equal(calls, 3, 'same version and path must be served from memory')
  assert.deepEqual(second.filters, first.filters)
  assert.equal(second.version, 'fixture-cache-1')

  const other = await capabilities({ ffmpeg: otherFfmpeg, version: 'fixture-cache-1', run })
  assert.equal(calls, 6, 'a different binary with the same version must not reuse old capabilities')
  assert.equal(other.ffmpeg, otherFfmpeg)
  assert.equal(other.version, 'fixture-cache-1')

  await capabilities({ ffmpeg: otherFfmpeg, version: 'fixture-cache-1', run })
  assert.equal(calls, 6, 'the second binary is cached on its own')
})

test('capabilities derives its own version when none is passed', async () => {
  /** @type {string[][]} */
  const calls = []
  const run = async (argv) => {
    calls.push(argv)
    if (argv.at(-1) === '-version') {
      return { code: 0, stdout: 'ffmpeg version 8.8.8-derived Copyright', stderr: '' }
    }
    return fixtureFor(argv)
  }

  const caps = await capabilities({ ffmpeg: path.join('tools', 'ffmpeg'), run })
  assert.equal(caps.version, '8.8.8')
  assert.equal(calls.length, 4, 'one -version plus three table commands')
  assert.deepEqual(calls[0], [path.join('tools', 'ffmpeg'), '-version'])
})

test('capabilities surfaces a failed table command', async () => {
  const run = async (argv) => {
    if (argv.includes('-muxers')) {
      return { code: 1, stdout: '', stderr: 'Unknown option -muxers' }
    }
    return fixtureFor(argv)
  }

  await assert.rejects(
    capabilities({ ffmpeg: 'ffmpeg', version: 'fixture-fail-1', run }),
    /ffmpeg -muxers failed \(exit 1\): Unknown option -muxers/,
  )
  await assert.rejects(capabilities({}), /ffmpeg path is required/)
})
