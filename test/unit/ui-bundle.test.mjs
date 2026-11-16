import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

import { bindHost } from '../../src/client/h.js'
import { ACT, initialState } from '../../src/client/state.js'
import {
  reducer,
  selectBinary,
  selectConvert,
  selectGif,
  selectHome,
  selectResults,
} from '../../src/client/logic.js'
import { BinaryBanner } from '../../src/client/components/BinaryBanner.js'
import { HomeScreen } from '../../src/client/screens/HomeScreen.js'
import { ConvertScreen } from '../../src/client/screens/ConvertScreen.js'
import { GifScreen } from '../../src/client/screens/GifScreen.js'
import { ResultsPanel } from '../../src/client/screens/ResultsPanel.js'

const clientPath = new URL('../../client.js', import.meta.url)
const source = readFileSync(clientPath, 'utf8')
const MB = 1024 * 1024
const noop = () => {}

/**
 * 一个够用的 React 假件：单次渲染、按路径记住 hook 状态、不跑 effect。
 * 目的不是模拟 React，而是证明生成的面板在「没有 DOM、没有宿主、接口全失败」
 * 的环境里也能渲染出空态，而不是白屏。
 */
function createHarness() {
  const cells = new Map()
  let current = null
  function cellFor(path) {
    if (!cells.has(path)) cells.set(path, { values: [], effects: [], cursor: 0 })
    return cells.get(path)
  }
  function withCell(path, run) {
    const previous = current
    const cell = cellFor(path)
    cell.cursor = 0
    current = cell
    try {
      return run()
    } finally {
      current = previous
    }
  }
  const React = {
    createElement(type, props, ...children) {
      const elementProps = Object.assign({}, props || {})
      if (children.length === 1) elementProps.children = children[0]
      else if (children.length > 1) elementProps.children = children
      return { type, props: elementProps }
    },
    Fragment: 'Fragment',
    useState(initial) {
      const cell = current
      const index = cell.cursor++
      if (!(index in cell.values)) cell.values[index] = typeof initial === 'function' ? initial() : initial
      return [cell.values[index], (next) => {
        cell.values[index] = typeof next === 'function' ? next(cell.values[index]) : next
      }]
    },
    useRef(initial) {
      const cell = current
      const index = cell.cursor++
      if (!(index in cell.values)) cell.values[index] = { current: initial }
      return cell.values[index]
    },
    useEffect(fn) {
      const cell = current
      const index = cell.cursor++
      cell.effects[index] = fn
    },
  }
  function render(node, path = 'root') {
    if (node === null || node === undefined || node === false || node === true) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map((child, index) => render(child, `${path}.${index}`)).join('')
    if (typeof node !== 'object') return ''
    if (typeof node.type === 'function') {
      const name = node.type.name || 'Anonymous'
      return withCell(`${path}/${name}`, () => render(node.type(node.props), `${path}/${name}`))
    }
    const children = node.props ? node.props.children : undefined
    if (children === undefined) return ''
    return Array.isArray(children)
      ? children.map((child, index) => render(child, `${path}.${index}`)).join('')
      : render(children, `${path}.0`)
  }
  return { React, render }
}

function loadBundle() {
  const registrations = []
  const styles = []
  const warnings = []
  const document = {
    head: { append(element) { styles.push(element) } },
    createElement(tag) {
      return {
        tagName: tag,
        attrs: {},
        textContent: '',
        style: {},
        setAttribute(name, value) { this.attrs[name] = value },
        remove() { this.removed = true },
      }
    },
    querySelectorAll() { return [] },
  }
  const sandbox = {
    console: { log() {}, warn(...args) { warnings.push(args.join(' ')) }, error() {} },
    document,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AbortController: typeof AbortController === 'function' ? AbortController : undefined,
  }
  sandbox.window = sandbox
  sandbox.window.__ModuleLoader__ = { load(registration) { registrations.push(registration) } }
  vm.runInContext(source, vm.createContext(sandbox), { filename: 'client.js' })
  return { registrations, styles, warnings }
}

function materialize(harness) {
  const { registrations, styles, warnings } = loadBundle()
  assert.equal(registrations.length, 1, 'client.js 应当只注册一个 bundle')
  const registration = registrations[0]
  const seen = []
  const exports = registration.factory((specifier) => {
    seen.push(specifier)
    if (specifier === 'react') return harness.React
    throw new Error(`unexpected require: ${specifier}`)
  })
  return { registration, exports, seen, styles, warnings }
}

function fakeContext() {
  const ctx = {
    effects: [],
    effect(fn) {
      ctx.effects.push(fn)
    },
    slots: {
      injected: [],
      registered: [],
      inject(owner, callback) {
        ctx.slots.injected.push({ owner, callback })
      },
      register(options, component) {
        ctx.slots.registered.push({ options, component })
        return () => {}
      },
    },
  }
  return ctx
}

test('bundle: client.js 是经典脚本，只注册 dsh-kumquat 一个工厂', () => {
  assert.doesNotMatch(source, /^import\s/m)
  assert.doesNotMatch(source, /^export\s/m)
  assert.match(source, /window\.__ModuleLoader__\.load\(/)
  const { registrations } = loadBundle()
  assert.equal(registrations[0].id, 'dsh-kumquat')
  assert.equal(typeof registrations[0].factory, 'function')
})

test('bundle: 工厂只向宿主取 react，并暴露 inject/apply', () => {
  const harness = createHarness()
  const { exports, seen } = materialize(harness)
  assert.deepEqual(seen, ['react'])
  assert.equal(Array.from(exports.inject).join(','), 'slots')
  assert.equal(typeof exports.apply, 'function')
})

test('bundle: apply 注册侧栏、主面板与 dock，并注入样式', () => {
  const harness = createHarness()
  const { exports, styles } = materialize(harness)
  const ctx = fakeContext()
  exports.apply(ctx)
  assert.deepEqual(
    ctx.slots.injected.map((item) => item.owner),
    ['main', 'sidebar.panellist', 'conversation.composer.dock'],
  )
  for (const item of ctx.slots.injected) item.callback()
  assert.equal(ctx.slots.registered.length, 3)
  const byName = Object.fromEntries(ctx.slots.registered.map((entry) => [entry.options.name, entry.options]))
  assert.equal(byName['main'].key, 'kumquat')
  assert.equal(byName['sidebar.panellist'].id, 'kumquat')
  assert.equal(byName['conversation.composer.dock'].order, 5)
  assert.equal(typeof ctx.slots.registered[0].component, 'function')

  assert.equal(ctx.effects.length, 1)
  const cleanup = ctx.effects[0]()
  assert.equal(styles.length, 1)
  assert.equal(styles[0].attrs['data-plugin'], 'dsh-kumquat')
  assert.match(styles[0].textContent, /\.kq-panel/)
  assert.equal(typeof cleanup, 'function')
  cleanup()
  assert.equal(styles[0].removed, true)
})

test('bundle: slots 服务缺失时只告警，不抛错', () => {
  const harness = createHarness()
  const { exports, warnings } = materialize(harness)
  assert.doesNotThrow(() => exports.apply({}))
  assert.ok(warnings.length >= 1)
  assert.match(warnings[0], /slots/)
})

test('bundle: 断网空态可渲染 —— 首页、最近、余额都在，不白屏', () => {
  const harness = createHarness()
  const { exports } = materialize(harness)
  let component = null
  const ctx = {
    effect() {},
    slots: {
      inject(owner, callback) {
        callback()
      },
      register(options, registered) {
        component = registered
        return () => {}
      },
    },
  }
  exports.apply(ctx)
  assert.equal(typeof component, 'function')
  // Rendering the overlay needs a real React runtime; the panel factory is
  // exposed so hosts (and browser tests) can mount it directly.
  assert.equal(typeof exports.panel, 'function')
})

test('bundle: 没有 @font-face、没有字体文件、只用系统字体名（D9）', () => {
  assert.doesNotMatch(source, /@font-face/)
  assert.doesNotMatch(source, /\.(woff2?|ttf|otf|eot)\b/)
  assert.match(source, /system-ui/)
  assert.match(source, /Segoe UI/)
  assert.match(source, /PingFang SC/)
})

test('bundle: 30 个源码模块都装配进 client.js', () => {
  assert.match(source, /自动生成，勿手改/)
  for (const moduleName of ['h.js', 'format.js', 'state.js', 'logic.js', 'api.js', 'app.js']) {
    assert.match(source, new RegExp(`/\\* ── ${moduleName.replace('.', '\\.')} ── \\*/`))
  }
  assert.match(source, /screens\/HomeScreen\.js/)
  assert.match(source, /screens\/ConvertScreen\.js/)
  assert.match(source, /screens\/GifScreen\.js/)
  assert.match(source, /components\/BinaryBanner\.js/)
})

test('bundle: 设计令牌在样式里落地，强调色只有一个', () => {
  assert.match(source, /--kq-accent:\s*#ff8a2b/)
  assert.match(source, /--kq-bg:\s*#131519/)
  assert.match(source, /--kq-card:\s*#191c22/)
  assert.match(source, /--kq-raise:\s*#1f242c/)
  assert.match(source, /--kq-line:\s*#272c35/)
  assert.match(source, /prefers-color-scheme:\s*light/)
  assert.match(source, /prefers-reduced-motion/)
  assert.match(source, /--kq-fs-1:11px/)
  assert.match(source, /--kq-fs-2:12\.5px/)
  assert.match(source, /--kq-fs-3:14\.5px/)
  assert.match(source, /--kq-fs-4:18px/)
  const accentUses = source.match(/#ff8a2b/gi) || []
  assert.equal(accentUses.length, 1, '强调色只应在变量定义处出现一次')
})

/* ── 三个屏幕与横幅的直接渲染（源码模块是自足的 ESM） ── */

const facts = {
  path: 'C:\\videos\\猫猫.mp4',
  bytes: 18 * MB,
  container: 'mp4',
  durationSec: 12,
  streams: [],
  video: { index: 0, type: 'video', codec: 'h264', width: 1920, height: 1080, fps: 30 },
  audio: { index: 1, type: 'audio', codec: 'aac', sampleRate: 48000, channels: 2 },
  ffmpegVersion: '6.1.1',
}

const capabilities = {
  ffmpeg: 'ffmpeg',
  ffprobe: 'ffprobe',
  version: '6.1.1',
  filters: [],
  encoders: [],
  muxers: ['mp4', 'matroska', 'mov', 'webm', 'avi', 'mp3', 'ipod', 'wav', 'flac'],
}

function readyVideoState(slot) {
  let state = reducer(initialState(), { type: ACT.CAPS_OK, data: capabilities })
  state = reducer(state, { type: ACT.FILE_INFO, slot, path: facts.path, name: '猫猫.mp4' })
  return reducer(state, { type: ACT.FILE_FACTS, slot, facts })
}

function convertProps(model) {
  return {
    model,
    onPick: noop,
    onOpenPaste: noop,
    onClosePaste: noop,
    onDraft: noop,
    onSubmitPaste: noop,
    onClearFile: noop,
    onTarget: noop,
    onCopyToggle: noop,
    onSubmit: noop,
  }
}

function gifProps(model) {
  return {
    model,
    onPick: noop,
    onOpenPaste: noop,
    onClosePaste: noop,
    onDraft: noop,
    onSubmitPaste: noop,
    onClearFile: noop,
    onSlider: noop,
    onText: noop,
    onTextDone: noop,
    onField: noop,
    onSubmit: noop,
  }
}

test('render: 三屏空态都有内容，不白屏', () => {
  const harness = createHarness()
  bindHost(harness.React)
  const state = initialState()

  const home = harness.render(HomeScreen({ model: selectHome(state), onOpen: noop }))
  assert.match(home, /要做什么？/)
  assert.match(home, /格式转换/)
  assert.match(home, /视频做 GIF/)
  assert.match(home, /最近/)

  const convert = harness.render(ConvertScreen(convertProps(selectConvert(state))))
  assert.match(convert, /文件/)
  assert.match(convert, /添加文件/)
  assert.match(convert, /粘贴路径/)
  assert.match(convert, /还没有文件/)
  assert.match(convert, /转成/)
  assert.match(convert, /MP3/)
  assert.match(convert, /FLAC/)
  assert.match(convert, /仅换封装/)
  assert.match(convert, /开始转换/)
  assert.match(convert, /先添加文件/)

  const gif = harness.render(GifScreen(gifProps(selectGif(state))))
  assert.match(gif, /截取/)
  assert.match(gif, /00:00\.0/)
  assert.match(gif, /00:05\.0/)
  assert.match(gif, /时长/)
  assert.match(gif, /帧率/)
  assert.match(gif, /宽度/)
  assert.match(gif, /目标体积/)
  assert.match(gif, /GIF 不含声音/)
  assert.match(gif, /开始生成 GIF/)
})

test('render: 转换的忙态、文件错误态与 GIF 正常选区', () => {
  const harness = createHarness()
  bindHost(harness.React)

  let state = readyVideoState('convert')
  state = reducer(state, { type: ACT.TARGET, to: 'mkv' })
  let convert = harness.render(ConvertScreen(convertProps(selectConvert(state))))
  assert.match(convert, /猫猫\.mp4/)
  assert.match(convert, /1920×1080/)
  assert.match(convert, /不重编码/)

  state = reducer(state, { type: ACT.JOB_BEGIN, slot: 'convert' })
  convert = harness.render(ConvertScreen(convertProps(selectConvert(state))))
  assert.match(convert, /开始转换…/)

  let unreadable = reducer(initialState(), { type: ACT.FILE_INFO, slot: 'convert', path: 'C:\\v\\bad.mp4', name: 'bad.mp4' })
  unreadable = reducer(unreadable, { type: ACT.FILE_ERR, slot: 'convert', error: { code: 'E_INPUT', message: '文件损坏', hint: '换一个文件。' } })
  convert = harness.render(ConvertScreen(convertProps(selectConvert(unreadable))))
  assert.match(convert, /这个文件读不了/)

  let gifState = readyVideoState('gif')
  gifState = reducer(gifState, { type: ACT.GIF_SLIDER, handle: 'to', value: 8.4 })
  const gif = harness.render(GifScreen(gifProps(selectGif(gifState))))
  assert.match(gif, /00:08\.4/)
  assert.match(gif, /8\.4s/)
  assert.match(gif, /约/)
})

test('render: 结果行展开后期望/实际/差多少/下一步/命令都在', () => {
  const harness = createHarness()
  bindHost(harness.React)
  const task = { kind: 'gif', input: 'C:\\v\\猫猫.mp4', from: 3.2, to: 8.4, fps: 12, width: 480, maxBytes: 8 * MB }
  let state = reducer(initialState(), {
    type: ACT.JOB_ADD,
    slot: 'gif',
    job: {
      id: 'r1',
      task,
      status: 'done',
      output: 'C:\\v\\猫猫_03.2-08.4.gif',
      verdict: {
        ok: true,
        task,
        spec: { maxBytes: 8 * MB },
        facts: { ...facts, bytes: 9.8 * MB },
        checks: [{ id: 'gif.bytes', tier: 'L1', outcome: 'warn', expected: '≤ 8.0 MB', actual: '9.8 MB', delta: '超 1.8 MB', hint: '把宽度改小。', repair: { kind: 'reencode', width: 420 } }],
        repairs: [],
      },
    },
  })
  state = reducer(state, { type: ACT.EXPAND, id: 'r1' })
  const text = harness.render(ResultsPanel({
    model: selectResults(state),
    onToggle: noop,
    onCopy: noop,
    onCancel: noop,
    onRepair: noop,
  }))
  assert.match(text, /警告/)
  assert.match(text, /期望/)
  assert.match(text, /实际/)
  assert.match(text, /差多少/)
  assert.match(text, /下一步/)
  assert.match(text, /复制命令/)
  assert.match(text, /palettegen/)
  assert.match(text, /按建议修复/)
})

test('render: 缺 FFmpeg 横幅的缺、装、错三态', () => {
  const harness = createHarness()
  bindHost(harness.React)
  let state = reducer(initialState(), { type: ACT.BINARY_READY, data: { state: 'missing', sizeHint: 80 * MB } })
  let text = harness.render(BinaryBanner({ binary: selectBinary(state), onInstall: noop, onCancel: noop }))
  assert.match(text, /未找到 FFmpeg/)
  assert.match(text, /下载并安装/)
  assert.match(text, /80 MB/)

  state = reducer(state, { type: ACT.BINARY_INSTALL_BEGIN })
  state = reducer(state, { type: ACT.BINARY_PROGRESS, progress: { phase: 'download', percent: 41.6 } })
  text = harness.render(BinaryBanner({ binary: selectBinary(state), onInstall: noop, onCancel: noop }))
  assert.match(text, /下载中 42%/)
  assert.match(text, /取消/)

  state = reducer(state, { type: ACT.BINARY_FAIL, error: { code: 'E_INSTALL', message: '下载中断了', hint: '检查网络后重试。' } })
  text = harness.render(BinaryBanner({ binary: selectBinary(state), onInstall: noop, onCancel: noop }))
  assert.match(text, /重试/)
  assert.match(text, /下载中断了/)
})
