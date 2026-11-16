/**
 * Repair policy. Two pure steps:
 *
 *   planRepairs(verdict, task, facts) -> RepairAction[]
 *       Decide what to do next from failed checks and the retry history.
 *       Never touches files or processes.
 *
 *   applyRepair(verdict, action, task) -> CommandPlan | null
 *       Turn one RepairAction into a new command *plan*. The caller owns argv:
 *       this module only states which streams are rebuilt, which are copied,
 *       and the one filter/codec change. `manual` actions return null.
 *
 * Retry caps come from policy.resolvePolicy(), never from this file.
 */

import { nextGifWidth, resolvePolicy } from './policy.js'

/**
 * @param {{ task?: object, spec?: object, facts?: object, checks?: object[], repairs?: object[], mode?: string }} verdict
 * @param {object} [task] Task that produced the file.
 * @param {object} [facts] MediaFacts of the produced file.
 * @returns {import('../public/types.d.ts').RepairAction[]}
 */
export function planRepairs(verdict = {}, task = verdict?.task, facts = verdict?.facts) {
  const checks = Array.isArray(verdict?.checks) ? verdict.checks : []
  const records = Array.isArray(verdict?.repairs) ? verdict.repairs : []
  const policy = resolvePolicy(verdict?.spec ?? {})
  const failed = checks.filter(item => item?.outcome === 'fail')
  if (failed.length === 0) return []

  const copy = isCopyMode(verdict, task)
  const gainRounds = countRecords(records, 'gain')
  const resizeRounds = countRecords(records, 'reencode')
  const rerunRounds = countRecords(records, 'rerun')

  /** @type {import('../public/types.d.ts').RepairAction[]} */
  const actions = []
  const seen = new Set()
  /** @param {import('../public/types.d.ts').RepairAction} action */
  const push = action => {
    const key = JSON.stringify(action)
    if (seen.has(key)) return
    seen.add(key)
    actions.push(action)
  }
  let gainHandled = false

  for (const item of failed) {
    switch (item.id) {
      case 'audio.loudness':
      case 'audio.truePeak': {
        if (gainHandled) break
        const db = gainFromCheck(item)
        if (db === null) {
          push(manual(item, '偏差无法换算成可执行增益'))
          gainHandled = true
          break
        }
        if (gainRounds >= policy.repair.maxLoudnessRounds) {
          push(manual(item, `闭环增益已用 ${gainRounds}/${policy.repair.maxLoudnessRounds} 轮`))
          gainHandled = true
          break
        }
        const clamped = clamp(round1(db), -policy.repair.maxGainDb, policy.repair.maxGainDb)
        if (Math.abs(clamped) < policy.repair.gainMinDb) {
          push(manual(item, `所需增益 ${clamped} dB 小于最小可执行值 ${policy.repair.gainMinDb} dB`))
          gainHandled = true
          break
        }
        push({ kind: 'gain', db: clamped })
        gainHandled = true
        break
      }

      case 'size.budget': {
        if (!isGifTask(task, verdict)) {
          push(manual(item, '格式转换不自动降质；请手动降低码率或改用 GIF 体积闭环'))
          break
        }
        if (resizeRounds >= policy.repair.maxGifSizeRounds) {
          push(manual(item, `缩宽已用 ${resizeRounds}/${policy.repair.maxGifSizeRounds} 轮`))
          break
        }
        const currentWidth = numberOrNull(task?.width) ??
          numberOrNull(facts?.video?.width) ??
          numberOrNull(verdict?.spec?.gif?.width) ?? 0
        const width = nextGifWidth(currentWidth, policy)
        if (width >= currentWidth || width <= policy.repair.gifMinWidth) {
          push(manual(item, `宽度已到下限 ${policy.repair.gifMinWidth}px，再缩会不可用`))
          break
        }
        push({ kind: 'reencode', width })
        break
      }

      case 'gif.duration': {
        if (rerunRounds >= policy.repair.maxRerunRounds) {
          push(manual(item, `重跑已用 ${rerunRounds}/${policy.repair.maxRerunRounds} 轮，仍与选区不符`))
          break
        }
        push({ kind: 'rerun', reason: `GIF 时长不符（期望 ${item.expected}，实际 ${item.actual}）；按同一选区重跑取段` })
        break
      }

      case 'duration.drift': {
        if (copy) {
          push(manual(item, '流拷贝只能落在关键帧上，时长偏差不是故障；要精确请改重编码'))
          break
        }
        if (rerunRounds >= policy.repair.maxRerunRounds) {
          push(manual(item, `重跑已用 ${rerunRounds}/${policy.repair.maxRerunRounds} 轮，时长仍不符`))
          break
        }
        push({ kind: 'rerun', reason: `重编码时长不符（期望 ${item.expected}，实际 ${item.actual}）；按原参数重跑一次` })
        break
      }

      case 'decodable.sample':
      case 'decodable.full': {
        if (rerunRounds >= policy.repair.maxRerunRounds) {
          push(manual(item, `解码失败且已重跑 ${rerunRounds} 轮；源文件可能损坏`))
          break
        }
        push({ kind: 'rerun', reason: `产物解码失败（${item.delta ?? item.actual}）；重跑一次以排除瞬时故障` })
        break
      }

      case 'gif.frames':
      case 'gif.loop':
      case 'video.codec':
      case 'video.resolution':
      case 'video.fps':
      case 'streams.count':
      case 'audio.codec':
      case 'audio.sampleRate':
      case 'audio.channels':
      default:
        push(manual(item, '参数与规格不符；同参数重跑大概率复现'))
        break
    }
  }

  return actions
}

/**
 * Build a command plan for one repair action. The caller composes argv; this
 * object states the stream disposition and the single changed parameter.
 * @param {object} verdict
 * @param {import('../public/types.d.ts').RepairAction} action
 * @param {object} [task]
 * @returns {object | null} null for manual actions (nothing executable).
 */
export function applyRepair(verdict = {}, action, task = verdict?.task) {
  if (!action || typeof action !== 'object') {
    throw new TypeError('applyRepair(verdict, action): action is required')
  }
  const facts = verdict?.facts ?? {}
  const spec = verdict?.spec ?? {}
  const records = Array.isArray(verdict?.repairs) ? verdict.repairs : []
  const policy = resolvePolicy(spec)
  const audio = facts?.audio ?? (facts?.streams ?? []).find(stream => stream?.type === 'audio') ?? null
  const source = typeof facts?.path === 'string' ? facts.path : null

  switch (action.kind) {
    case 'gain': {
      const db = action.db
      if (!Number.isFinite(db)) throw new TypeError('applyRepair: gain action needs a finite db')
      if (!audio) return null
      const round = countRecords(records, 'gain') + 1
      return {
        kind: 'audio-gain',
        action: { kind: 'gain', db },
        source,
        round,
        maxRounds: policy.repair.maxLoudnessRounds,
        // Which streams the new encode rebuilds vs copies:
        rebuild: { video: 'copy', audio: 'encode', subtitle: 'copy', data: 'copy' },
        audio: {
          codec: audio.codec ?? 'aac',
          sampleRate: numberOrNull(audio.sampleRate),
          channels: numberOrNull(audio.channels)
        },
        filter: `volume=${db > 0 ? '+' : ''}${db.toFixed(1)}dB`,
        notes: [
          '只重编音频流；视频流 -c:v copy，画面零损失。',
          `第 ${round}/${policy.repair.maxLoudnessRounds} 轮闭环增益：先测当前成品再算差，不采信 loudnorm 自报。`,
          '增益会抬高真峰值，下一轮必须复测真峰值。'
        ]
      }
    }

    case 'reencode': {
      if (!isGifTask(task, verdict)) {
        return null
      }
      const currentWidth = numberOrNull(task?.width) ??
        numberOrNull(facts?.video?.width) ??
        numberOrNull(spec?.gif?.width) ?? 0
      const width = numberOrNull(action.width) ?? nextGifWidth(currentWidth, policy)
      if (!Number.isFinite(width) || width < 2) {
        throw new TypeError('applyRepair: reencode action needs a positive width')
      }
      const gif = selectionOf(task, spec)
      const fps = numberOrNull(task?.fps) ?? numberOrNull(spec?.gif?.fps) ?? numberOrNull(facts?.video?.fps)
      const round = countRecords(records, 'reencode') + 1
      return {
        kind: 'gif-reencode',
        action: { kind: 'reencode', width },
        source,
        round,
        maxRounds: policy.repair.maxGifSizeRounds,
        rebuild: { video: 'encode', audio: 'none' },
        width,
        fps,
        selection: gif,
        filter: fps === null
          ? `scale=${width}:-2:flags=lanczos`
          : `fps=${formatNumber(fps)},scale=${width}:-2:flags=lanczos`,
        notes: [
          '只动宽度，选区和帧率保持不变。',
          `第 ${round}/${policy.repair.maxGifSizeRounds} 轮：宽度 ${currentWidth || '?'}px → ${width}px（×${policy.repair.gifWidthScale}，取偶数）。`,
          'GIF 无声音，音频流不重建。'
        ]
      }
    }

    case 'rerun': {
      const gifTask = task?.kind === 'gif'
      const round = countRecords(records, 'rerun') + 1
      return {
        kind: 'rerun',
        action: { kind: 'rerun', reason: action.reason },
        source,
        round,
        maxRounds: policy.repair.maxRerunRounds,
        rebuild: {
          video: 'encode',
          audio: gifTask ? 'none' : (audio ? 'encode' : 'none'),
          subtitle: 'copy'
        },
        notes: [
          action.reason || '按原任务参数重跑一次。',
          gifTask ? 'GIF 重建全部视频帧，音频丢弃。' : '视频与音频都重新编码；这是重跑，不保证比上次更接近目标。'
        ]
      }
    }

    case 'manual':
      return null

    default:
      throw new TypeError(`applyRepair: unknown RepairAction kind "${String(action?.kind)}"`)
  }
}

/**
 * @param {object} item check
 * @returns {number | null}
 */
function gainFromCheck(item) {
  const repair = item?.repair
  if (repair?.kind === 'gain' && Number.isFinite(repair.db)) return repair.db
  return null
}

/**
 * @param {object} item
 * @param {string} reason
 * @returns {import('../public/types.d.ts').RepairAction}
 */
function manual(item, reason) {
  const detail = [
    item?.expected ? `期望 ${item.expected}` : null,
    item?.actual ? `实际 ${item.actual}` : null,
    item?.delta ?? null
  ].filter(Boolean).join('；')
  return {
    kind: 'manual',
    reason: detail ? `${reason}。${detail}` : reason
  }
}

/** @param {object[]} records @param {string} kind */
function countRecords(records, kind) {
  return records.filter(record => record?.action?.kind === kind).length
}

/**
 * @param {object} verdict
 * @param {object} task
 */
function isCopyMode(verdict, task) {
  const mode = typeof verdict?.mode === 'string' ? verdict.mode.toLowerCase() : ''
  if (mode === 'copy' || mode === 'stream-copy' || mode === 'streamcopy') return true
  if (mode === 'reencode' || mode === 'encode') return false
  return task?.kind === 'convert' && task.copy === true
}

/**
 * @param {object} task
 * @param {object} verdict
 */
function isGifTask(task, verdict) {
  return task?.kind === 'gif' || Boolean(verdict?.spec?.gif)
}

/**
 * @param {object} task
 * @param {object} spec
 */
function selectionOf(task, spec) {
  if (task?.kind === 'gif' && Number.isFinite(task.from) && Number.isFinite(task.to)) {
    return { from: task.from, to: task.to, lengthSec: task.to - task.from }
  }
  const gif = spec?.gif
  if (gif && Number.isFinite(gif.from) && Number.isFinite(gif.to)) {
    return { from: gif.from, to: gif.to, lengthSec: gif.to - gif.from }
  }
  return null
}

/** @param {number} value */
function round1(value) {
  return Math.round(value * 10) / 10
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** @param {unknown} value */
function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** @param {number} value */
function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(round1(value))
}
