/**
 * Application service: wires engine + verifier into the public contract.
 * Parallelism is delegated to the scheduler (between jobs, never inside one).
 */
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'

import { resolveFfmpeg } from '../engine/locate.js'
import { probe as engineProbe } from '../engine/probe.js'
import { capabilities as engineCapabilities } from '../engine/capability.js'
import { run as engineRun } from '../engine/runner.js'
import { buildConvert, buildGif, estimateGifBytes } from '../engine/argv.js'
import { measure as createMeasure } from '../verify/measure.js'
import { runChecks, summarizeChecks } from '../verify/checks.js'
import { nextGifWidth } from '../verify/policy.js'
import { planRepairs } from '../verify/repair.js'
import { writeEvidence } from '../verify/evidence.js'
import { mapError, mapVerifyFailure } from '../verify/errors.js'
import { createScheduler } from './scheduler.js'

const JOB_TIMEOUT_MS = 30 * 60 * 1000

function defaultOutputDir() {
  return path.join(os.homedir(), 'Downloads', 'Kumquat')
}

function errorShape(code, message, hint) {
  return { code, message, hint }
}

/**
 * 缺少 FFmpeg 时的能力表：字段齐全但列表为空。
 * 面板据此把目标格式判为不可用，再由 `/ffmpeg/status` 的横幅提示安装，
 * 因此「没装 FFmpeg」不该是一份 500 错误。
 * @returns {import('../public/types.d.ts').Capabilities} 降级能力表。
 */
function unavailableCapabilities() {
  return Object.freeze({
    ffmpeg: '',
    ffprobe: '',
    version: '',
    filters: Object.freeze([]),
    encoders: Object.freeze([]),
    muxers: Object.freeze([]),
    available: false,
  })
}

/**
 * 判断错误是否表示「本机没有可用的 FFmpeg」。
 * `ensureFfmpeg` 把形状挂在 `.shape` 上，引擎层则直接给 `.code`，两种都要认。
 * @param {unknown} error - 抛出的值。
 * @returns {boolean} 是否为缺少 FFmpeg。
 */
function isMissingFfmpeg(error) {
  if (error === null || typeof error !== 'object') return false
  const value = /** @type {{ code?: unknown, shape?: { code?: unknown } }} */ (error)
  if (value.code === 'E_CAPABILITY') return true
  return value.shape !== null && typeof value.shape === 'object' && value.shape.code === 'E_CAPABILITY'
}

async function cleanupTemp(file, timeoutMs = 15000) {
  // On Windows the encoder may still be alive briefly after abort (the sandbox
  // can deny taskkill). Remove, wait, and confirm it stays gone.
  const deadline = Date.now() + timeoutMs
  let confirmed = 0
  while (Date.now() < deadline) {
    try {
      await fs.rm(file, { force: true })
    } catch {
      /* keep trying */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
    try {
      await fs.access(file)
      confirmed = 0
    } catch {
      confirmed += 1
      if (confirmed >= 2) return
    }
  }
}

async function uniquePath(dir, filename) {  const ext = path.extname(filename)
  const base = path.basename(filename, ext)
  let candidate = path.join(dir, filename)
  for (let i = 1; i < 1000; i += 1) {
    try {
      await fs.access(candidate)
      candidate = path.join(dir, `${base}-${i}${ext}`)
    } catch {
      return candidate
    }
  }
  return path.join(dir, `${base}-${randomUUID().slice(0, 8)}${ext}`)
}

/**
 * @param {{
 *   outputDir?: string,
 *   ffmpegPath?: string,
 *   binaryRoot?: string,
 *   resolveFfmpeg?: typeof resolveFfmpeg,
 *   onProgress?: (jobId: string, progress: object) => void,
 *   onEvent?: (event: object) => void,
 * }} [options]
 */
export function createService(options = {}) {
  const outputDirOption = options.outputDir || null
  const fallbackOutputDir = path.join(options.binaryRoot || path.join(os.homedir(), '.dsh', 'kumquat'), 'output')
  const evidenceRoot = path.join(options.binaryRoot || path.join(os.homedir(), '.dsh', 'kumquat'), 'jobs')
  const jobs = new Map()
  const progressSink = typeof options.onProgress === 'function' ? options.onProgress : () => {}
  const locateFfmpeg = typeof options.resolveFfmpeg === 'function' ? options.resolveFfmpeg : resolveFfmpeg

  let location = null
  let capsCache = null

  async function ensureFfmpeg() {
    if (location) return location
    const found = await locateFfmpeg(options.ffmpegPath ? { path: options.ffmpegPath } : {})
    if (!found) {
      const err = new Error('没有找到 FFmpeg')
      err.shape = errorShape(
        'E_CAPABILITY',
        '本机没有可用的 FFmpeg',
        '在面板里点“下载并安装”，或设置 KUMQUAT_FFMPEG 指向 ffmpeg 可执行文件',
      )
      throw err
    }
    location = found
    return location
  }

  async function capabilities() {
    let loc
    try {
      loc = await ensureFfmpeg()
    } catch (error) {
      // 缺 FFmpeg 不是故障：返回空表让面板照常渲染，安装提示由二进制横幅负责。
      if (isMissingFfmpeg(error)) return unavailableCapabilities()
      throw error
    }
    const key = `${loc.ffmpeg}|${loc.version}`
    if (capsCache && capsCache.key === key) return capsCache.value
    const value = await engineCapabilities({ ffmpeg: loc.ffmpeg })
    const flagged = Object.freeze({ ...value, available: true })
    capsCache = { key, value: flagged }
    return flagged
  }

  async function probe(input) {
    const loc = await ensureFfmpeg()
    return engineProbe(input, { ffprobe: loc.ffprobe, version: loc.version })
  }

  async function buildPlan(task, facts) {
    const loc = await ensureFfmpeg()
    if (task.kind === 'gif') {
      return buildGif({ ...task, ffmpeg: undefined }, { ffmpeg: loc.ffmpeg })
    }
    const caps = await capabilities()
    return buildConvert(task, facts, caps)
  }

  function planProgress(jobId, durationSec) {
    return (info) => {
      const seconds = Number(info?.seconds)
      const ratio = durationSec > 0 && Number.isFinite(seconds) ? Math.min(0.99, seconds / durationSec) : null
      progressSink(jobId, {
        phase: 'encoding',
        percent: ratio === null ? undefined : Math.round(ratio * 100),
        outTimeSec: Number.isFinite(seconds) ? Number(seconds.toFixed(2)) : undefined,
        speed: info?.speed ? `${Number(info.speed).toFixed(2)}x` : undefined,
      })
    }
  }

  async function executeOnce(jobId, task, signal, targetPath) {
    const facts = await probe(task.input)
    const plan = await buildPlan(task, facts)
    const durationSec = task.kind === 'gif' ? Math.max(0, task.to - task.from) : facts.durationSec
    const argv = plan.argv.slice()
    argv[argv.length - 1] = targetPath

    progressSink(jobId, { phase: 'encoding', percent: 0 })
    const result = await engineRun(argv, {
      signal,
      timeoutMs: JOB_TIMEOUT_MS,
      stallMs: 120000,
      onProgress: planProgress(jobId, durationSec),
    })
    if (result.stalled) throw Object.assign(new Error('超过 2 分钟没有进展，已停止；请重试或换个输出目录'), { code: 'E_STALL' })
    if (result.cancelled) throw Object.assign(new Error('已取消'), { cancelled: true })
    if (result.code !== 0) {
      const mapped = mapError(result.stderr, { task, input: task.input, output: targetPath })
      throw Object.assign(new Error(mapped?.message || `ffmpeg 退出码 ${result.code}`), {
        shape: mapped || errorShape('E_ENCODE', `编码失败（退出码 ${result.code}）`, '查看证据里的 stderr'),
        stderr: result.stderr,
      })
    }
    return { plan, facts, durationSec }
  }

  async function verifyOutput(jobId, task, plan, targetPath) {
    const loc = await ensureFfmpeg()
    const m = createMeasure({ run: engineRun, probe, ffmpeg: loc.ffmpeg })
    let facts
    try {
      facts = await probe(targetPath)
    } catch (error) {
      const mapped = mapError(String(error?.message || error), { task, output: targetPath })
      throw Object.assign(new Error(mapped?.message || '产物无法读取'), {
        shape: mapped || errorShape('E_VERIFY', '产物无法读取', '检查输出目录权限与磁盘空间'),
      })
    }

    progressSink(jobId, { phase: 'verifying', percent: 99 })
    const sampleMode = plan.spec?.decodable === 'full' ? 'full' : 'sample'
    const decode = await m.decode(targetPath, { sample: sampleMode, facts })
    const loudness = facts.audio ? await m.loudness(targetPath) : null
    const gif = task.kind === 'gif' ? await m.gifInfo(targetPath, { facts }) : null

    const measurements = {
      decode,
      decodeMode: sampleMode,
      loudness,
      gif,
      vfr: facts.video?.vfr === true,
      task,
      sourceDurationSec: task.kind === 'gif' ? Math.max(0, task.to - task.from) : undefined,
      maxBytes: task.kind === 'gif' ? task.maxBytes : undefined,
    }
    const checks = runChecks(facts, plan.spec || {}, measurements, task)
    const summary = summarizeChecks(checks)
    return {
      verdict: { ok: summary.ok, task, spec: plan.spec || {}, facts, checks, repairs: [] },
      facts,
      gif,
    }
  }

  async function commit(tempPath, finalPath) {
    await fs.mkdir(path.dirname(finalPath), { recursive: true })
    await fs.rename(tempPath, finalPath)
  }

  async function canFfmpegWrite(dir) {
    // Node can write where ffmpeg cannot: Windows Controlled Folder Access
    // blocks the encoder on Desktop/Downloads/Documents, so ask ffmpeg itself.
    const loc = await ensureFfmpeg()
    const probe = path.join(dir, `.kq-write-${randomUUID().slice(0, 6)}.mp4`)
    try {
      const result = await engineRun([
        loc.ffmpeg, '-hide_banner', '-v', 'error', '-f', 'lavfi',
        '-i', 'color=c=black:s=32x32:d=1', '-frames:v', '1', '-y', probe,
      ], { timeoutMs: 15000 })
      return result.code === 0
    } catch {
      return false
    } finally {
      await fs.rm(probe, { force: true }).catch(() => {})
    }
  }

  async function pickOutputDir(task, preferredDir) {
    const uploadsRoot = path.join(options.binaryRoot || path.join(os.homedir(), '.dsh', 'kumquat'), 'uploads')
    const fromUpload = path.resolve(task.input).startsWith(uploadsRoot + path.sep)
    const preferred = preferredDir || outputDirOption || (fromUpload ? fallbackOutputDir : path.dirname(path.resolve(task.input)))
    if (await canFfmpegWrite(preferred)) return { dir: preferred, targetDir: preferred, note: null }
    await fs.mkdir(fallbackOutputDir, { recursive: true }).catch(() => {})
    if (await canFfmpegWrite(fallbackOutputDir)) {
      // Encode where ffmpeg can write, then move the finished file into the
      // folder the user picked: Node can write where ffmpeg is blocked.
      return { dir: fallbackOutputDir, targetDir: preferred, note: null }
    }
    return { dir: preferred, targetDir: preferred, note: null }
  }

  async function commitOutput(source, dest, fallbackDir) {
    try {
      await commit(source, dest)
      return dest
    } catch (error) {
      const alt = await uniquePath(fallbackDir, path.basename(dest))
      await commit(source, alt)
      return alt
    }
  }

  async function runTask(jobId, task, signal, preferredDir, exactPath) {
    try {
      await fs.access(task.input)
    } catch {
      const err = new Error(`输入文件不存在：${task.input}`)
      err.shape = errorShape('E_INPUT', err.message, '检查路径是否存在、是否有读取权限')
      err.handled = true
      throw err
    }
    let outputDir
    let targetDir
    let finalPath
    if (typeof exactPath === 'string' && exactPath !== '') {
      outputDir = path.dirname(exactPath)
      targetDir = outputDir
      await fs.mkdir(outputDir, { recursive: true })
      finalPath = exactPath
    } else {
      const chosen = await pickOutputDir(task, preferredDir)
      outputDir = chosen.dir
      targetDir = chosen.targetDir || chosen.dir
      if (chosen.note !== null) {
        const jobRecord = jobs.get(jobId)
        if (jobRecord) {
          jobRecord.summary.note = chosen.note
          jobRecord.detail.note = chosen.note
        }
      }
      await fs.mkdir(outputDir, { recursive: true })
      await fs.mkdir(targetDir, { recursive: true }).catch(() => {})
      finalPath = await uniquePath(targetDir, `${path.basename(task.input, path.extname(task.input))}${task.kind === 'gif' ? '.gif' : '.' + String(task.to).replace(/^\./, '').toLowerCase()}`)
    }
    const ext = task.kind === 'gif' ? '.gif' : '.' + String(task.to).replace(/^\./, '').toLowerCase()
    const stem = path.basename(task.input, path.extname(task.input))
    // Temporary files live in a private subfolder so a killed encoder cannot
    // leave a stray ".part" next to the user's files. Same volume, atomic rename.
    const partDir = path.join(outputDir, '.kumquat-tmp')
    await fs.mkdir(partDir, { recursive: true })
    const tempPath = path.join(partDir, `${stem}-${jobId}${ext}`)
    const record = jobs.get(jobId)

    try {
      let { plan, durationSec } = await executeOnce(jobId, task, signal, tempPath)
      let verified = await verifyOutput(jobId, task, plan, tempPath)

      // GIF size loop: shrink width, re-encode, re-verify. At most 2 rounds.
      const repairs = []
      let width = task.kind === 'gif' ? (task.width ?? 480) : null
      for (let round = 0; task.kind === 'gif' && task.maxBytes && !verified.verdict.ok && round < 2; round += 1) {
        const sizeCheck = verified.verdict.checks.find((c) => c.id === 'size.budget' && c.outcome === 'fail')
        if (!sizeCheck) break
        const nextWidth = nextGifWidth(width)
        if (nextWidth >= width) break
        const before = sizeCheck.actual || ''
        width = nextWidth
        const nextTask = { ...task, width }
        plan = await buildPlan(nextTask, verified.facts)
        const nextTemp = path.join(partDir, `${stem}-${jobId}-r${round + 1}${ext}`)
        const argv = plan.argv.slice()
        argv[argv.length - 1] = nextTemp
        const result = await engineRun(argv, { signal, timeoutMs: JOB_TIMEOUT_MS, onProgress: planProgress(jobId, Math.max(0, task.to - task.from)) })
        if (result.code !== 0) break
        const nextVerified = await verifyOutput(jobId, nextTask, plan, nextTemp)
        repairs.push({
          action: { kind: 'reencode', width: nextWidth },
          ok: nextVerified.verdict.ok,
          before,
          after: nextVerified.verdict.facts.bytes ? `${(nextVerified.verdict.facts.bytes / 1024 / 1024).toFixed(1)} MB` : '',
        })
        if (nextVerified.verdict.ok) {
          await fs.rm(tempPath, { force: true })
          finalPath = await commitOutput(nextTemp, finalPath, outputDir)
          verified = nextVerified
          verified.verdict.repairs = repairs
          break
        }
        await fs.rm(nextTemp, { force: true })
        verified = nextVerified
      }

      if (!verified.verdict.ok && !verified.verdict.repairs?.length) {
        verified.verdict.repairs = repairs
      }

      const evidencePath = await writeEvidence(path.join(evidenceRoot, jobId), verified.verdict)
      verified.verdict.evidencePath = evidencePath

      if (verified.verdict.ok) {
        finalPath = await commitOutput(tempPath, finalPath, outputDir)
        if (record && path.resolve(path.dirname(finalPath)) !== path.resolve(targetDir)) {
          const note = '所选目录不可写，成品已放在 ' + finalPath
          record.summary.note = note
          record.detail.note = note
        }
      } else {
        await fs.rm(tempPath, { force: true })
      }

      record.summary.output = verified.verdict.ok ? finalPath : undefined
      record.summary.endedAt = Date.now()
      // The list endpoint returns summaries; without this the panel shows
      // "没有验收结果" even though the verdict exists on the detail.
      record.summary.verdict = verified.verdict
      record.detail.verdict = verified.verdict
      record.detail.argv = plan.argv
      if (!verified.verdict.ok) {
        const mapped = mapVerifyFailure(verified.verdict)
        record.detail.error = mapped || errorShape('E_VERIFY', '产物未通过验收', '查看证据里的逐项判定')
      }
      return verified.verdict.ok
        ? { ok: true, output: finalPath, verdict: verified.verdict }
        : { ok: false, verdict: verified.verdict }
    } catch (error) {
      await cleanupTemp(tempPath)
      try {
        const leftovers = (await fs.readdir(partDir)).filter((name) => name.includes(jobId))
        for (const name of leftovers) await cleanupTemp(path.join(partDir, name), 3000)
      } catch {
        /* partDir may not exist */
      }
      record.summary.endedAt = Date.now()
      record.detail.error = error.shape || errorShape('E_ENCODE', String(error?.message || error), '重试或查看证据')
      if (error.cancelled) throw error
      throw Object.assign(error, { handled: true })
    }
  }

  const scheduler = createScheduler({
    onEvent(event) {
      const record = jobs.get(event.id)
      if (!record) return
      if (event.type === 'progress' && event.progress) {
        record.summary.progress = { ...(record.summary.progress || {}), ...event.progress }
        return
      }
      if (event.type === 'start') record.summary.status = 'running'
      if (event.type === 'done') record.summary.status = record.detail.error ? 'failed' : 'done'
      if (event.type === 'error') record.summary.status = 'failed'
      if (event.type === 'cancel') record.summary.status = 'cancelled'
      if (typeof options.onEvent === 'function') options.onEvent(event)
    },
  })

  async function run(task, opts = {}) {
    const id = `job-${randomUUID().slice(0, 8)}`
    const summary = { id, task, status: 'queued', startedAt: Date.now() }
    const detail = { id, task, status: 'queued', startedAt: summary.startedAt }
    const record = { summary, detail }
    jobs.set(id, record)

    const handle = scheduler.submit({
      id,
      run: async (signal) => {
        summary.status = 'running'
        const result = await runTask(id, task, signal, opts.outputDir, opts.outputPath)
        summary.status = result.ok ? 'done' : 'failed'
        return result
      },
    })
    handle.promise.catch((error) => {
      if (error?.name === 'AbortError') {
        summary.status = 'cancelled'
        detail.status = 'cancelled'
        summary.endedAt = Date.now()
      } else {
        summary.status = 'failed'
        detail.status = 'failed'
        summary.endedAt = Date.now()
        if (!detail.error) detail.error = error?.shape || errorShape('E_ENCODE', String(error?.message || error), '重试或查看日志')
      }
    })
    return summary
  }

  async function cancel(jobId) {
    // Status flips to cancelled only after the child exits and temp files are
    // cleaned, so callers can trust "cancelled" to mean "no leftovers".
    scheduler.cancel(jobId)
  }

  async function verify(target, spec = {}) {
    const loc = await ensureFfmpeg()
    const m = createMeasure({ run: engineRun, probe, ffmpeg: loc.ffmpeg })
    const facts = await probe(target)
    const decode = await m.decode(target, { sample: spec.decodable === 'full' ? 'full' : 'sample', facts })
    const loudness = facts.audio ? await m.loudness(target) : null
    const isGif = path.extname(target).toLowerCase() === '.gif'
    const gif = isGif ? await m.gifInfo(target, { facts }) : null

    let effectiveSpec = spec
    let pseudoTask
    if (isGif) {
      const from = Number(spec.gif?.from ?? 0)
      const to = Number(spec.gif?.to ?? gif?.durationSec ?? facts.durationSec ?? 0)
      const fps = Number(spec.gif?.fps ?? gif?.fps ?? 12)
      const width = Number(spec.gif?.width ?? gif?.width ?? 480)
      effectiveSpec = { ...spec, gif: { from, to, fps, width, loop: true } }
      pseudoTask = { kind: 'gif', input: target, from, to, fps, width, maxBytes: spec.maxBytes }
    }

    const measurements = {
      decode,
      decodeMode: spec.decodable === 'full' ? 'full' : 'sample',
      loudness,
      gif,
      vfr: facts.video?.vfr === true,
      task: pseudoTask,
      maxBytes: spec.maxBytes,
    }
    const checks = runChecks(facts, effectiveSpec, measurements, pseudoTask)
    const summary = summarizeChecks(checks)
    const verdict = { ok: summary.ok, task: pseudoTask, spec: effectiveSpec, facts, checks, repairs: [] }
    const repairs = planRepairs(verdict, pseudoTask, facts)
    verdict.repairs = Array.isArray(repairs) ? repairs : []
    return verdict
  }

  return {
    apiVersion: 1,
    probe,
    capabilities,
    run,
    verify,
    cancel,
    jobs: {
      async list() {
        return [...jobs.values()].map((r) => ({ ...r.summary }))
      },
      async get(id) {
        const record = jobs.get(id)
        if (!record) throw Object.assign(new Error('job not found'), { shape: errorShape('E_INPUT', '任务不存在', '刷新任务列表') })
        // Summary carries the live status; detail carries verdict/argv/error.
        return { ...record.detail, ...record.summary }
      },
    },
  }
}

export { estimateGifBytes }







