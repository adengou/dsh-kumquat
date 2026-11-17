/**
 * 视频裁剪参数：可选、纯函数、与 ffmpeg 解耦。
 * 只负责校验与归一化，命令构造仍由 argv.js 负责。
 */

/**
 * @param {{ from?: number, to?: number } | undefined | null} trim
 * @param {number} [durationSec] 源时长；未知时跳过上界检查
 * @returns {{ from: number, to: number, duration: number } | null}
 */
export function normalizeTrim(trim, durationSec) {
  if (trim === undefined || trim === null) return null
  if (typeof trim !== 'object') throw new Error('trim 必须是 { from, to } 对象')
  const from = Number(trim.from)
  const to = Number(trim.to)
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('裁剪起止必须是秒数')
  if (from < 0) throw new Error('裁剪起点不能小于 0')
  if (to <= from) throw new Error('裁剪终点必须大于起点')
  if (Number.isFinite(durationSec) && durationSec > 0 && to > durationSec + 0.5) {
    throw new Error(`裁剪终点超出源时长（${durationSec.toFixed(1)} 秒）`)
  }
  return { from, to, duration: Math.round((to - from) * 1000) / 1000 }
}
