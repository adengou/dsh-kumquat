import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildGif } from '../../src/engine/argv.js'
import { resolveFfmpeg } from '../../src/engine/locate.js'
import { probe } from '../../src/engine/probe.js'
import { run } from '../../src/engine/runner.js'

/**
 * One real-FFmpeg smoke test. Generates a 5 s testsrc2 clip when no fixture is
 * available, runs the exact GIF argv produced by buildGif, and checks the
 * result with ffprobe. Skipped when FFmpeg is absent.
 */
test('real ffmpeg produces a 5 s, 480 px, 12 fps GIF', async (t) => {
  const located = await resolveFfmpeg({})
  if (!located) {
    t.skip('FFmpeg/ffprobe not found on this machine')
    return
  }

  const base = path.join(process.cwd(), 'fixtures')
  await mkdir(base, { recursive: true })
  const dir = await mkdtemp(path.join(base, 'smoke-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const clip = path.join(dir, 'testsrc2.mp4')

  const generated = await run(
    [
      located.ffmpeg,
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x180:rate=24:duration=5',
      '-pix_fmt',
      'yuv420p',
      clip,
    ],
    { timeoutMs: 120_000 },
  )
  assert.equal(generated.code, 0, generated.stderr)

  const plan = buildGif(
    { kind: 'gif', input: clip, from: 0, to: 5, fps: 12, width: 480 },
    { ffmpeg: located.ffmpeg },
  )
  const result = await run(plan.argv, { timeoutMs: 120_000 })
  assert.equal(result.code, 0, result.stderr)

  const bytes = (await stat(plan.outputPath)).size
  assert.ok(bytes > 10_000, `GIF too small: ${bytes} bytes`)

  const facts = await probe(plan.outputPath, {
    ffprobe: located.ffprobe,
    version: located.version,
  })
  assert.equal(facts.container, 'gif')
  assert.equal(facts.video?.codec, 'gif')
  assert.equal(facts.video?.width, 480)
  assert.equal(facts.video?.height, 270)
  assert.equal(facts.video?.fps, 12)
  assert.equal(facts.bytes, bytes)

  const counted = await run(
    [
      located.ffprobe,
      '-v',
      'error',
      '-count_frames',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=nb_read_frames',
      '-of',
      'csv=p=0',
      plan.outputPath,
    ],
    { timeoutMs: 30_000 },
  )
  assert.equal(counted.code, 0, counted.stderr)
  const frames = Number(counted.stdout.trim())
  assert.equal(frames, 60, '5 s at 12 fps must be exactly 60 frames')
  assert.ok(Math.abs(frames / 12 - (5 - 0)) <= 0.2)
})
