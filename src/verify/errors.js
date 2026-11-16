/**
 * FFmpeg stderr -> MediaQcErrorShape (code / Chinese message / executable hint).
 *
 * Rules match a pattern, not the whole line, and the list is ordered: the most
 * specific diagnosis wins. The ten real-world failures from report.md are
 * covered explicitly; the eleventh sample ("no stderr, but the container
 * parameters are wrong") is not an stderr mapping at all and is handled by
 * `mapVerifyFailure(verdict)`, which turns failed checks into E_VERIFY.
 *
 * Callers may pass context to disambiguate identical ffmpeg text:
 *   { input, output, phase: 'probe' | 'convert' | 'gif' | 'commit' | 'verify', role: 'input' | 'output' }
 * The same "No such file or directory" is E_INPUT for a missing input and
 * E_COMMIT for a missing output directory; the output rule runs first.
 */

/**
 * @typedef {import('../public/types.d.ts').MediaQcErrorShape} MediaQcErrorShape
 * @typedef {import('../public/types.d.ts').MediaQcErrorCode} MediaQcErrorCode
 * @typedef {{ input?: string, output?: string, phase?: string, role?: string }} ErrorContext
 */

/**
 * @typedef {object} ErrorRule
 * @property {string} id
 * @property {MediaQcErrorCode} code
 * @property {(text: string, context: ErrorContext) => boolean} test
 * @property {(context: ErrorContext) => string} message
 * @property {(context: ErrorContext) => string} hint
 */

/** @type {ReadonlyArray<ErrorRule>} */
export const ERROR_RULES = Object.freeze([
  {
    id: 'mp4-moov-missing',
    code: 'E_INPUT',
    test: text => /moov atom not found/i.test(text),
    message: () => 'MP4 缺少 moov atom：文件没有写完，或只是把别的格式改名成 .mp4。',
    hint: () => '重新导出/下载源文件；先用 ffprobe 确认真实容器，不要只看扩展名。'
  },
  {
    id: 'output-dir-missing',
    code: 'E_COMMIT',
    test: (text, context) =>
      /no such file or directory/i.test(text) &&
      (/(error opening output|error opening output file|could not open output|unable to open output|error opening file)/i.test(text) ||
        isOutputContext(context)),
    message: context => `输出目录或输出路径不存在：${pathLabel(context.output)}`,
    hint: () => '先创建输出目录并确认父目录存在；输出文件名里不要带未创建的子目录。'
  },
  {
    id: 'input-missing',
    code: 'E_INPUT',
    test: text => /no such file or directory/i.test(text),
    message: context => `找不到输入文件：${pathLabel(context.input)}`,
    hint: () => '检查盘符、大小写、引号和不可见空格；路径含空格时交给 argv 数组，不要手工拼命令行。'
  },
  {
    id: 'probe-input-unreadable',
    code: 'E_INPUT',
    test: text => /cannot probe .*: (?:file not found|not a regular file)/i.test(text),
    message: context => `输入文件无法读取：${pathLabel(context.input)}`,
    hint: () => '确认文件存在且是普通文件；目录、快捷方式、被占用的文件都不能作为输入。'
  },
  {
    id: 'no-output-stream',
    code: 'E_INPUT',
    test: text => /does not contain any stream/i.test(text),
    message: () => '输出文件不含任何流：映射没有选中音轨或视频轨。',
    hint: () => '先 probe 输入确认含所需流；从无音轨视频抽 MP3 时，应换素材或改任务。'
  },
  {
    id: 'concat-bom-or-corrupt',
    code: 'E_INPUT',
    test: text => /invalid data found when processing input/i.test(text),
    message: () => '输入数据无法解析：concat 列表可能带 BOM，或其中某个文件已损坏。',
    hint: () => '把 concat 列表另存为 UTF-8 无 BOM，路径用正斜杠；再用 ffprobe 逐个验证列表里的文件。'
  },
  {
    id: 'container-header',
    code: 'E_ENCODE',
    test: text => /could not write header|error writing header/i.test(text),
    message: () => '容器装不下当前编码或参数，写文件头失败。',
    hint: () => '换容器（如 MKV）或换该容器支持的编码；不要用扩展名冒充容器，也不要用流拷贝硬塞。'
  },
  {
    id: 'filter-space-split',
    code: 'E_ENCODE',
    test: text => /original_size|error initializing filter .*original_size/i.test(text),
    message: () => '滤镜参数被空格切断（original_size 只剩半截）。',
    hint: () => '含空格或冒号的值必须整体加引号/转义；不要把 Windows 路径直接拼进 filter 字符串。'
  },
  {
    id: 'filter-option-parse',
    code: 'E_ENCODE',
    test: text => /unable to parse option value/i.test(text),
    message: () => '滤镜参数解析失败：值里有多余字符，或 Windows 反斜杠没有转义。',
    hint: () => '滤镜里的路径改用正斜杠 /，并对含空格、冒号、单引号的值整体转义；优先用 argv 数组逐项传参。'
  },
  {
    id: 'odd-dimensions',
    code: 'E_ENCODE',
    test: text => /not divisible by 2/i.test(text),
    message: () => '宽或高是奇数，当前像素格式（通常是 yuv420p）无法编码。',
    hint: () => '用 scale=trunc(iw/2)*2:trunc(ih/2)*2，或 scale=1280:-2 保持比例并强制偶数。'
  },
  {
    id: 'tempo-out-of-range',
    code: 'E_ENCODE',
    test: text => /tempo out of range|atempo.*out of range/i.test(text),
    message: () => '变速参数超出 tempo 滤镜的允许范围。',
    hint: () => 'tempo 单次只能在 0.5–2.0 之间；超出就拆成多级 atempo，或重新设计变速比例。'
  },
  {
    id: 'missing-encoder-or-filter',
    code: 'E_CAPABILITY',
    test: text => /unknown encoder|encoder .* not found|unknown decoder|no such filter|unknown filter|unrecognized option|option not found/i.test(text),
    message: () => '当前 FFmpeg 构建缺少所需的编码器、滤镜或选项。',
    hint: () => '用 ffmpeg -encoders / -filters 查看本机能力；换一个本机存在的编码器，或安装完整构建。'
  },
  {
    id: 'spawn-enoent',
    code: 'E_CAPABILITY',
    test: text => /spawn .*enoent|\benoent\b|executable not found|failed to start .*ffmpeg|permission denied while starting/i.test(text),
    message: () => '找不到 FFmpeg 可执行文件，或进程无法启动。',
    hint: () => '确认 ffmpeg 在 PATH 中，或在设置里指定 ffmpeg.exe 的绝对路径；不要依赖当前工作目录。'
  },
  {
    id: 'disk-or-permission',
    code: 'E_COMMIT',
    test: text => /no space left on device|permission denied|access is denied/i.test(text),
    message: () => '写输出文件失败：磁盘空间不足或没有写入权限。',
    hint: () => '换一个可写目录、清理空间后重试；不要写到系统目录或受保护路径。'
  }
])

/**
 * Map one ffmpeg stderr blob to a MediaQcErrorShape. Empty stderr returns null:
 * "no error message" is not an error, and the caller must verify the product.
 * @param {string} stderr
 * @param {ErrorContext} [context]
 * @returns {MediaQcErrorShape | null}
 */
export function mapError(stderr, context = {}) {
  const text = String(stderr ?? '')
  if (text.trim() === '') return null
  const ctx = context && typeof context === 'object' ? context : {}

  for (const rule of ERROR_RULES) {
    if (!safeTest(rule, text, ctx)) continue
    return {
      code: rule.code,
      message: rule.message(ctx),
      hint: rule.hint(ctx)
    }
  }

  return {
    code: 'E_ENCODE',
    message: 'FFmpeg 报错，未能归入已知类型。',
    hint: `保留完整 stderr 和命令后重试；第一行是：${firstLine(text)}`
  }
}

/**
 * Sample 11: process exits 0 but the container/stream parameters are wrong.
 * Turns the first failed check into E_VERIFY so the caller can surface it with
 * the same shape as a process error.
 * @param {object | object[]} verdictOrChecks
 * @returns {MediaQcErrorShape | null}
 */
export function mapVerifyFailure(verdictOrChecks) {
  const checks = Array.isArray(verdictOrChecks)
    ? verdictOrChecks
    : (Array.isArray(verdictOrChecks?.checks) ? verdictOrChecks.checks : [])
  const failed = checks.filter(item => item?.outcome === 'fail')
  if (failed.length === 0) return null

  const first = failed[0]
  const detail = [
    `期望 ${first.expected}`,
    `实际 ${first.actual}`,
    first.delta ? `差 ${first.delta}` : null
  ].filter(Boolean).join('，')
  return {
    code: 'E_VERIFY',
    message: `验收不通过（${failed.length} 项不合格，产物参数异常）：${first.id} ${detail}`,
    hint: first.hint || '打开验收细目看全部失败项；先修第一条，再复测。'
  }
}

/**
 * @param {ErrorRule} rule
 * @param {string} text
 * @param {ErrorContext} context
 */
function safeTest(rule, text, context) {
  try {
    return rule.test(text, context) === true
  } catch {
    return false
  }
}

/** @param {ErrorContext} context */
function isOutputContext(context) {
  const role = String(context?.role ?? '').toLowerCase()
  const phase = String(context?.phase ?? '').toLowerCase()
  return role === 'output' || phase === 'output' || phase === 'commit' || phase === 'mux'
}

/** @param {unknown} value */
function pathLabel(value) {
  if (typeof value === 'string' && value.trim() !== '') return `「${value}」`
  return '（stderr 未给出路径）'
}

/** @param {string} text */
function firstLine(text) {
  const line = String(text ?? '').split(/\r?\n/).map(item => item.trim()).find(Boolean) ?? ''
  return line.length > 200 ? `${line.slice(0, 197)}...` : line
}
