/**
 * Kumquat · 「添加文件」的宿主目录浏览入口。
 *
 * 约定（写入 README，S5 对接）：
 *   - 宿主若提供 ctx.pickFile({ filters }) → Promise<string | { path } | null>，
 *     就用宿主目录浏览；否则给出明确的一句「改用粘贴路径」，绝不假装能选文件。
 *   - 无论哪条路，最终只登记绝对路径，不上传、不复制。
 */

import { parsePathInput } from './logic.js'

/**
 * 选一个媒体文件的绝对路径。
 * @param {((options: { filters: string[] }) => Promise<any>) | undefined | null} pickFile
 * @returns {Promise<{ ok: true, path: string, name: string } | { ok: false, error: { code: string, message: string, hint: string } }>}
 */
export async function requestPath(pickFile) {
  if (typeof pickFile !== 'function') {
    return {
      ok: false,
      error: {
        code: 'E_NO_PICKER',
        message: '宿主没有提供目录浏览',
        hint: '改用「粘贴路径」填绝对路径，界面一样能跑。',
      },
    }
  }
  let picked
  try {
    picked = await pickFile({ filters: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'mp3', 'm4a', 'wav', 'flac'] })
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'E_PICKER',
        message: '目录浏览没有返回结果',
        hint: '也可以直接用「粘贴路径」。',
      },
    }
  }
  if (picked === null || picked === undefined || picked === '') {
    return { ok: false, error: { code: 'E_CANCELLED', message: '没有选择文件', hint: '' } }
  }
  const candidate = typeof picked === 'string' ? picked : typeof picked.path === 'string' ? picked.path : ''
  const parsed = parsePathInput(candidate)
  if (parsed.ok !== true) {
    return { ok: false, error: { code: 'E_INPUT', message: parsed.message, hint: parsed.hint } }
  }
  return { ok: true, path: parsed.path, name: parsed.name }
}
