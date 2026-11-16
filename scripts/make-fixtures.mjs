#!/usr/bin/env node
/**
 * Generate the Kumquat test fixtures into `fixtures/` using the local ffmpeg.
 *
 * - deterministic sources only (lavfi testsrc2 + 440 Hz sine), no network;
 * - idempotent: an existing non-empty fixture is skipped unless `--force`;
 * - every generated file is probed and checked against its declared spec, so a
 *   wrong ffmpeg build fails loudly instead of poisoning the e2e suite;
 * - `fixtures/bad-sub.srt` is deliberately never created (missing-path sample).
 *
 * Usage:
 *   node scripts/make-fixtures.mjs [--force]
 *
 * Target: under 2 minutes on a modern desktop with ffmpeg 6.x.
 */

import { mkdir, open, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describeMedia, findFfmpeg, probeJson, run } from '../test/helpers/ffmpeg.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES_DIR = path.join(ROOT, 'fixtures')
const FORCE = process.argv.includes('--force')

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/make-fixtures.mjs [--force]')
  process.exit(0)
}

const ffmpeg = findFfmpeg()
if (!ffmpeg) {
  console.error('ffmpeg not found. Set KUMQUAT_FFMPEG/FFMPEG_PATH or add ffmpeg to PATH.')
  console.error('Windows: winget install Gyan.FFmpeg  (or https://www.gyan.dev/ffmpeg/builds/)')
  process.exit(1)
}

/** Common flags: never read stdin (a stray console can otherwise block ffmpeg). */
const BASE_ARGS = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y']

/**
 * @typedef {Object} FixtureSpec
 * @property {string} name
 * @property {string} note
 * @property {string[]} args ffmpeg output arguments, output path appended by the runner
 * @property {{ width?: number, height?: number, fps?: number, durationSec?: number, audio?: boolean, channels?: number, sampleRate?: number }} expect
 */

/** @type {FixtureSpec[]} */
const GOOD_FIXTURES = [
  {
    name: 'bar-12s.mp4',
    note: '1280x720 30fps h264 + 440Hz stereo aac, 12s',
    args: [
      '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '12',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    ],
    expect: { width: 1280, height: 720, fps: 30, durationSec: 12, audio: true, channels: 2, sampleRate: 48000 },
  },
  {
    name: 'bar-30s-longgop.mp4',
    note: '640x360 30fps g=300 (10s GOP) h264 + aac, 30s',
    args: [
      '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '30',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32',
      '-g', '300', '-keyint_min', '300', '-sc_threshold', '0', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
    ],
    expect: { width: 640, height: 360, fps: 30, durationSec: 30, audio: true, channels: 2 },
  },
  {
    name: 'tone-30s.wav',
    note: '48kHz stereo pcm_s16le, 30s',
    args: [
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '30', '-ac', '2', '-c:a', 'pcm_s16le',
    ],
    expect: { durationSec: 30, audio: true, channels: 2, sampleRate: 48000 },
  },
  {
    name: 'tone-5s.mp3',
    note: '24kHz mono libmp3lame, 5s',
    args: [
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=24000',
      '-t', '5', '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k',
    ],
    expect: { durationSec: 5, audio: true, channels: 1, sampleRate: 24000 },
  },
  {
    name: 'noaudio-4s.mp4',
    note: '640x360 30fps h264, no audio, 4s',
    args: [
      '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
      '-t', '4',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p',
      '-an',
    ],
    expect: { width: 640, height: 360, fps: 30, durationSec: 4, audio: false },
  },
  {
    name: 'vertical-4s.mp4',
    note: '1080x1920 portrait 30fps h264 + aac, 4s',
    args: [
      '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '4',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '32', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
    ],
    expect: { width: 1080, height: 1920, fps: 30, durationSec: 4, audio: true, channels: 2 },
  },
]

/**
 * Bad samples. Each builder writes one file; failures are not silent.
 * @typedef {{ name: string, note: string, build: (file: string) => Promise<void> }} BadSpec
 * @type {BadSpec[]}
 */
const BAD_FIXTURES = [
  {
    name: 'fake.mp4',
    note: 'plain text renamed to .mp4',
    async build(file) {
      const decoy = 'This is a plain-text decoy file. It has a .mp4 extension but no media streams.\n'
      await writeFile(file, decoy.repeat(40), 'utf8')
    },
  },
  {
    name: 'truncated.mp4',
    note: 'first 100KB of bar-12s.mp4 (moov atom missing)',
    async build(file) {
      const source = path.join(FIXTURES_DIR, 'bar-12s.mp4')
      const length = 100 * 1024
      const handle = await open(source, 'r')
      try {
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, 0)
        if (bytesRead < length) {
          throw new Error(`bar-12s.mp4 is smaller than ${length} bytes; cannot build truncated.mp4`)
        }
        await writeFile(file, buffer.subarray(0, bytesRead))
      } finally {
        await handle.close()
      }
    },
  },
  {
    name: 'list-bom.txt',
    note: 'ffconcat list written with a UTF-8 BOM',
    async build(file) {
      const content = "\uFEFFffconcat version 1.0\nfile 'bar-12s.mp4'\n"
      await writeFile(file, content, 'utf8')
    },
  },
]

/**
 * @param {string} file
 * @returns {Promise<boolean>}
 */
async function isReady(file) {
  try {
    const info = await stat(file)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

/**
 * Compare a probe result with the declared spec.
 * @param {FixtureSpec} spec
 * @param {any} probe
 * @returns {string[]} problems (empty means OK)
 */
function checkProbe(spec, probe) {
  const problems = []
  const streams = Array.isArray(probe?.streams) ? probe.streams : []
  const video = streams.find((stream) => stream.codec_type === 'video')
  const audio = streams.find((stream) => stream.codec_type === 'audio')
  const expect = spec.expect

  if (expect.width !== undefined) {
    if (!video) problems.push('missing video stream')
    else if (video.width !== expect.width || video.height !== expect.height) {
      problems.push(`size ${video.width}x${video.height}, expected ${expect.width}x${expect.height}`)
    }
  }
  if (expect.fps !== undefined && video) {
    const [num, den] = String(video.avg_frame_rate ?? '0/0').split('/').map(Number)
    const fps = den ? num / den : NaN
    if (!Number.isFinite(fps) || Math.abs(fps - expect.fps) > 0.01) {
      problems.push(`fps ${video.avg_frame_rate}, expected ${expect.fps}`)
    }
  }
  if (expect.audio === true && !audio) problems.push('missing audio stream')
  if (expect.audio === false && audio) problems.push('unexpected audio stream')
  if (audio) {
    if (expect.channels !== undefined && audio.channels !== expect.channels) {
      problems.push(`channels ${audio.channels}, expected ${expect.channels}`)
    }
    if (expect.sampleRate !== undefined && Number(audio.sample_rate) !== expect.sampleRate) {
      problems.push(`sample rate ${audio.sample_rate}, expected ${expect.sampleRate}`)
    }
  }
  if (expect.durationSec !== undefined) {
    const duration = Number(probe?.format?.duration)
    if (!Number.isFinite(duration) || Math.abs(duration - expect.durationSec) > 0.15) {
      problems.push(`duration ${Number.isFinite(duration) ? duration.toFixed(3) : '?'}s, expected ${expect.durationSec}s`)
    }
  }
  return problems
}

/**
 * Generate (or reuse) one ffmpeg fixture and validate it.
 * @param {FixtureSpec} spec
 * @returns {Promise<{ name: string, status: string, bytes: number, media: string }>}
 */
async function ensureGoodFixture(spec) {
  const file = path.join(FIXTURES_DIR, spec.name)
  let status = 'skipped'

  if (FORCE || !(await isReady(file))) {
    const started = Date.now()
    const result = await run([ffmpeg, ...BASE_ARGS, ...spec.args, file], { timeoutMs: 120_000 })
    if (result.timedOut) throw new Error(`ffmpeg timed out generating ${spec.name}`)
    if (result.code !== 0) {
      throw new Error(`ffmpeg failed generating ${spec.name} (exit ${result.code})\n${result.stderr.trim()}`)
    }
    if (!(await isReady(file))) throw new Error(`ffmpeg reported success but ${spec.name} is missing or empty`)
    status = 'generated'
    process.stdout.write(`  generated ${spec.name} in ${((Date.now() - started) / 1000).toFixed(2)}s\n`)
  }

  const probe = await probeJson(file)
  const problems = checkProbe(spec, probe)
  if (problems.length > 0) {
    throw new Error(
      `${spec.name} does not match its spec:\n  - ${problems.join('\n  - ')}\n` +
      (status === 'skipped' ? 'Re-run with --force to regenerate it.' : 'Check the local ffmpeg build.'),
    )
  }

  const info = await stat(file)
  return { name: spec.name, status, bytes: info.size, media: describeMedia(probe) }
}

/**
 * Generate (or reuse) one hand-built bad sample.
 * @param {BadSpec} spec
 * @returns {Promise<{ name: string, status: string, bytes: number, media: string }>}
 */
async function ensureBadFixture(spec) {
  const file = path.join(FIXTURES_DIR, spec.name)
  let status = 'skipped'
  if (FORCE || !(await isReady(file))) {
    await spec.build(file)
    if (!(await isReady(file))) throw new Error(`builder produced no file for ${spec.name}`)
    status = 'generated'
  }
  const info = await stat(file)
  return { name: spec.name, status, bytes: info.size, media: spec.note }
}

/**
 * Print a fixed-width table.
 * @param {{ name: string, status: string, bytes: number, media: string }[]} rows
 */
function printTable(rows) {
  const nameWidth = Math.max(4, ...rows.map((row) => row.name.length))
  const statusWidth = Math.max(6, ...rows.map((row) => row.status.length))
  const sizeWidth = Math.max(8, ...rows.map((row) => formatBytes(row.bytes).length))
  const header = `${'fixture'.padEnd(nameWidth)}  ${'status'.padEnd(statusWidth)}  ${'size'.padStart(sizeWidth)}  media / note`
  console.log(header)
  console.log('-'.repeat(header.length))
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(nameWidth)}  ${row.status.padEnd(statusWidth)}  ${formatBytes(row.bytes).padStart(sizeWidth)}  ${row.media}`,
    )
  }
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  const totalStart = Date.now()
  await mkdir(FIXTURES_DIR, { recursive: true })

  console.log(`Kumquat fixtures → ${FIXTURES_DIR}`)
  console.log(`ffmpeg: ${ffmpeg}`)
  if (FORCE) console.log('--force: regenerating every fixture')
  console.log('')

  /** @type {{ name: string, status: string, bytes: number, media: string }[]} */
  const rows = []
  for (const spec of GOOD_FIXTURES) rows.push(await ensureGoodFixture(spec))
  for (const spec of BAD_FIXTURES) rows.push(await ensureBadFixture(spec))

  // bad-sub.srt must stay absent: it is the “path does not exist” sample.
  const missingSub = path.join(FIXTURES_DIR, 'bad-sub.srt')
  try {
    await unlink(missingSub)
    rows.push({ name: 'bad-sub.srt', status: 'removed', bytes: 0, media: 'intentionally absent (missing-path sample)' })
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    rows.push({ name: 'bad-sub.srt', status: 'absent', bytes: 0, media: 'intentionally absent (missing-path sample)' })
  }

  const elapsed = (Date.now() - totalStart) / 1000
  console.log('')
  printTable(rows)
  console.log('')
  console.log(`Done in ${elapsed.toFixed(2)}s (${rows.filter((row) => row.status === 'generated').length} generated, ` +
    `${rows.filter((row) => row.status === 'skipped').length} skipped).`)
  if (elapsed > 120) {
    console.log('WARNING: fixture generation exceeded the 120s budget on this machine.')
  }
}

main().catch((error) => {
  console.error('')
  console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
