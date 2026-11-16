import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { probe } from '../../src/engine/probe.js'

const FFPROBE = path.join('tools', 'ffprobe.exe')

/**
 * @param {import('node:test').TestContext} t
 * @param {Buffer | string} content
 */
async function fixtureFile(t, content) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kumquat-probe-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = path.join(root, 'sample.mp4')
  await writeFile(file, content)
  return file
}

/** @param {unknown} payload */
function probeRun(payload) {
  return async () => ({
    code: 0,
    stdout: typeof payload === 'string' ? payload : JSON.stringify(payload),
    stderr: '',
  })
}

const JSON_FIXTURE = {
  streams: [
    {
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      width: 1920,
      height: 1080,
      r_frame_rate: '30000/1001',
      avg_frame_rate: '30/1',
    },
    {
      index: 1,
      codec_type: 'audio',
      codec_name: 'aac',
      sample_rate: '48000',
      channels: 2,
    },
    {
      index: 2,
      codec_type: 'subtitle',
      codec_name: 'subrip',
    },
    {
      index: 3,
      codec_type: 'data',
      codec_name: 'bin_data',
    },
  ],
  format: {
    format_name: 'matroska,webm',
    duration: '12.345',
    size: '999999',
  },
}

test('probe normalizes ffprobe JSON into MediaFacts', async (t) => {
  const content = 'x'.repeat(1234)
  const file = await fixtureFile(t, content)
  const calls = []
  const run = async (argv) => {
    calls.push(argv)
    return probeRun(JSON_FIXTURE)(argv)
  }

  const facts = await probe(file, { ffprobe: FFPROBE, version: '6.1.1', run })

  assert.equal(facts.path, file)
  assert.equal(facts.bytes, Buffer.byteLength(content), 'bytes come from stat, not format.size')
  assert.equal(facts.container, 'matroska')
  assert.equal(facts.formatName, 'matroska,webm')
  assert.equal(facts.durationSec, 12.345)
  assert.equal(facts.ffmpegVersion, '6.1.1')
  assert.equal(facts.streams.length, 3, 'data streams are ignored')
  assert.deepEqual(facts.video, {
    index: 0,
    type: 'video',
    codec: 'h264',
    width: 1920,
    height: 1080,
    fps: 29.97,
    vfr: true,
  })
  assert.deepEqual(facts.audio, {
    index: 1,
    type: 'audio',
    codec: 'aac',
    sampleRate: 48000,
    channels: 2,
  })

  assert.equal(calls.length, 1, 'version was supplied, so no extra -version call')
  assert.deepEqual(calls[0].slice(0, 6), [
    FFPROBE,
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
  ])
  assert.ok(calls[0].includes('-show_streams'))
  assert.equal(calls[0].at(-1), file)
})

test('probe leaves missing fields absent instead of inventing values', async (t) => {
  const file = await fixtureFile(t, 'abc')
  const payload = {
    streams: [{ index: 0, codec_type: 'video', codec_name: 'vp9' }],
    format: { format_name: 'matroska,webm' },
  }

  const facts = await probe(file, {
    ffprobe: FFPROBE,
    version: '6.1.1',
    run: probeRun(payload),
  })

  assert.equal(facts.durationSec, 0)
  assert.equal(facts.container, 'matroska')
  assert.equal(facts.video?.codec, 'vp9')
  assert.equal(facts.video?.width, undefined)
  assert.equal(facts.video?.height, undefined)
  assert.equal(facts.video?.fps, undefined)
  assert.equal(facts.audio, undefined)
  assert.equal(facts.streams.length, 1)
})

test('probe marks VFR only when r_frame_rate and avg_frame_rate disagree', async (t) => {
  const file = await fixtureFile(t, 'abc')
  const cfr = {
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'h264', r_frame_rate: '24/1', avg_frame_rate: '24/1' },
    ],
    format: { format_name: 'mov', duration: '3' },
  }
  const cfrFacts = await probe(file, {
    ffprobe: FFPROBE,
    version: '6.1.1',
    run: probeRun(cfr),
  })
  assert.equal(cfrFacts.video?.vfr, undefined)
  assert.equal(cfrFacts.video?.fps, 24)
})

test('probe marks an unnamed codec as unknown', async (t) => {
  const file = await fixtureFile(t, 'abc')
  const payload = {
    streams: [{ index: 0, codec_type: 'audio', sample_rate: '44100' }],
    format: { format_name: 'wav', duration: '1.5' },
  }
  const facts = await probe(file, {
    ffprobe: FFPROBE,
    version: '6.1.1',
    run: probeRun(payload),
  })

  assert.equal(facts.audio?.codec, 'unknown')
  assert.equal(facts.audio?.channels, undefined)
  assert.equal(facts.durationSec, 1.5)
})

test('probe falls back to ffprobe -version when no version is passed', async (t) => {
  const file = await fixtureFile(t, 'abc')
  const calls = []
  const run = async (argv) => {
    calls.push(argv)
    if (argv.at(-1) === '-version') {
      return { code: 0, stdout: 'ffprobe version 7.0-test Copyright', stderr: '' }
    }
    return probeRun({ streams: [], format: { format_name: 'wav', duration: '2' } })(argv)
  }

  const facts = await probe(file, { ffprobe: path.join('tools', 'ffprobe-version-test'), run })
  assert.equal(facts.ffmpegVersion, '7.0')
  assert.equal(calls.length, 2)
})

test('probe rejects unreadable files, failed ffprobe runs and broken JSON', async (t) => {
  await assert.rejects(
    probe(path.join(os.tmpdir(), 'kumquat-does-not-exist.mp4'), {
      ffprobe: FFPROBE,
      version: '6.1.1',
      run: probeRun({}),
    }),
    /file not found/,
  )

  const file = await fixtureFile(t, 'abc')
  await assert.rejects(
    probe(file, {
      ffprobe: FFPROBE,
      version: '6.1.1',
      run: async () => ({ code: 1, stdout: '', stderr: 'Invalid data found when processing input' }),
    }),
    /ffprobe failed .*exit 1.*Invalid data found/,
  )

  await assert.rejects(
    probe(file, { ffprobe: FFPROBE, version: '6.1.1', run: probeRun('{not json') }),
    /unreadable JSON/,
  )
})

test('probe requires an ffprobe path', async () => {
  await assert.rejects(probe('x.mp4', {}), /ffprobe path is required/)
  await assert.rejects(probe('', { ffprobe: FFPROBE }), /path must be a non-empty string/)
})
