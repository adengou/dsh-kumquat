/**
 * Kumquat · 面板根组件与副作用编排。
 *
 * 组件只画逻辑层给的视图模型；选文件、探测、提交、轮询、取消、修复、复制、
 * 装 FFmpeg 这些副作用都收在这里。没有弹窗，没有第四个屏幕。
 *
 * @param {{ useState: Function, useEffect: Function, useRef: Function }} React
 */

import { h } from './h.js'
import { ACT, createStore, initialState } from './state.js'
import { activeJobIds, applyRepair, parsePathInput, selectBalance, selectBinary, selectCaps, selectConvert, selectGif, selectHeader, selectHome, selectResults, validateConvert, validateGif } from './logic.js'
import { createUnavailableApi } from './api.js'
import { copyText } from './clipboard.js'
import { BalanceLine } from './components/BalanceLine.js'
import { BinaryBanner } from './components/BinaryBanner.js'
import { OfflineNote } from './components/OfflineNote.js'
import { ScreenHeader } from './screens/ScreenHeader.js'
import { HomeScreen } from './screens/HomeScreen.js'
import { ConvertScreen } from './screens/ConvertScreen.js'
import { GifScreen } from './screens/GifScreen.js'
import { ResultsPanel } from './screens/ResultsPanel.js'
import { FileDialog } from './components/FileDialog.js'
import { chooseLocalFile, uploadFile } from './pickfile.js'
const KQ_VERSION = '__KQ_VERSION__'
const FLOAT_KEY = 'kumquat.float.v1'

function readFloatLayout() {
  try {
    const raw = window.localStorage.getItem(FLOAT_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data && Number.isFinite(data.x) && Number.isFinite(data.y) && Number.isFinite(data.w) && Number.isFinite(data.h)) return data
    }
  } catch {
    /* ignore */
  }
  return { x: 0, y: 0, w: 720, h: 0 }
}

function clampFloatLayout(input) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const w = Math.min(Math.max(420, Number(input.w) || 720), Math.max(420, vw - 24))
  const h = Math.min(Math.max(360, Number(input.h) || Math.round(vh * 0.82)), Math.max(360, vh - 24))
  const x = Math.min(Math.max(8, Number(input.x) || Math.round((vw - w) / 2)), Math.max(8, vw - w - 8))
  const y = Math.min(Math.max(8, Number(input.y) || 56), Math.max(8, vh - 120))
  return { x, y, w, h }
}

function persistFloatLayout(next) {
  try {
    window.localStorage.setItem(FLOAT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** @param {any} React */
export function createPanel(React) {
  /**
   * @param {{ api?: any, pickFile?: Function, hostCtx?: any }} props
   */
  function KumquatPanel(props) {
    const api = props.api || createUnavailableApi()
    const pickFile = props.pickFile
    const [, force] = React.useState(0)
    const [refreshKey, setRefreshKey] = React.useState(0)
    const [dialogSlot, setDialogSlot] = React.useState(null)
    const [dirDialog, setDirDialog] = React.useState(false)
    const [minimized, setMinimized] = React.useState(false)
    const [outputDir, setOutputDirState] = React.useState(() => {
      try { return window.localStorage.getItem('kumquat.outputDir') || '' } catch { return '' }
    })
    const [outputPath, setOutputPathState] = React.useState(() => {
      try { return window.localStorage.getItem('kumquat.outputPath') || '' } catch { return '' }
    })
    const [floatLayout, setFloatLayout] = React.useState(() => clampFloatLayout(readFloatLayout()))
    const floatLayoutRef = React.useRef(floatLayout)
    const floatRef = React.useRef(null)
    const dragRef = React.useRef(null)
    React.useEffect(() => { floatLayoutRef.current = floatLayout }, [floatLayout])
    React.useEffect(() => {
      const el = floatRef.current
      if (!el || typeof ResizeObserver !== 'function') return undefined
      const observer = new ResizeObserver(() => {
        const rect = el.getBoundingClientRect()
        const next = clampFloatLayout({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })
        floatLayoutRef.current = next
        persistFloatLayout(next)
        setFloatLayout(next)
      })
      observer.observe(el)
      return () => observer.disconnect()
    }, [])
    const startDrag = (event) => {
      if (event.button !== 0) return
      const el = floatRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
      if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId)
    }
    const moveDrag = (event) => {
      const drag = dragRef.current
      const el = floatRef.current
      if (!drag || !el) return
      const rect = el.getBoundingClientRect()
      const next = clampFloatLayout({ x: event.clientX - drag.dx, y: event.clientY - drag.dy, w: rect.width, h: rect.height })
      floatLayoutRef.current = next
      setFloatLayout(next)
    }
    const endDrag = (event) => {
      if (!dragRef.current) return
      dragRef.current = null
      if (event && event.currentTarget && event.currentTarget.releasePointerCapture) {
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* ignore */ }
      }
      persistFloatLayout(floatLayoutRef.current)
    }
    const storeRef = React.useRef(null)
    const abortRef = React.useRef(null)
    if (storeRef.current === null) storeRef.current = createStore(reducer, initialState())
    const store = storeRef.current
    const state = store.getState()

    React.useEffect(() => store.subscribe(() => force((value) => value + 1)), [store])

    React.useEffect(() => {
      let alive = true
      store.dispatch({ type: ACT.CAPS_LOAD })
      store.dispatch({ type: ACT.BALANCE_LOAD })
      store.dispatch({ type: ACT.BINARY_LOAD })
      api.capabilities().then((result) => {
        if (!alive) return
        store.dispatch(result.ok ? { type: ACT.CAPS_OK, data: result.data } : { type: ACT.CAPS_ERR, error: result.error })
      })
      api.balance().then((result) => {
        if (!alive) return
        store.dispatch(result.ok ? { type: ACT.BALANCE_OK, data: result.data } : { type: ACT.BALANCE_ERR, error: result.error })
      })
      api.binaryStatus().then((result) => {
        if (!alive) return
        store.dispatch(result.ok ? { type: ACT.BINARY_READY, data: result.data } : { type: ACT.BINARY_ERR, error: result.error })
      })
      return () => {
        alive = false
      }
    }, [api, store, refreshKey])

    const activeKey = activeJobIds(state).join(',')
    React.useEffect(() => {
      if (activeKey === '') return undefined
      const ids = new Set(activeKey.split(','))
      let stopped = false
      const tick = async () => {
        // 列表路由带每行的 progress；宿主没提供时退回逐个查 detail。
        if (typeof api.jobs === 'function') {
          const list = await api.jobs()
          if (stopped) return
          if (list.ok === true) {
            for (const job of list.data) {
              if (job && ids.has(job.id)) store.dispatch({ type: ACT.JOB_UPDATE, job })
            }
            return
          }
        }
        for (const id of ids) {
          const result = await api.job(id)
          if (stopped || !result.ok) continue
          store.dispatch({ type: ACT.JOB_UPDATE, job: result.data })
        }
      }
      void tick()
      const interval = setInterval(tick, 800)
      return () => {
        stopped = true
        clearInterval(interval)
      }
    }, [activeKey, api, store])

    const dispatch = store.dispatch
    const chooseOutputDir = async () => {
      const st = store.getState()
      const slot = st.screen === 'gif' ? 'gif' : 'convert'
      const file = st[slot] && st[slot].file ? st[slot].file : null
      const stem = file && typeof file.name === 'string' ? file.name.replace(/\.[^.]+$/, '') : 'Kumquat'
      const ext = st.screen === 'gif' ? '.gif' : '.' + ((st.convert && st.convert.to) || 'mp4')
      if (typeof api.pick === 'function') {
        const result = await api.pick('save', stem + ext)
        if (result.ok && result.data && typeof result.data.path === 'string') {
          setOutputPathState(result.data.path)
          try { window.localStorage.setItem('kumquat.outputPath', result.data.path) } catch { /* ignore */ }
          return
        }
        if (result.ok && result.data && result.data.canceled === true) return
      }
      setDirDialog(true)
    }

    const setOutputDir = (dir) => {
      setOutputDirState(dir)
      setOutputPathState('')
      try { window.localStorage.removeItem('kumquat.outputPath') } catch { /* ignore */ }
      try { window.localStorage.setItem('kumquat.outputDir', dir) } catch { /* ignore */ }
      setDirDialog(false)
    }

    const goHome = () => dispatch({ type: ACT.SCREEN, screen: 'home' })
    const openScreen = (screen) => dispatch({ type: ACT.SCREEN, screen })
    const retry = () => setRefreshKey((value) => value + 1)

    const reveal = async (path) => {
      if (typeof api.reveal !== 'function') {
        await copy(path)
        dispatch({ type: ACT.NOTICE, notice: '已复制输出路径，粘贴到资源管理器地址栏即可打开。' })
        return
      }
      const result = await api.reveal(path)
      if (result.ok) return
      await copy(path)
      dispatch({ type: ACT.NOTICE, notice: '已复制输出路径，粘贴到资源管理器地址栏即可打开。' })
    }

    const copy = async (text) => {
      const copied = await copyText(text)
      dispatch({ type: ACT.COPIED, key: copied ? text : null })
      if (!copied) dispatch({ type: ACT.NOTICE, notice: '复制失败：请手动选中命令或路径。' })
    }

    const loadFile = (slot, path, name) => {
      dispatch({ type: ACT.FILE_INFO, slot, path, name })
      api.probe(path).then((result) => {
        if (result.ok) dispatch({ type: ACT.FILE_FACTS, slot, facts: result.data })
        else dispatch({ type: ACT.FILE_ERR, slot, error: result.error })
      })
    }

    const pick = async (slot) => {
      // The hidden file input opens the OS dialog in both clients. Desktop can
      // return a real path; the web client uploads the chosen bytes to the Host.
      const chosen = await chooseLocalFile()
      if (!chosen.ok) return
      if (chosen.path !== '') {
        loadFile(slot, chosen.path, chosen.name)
        return
      }
      dispatch({ type: ACT.NOTICE, notice: '正在把所选文件复制到本机临时目录…' })
      const uploaded = await uploadFile(chosen.file)
      if (uploaded.ok) {
        loadFile(slot, uploaded.path, uploaded.name)
        return
      }
      dispatch({ type: ACT.NOTICE, notice: uploaded.error.message })
      setDialogSlot(slot)
    }

    const submitPaste = (slot) => {
      const slotState = store.getState()[slot]
      const parsed = parsePathInput(slotState.paste.draft)
      if (parsed.ok !== true) {
        dispatch({ type: ACT.PASTE_ERR, slot, error: { code: 'E_INPUT', message: parsed.message, hint: parsed.hint } })
        return
      }
      loadFile(slot, parsed.path, parsed.name)
    }

    const installBinary = async () => {
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      abortRef.current = controller
      dispatch({ type: ACT.BINARY_INSTALL_BEGIN })
      const result = await api.binaryInstall(
        (progress) => dispatch({ type: ACT.BINARY_PROGRESS, progress }),
        controller === null ? {} : { signal: controller.signal },
      )
      abortRef.current = null
      if (result.ok) {
        dispatch({ type: ACT.BINARY_DONE, data: result.data })
        const caps = await api.capabilities()
        dispatch(caps.ok ? { type: ACT.CAPS_OK, data: caps.data } : { type: ACT.CAPS_ERR, error: caps.error })
        const pending = store.getState().pendingSubmit
        if (pending !== null) {
          dispatch({ type: ACT.PENDING_SUBMIT, slot: null })
          submit(pending)
        }
        return
      }
      if (result.error && result.error.code === 'E_CANCELLED') dispatch({ type: ACT.BINARY_CANCEL })
      else dispatch({ type: ACT.BINARY_FAIL, error: result.error })
    }

    const cancelInstall = () => {
      const controller = abortRef.current
      if (controller !== null && typeof controller.abort === 'function') controller.abort()
      abortRef.current = null
      dispatch({ type: ACT.BINARY_CANCEL })
      dispatch({ type: ACT.PENDING_SUBMIT, slot: null })
    }

    const submit = async (slot) => {
      const current = store.getState()
      const validation = slot === 'gif' ? validateGif(current) : validateConvert(current)
      if (validation.ok !== true) {
        if (validation.code === 'E_FFMPEG') {
          dispatch({ type: ACT.PENDING_SUBMIT, slot })
          if (store.getState().binary.installing !== true) installBinary()
          return
        }
        dispatch({ type: ACT.NOTICE, notice: validation.message })
        return
      }
      dispatch({ type: ACT.JOB_BEGIN, slot })
      const result = await api.run(validation.task, { outputDir, outputPath })
      if (result.ok) dispatch({ type: ACT.JOB_ADD, slot, job: result.data, task: validation.task })
      else dispatch({ type: ACT.JOB_ERR, slot, error: result.error })
    }

    const cancelJob = async (id) => {
      const item = store.getState().jobs.items.filter((entry) => entry.id === id)[0]
      const result = await api.cancel(id)
      if (result.ok && item) dispatch({ type: ACT.JOB_UPDATE, job: { ...item, status: 'cancelled' } })
      else if (!result.ok) dispatch({ type: ACT.NOTICE, notice: result.error.message })
    }

    const repair = async (row) => {
      const nextTask = applyRepair(row.task, row.repairAction)
      if (nextTask === null) {
        dispatch({ type: ACT.NOTICE, notice: '这条建议需要手工处理，可以复制命令自己跑。' })
        return
      }
      const slot = nextTask.kind === 'gif' ? 'gif' : 'convert'
      dispatch({ type: ACT.JOB_BEGIN, slot })
      const result = await api.run(nextTask, { outputDir, outputPath })
      if (result.ok) dispatch({ type: ACT.JOB_ADD, slot, job: result.data, task: nextTask })
      else dispatch({ type: ACT.JOB_ERR, slot, error: result.error })
    }

    const header = selectHeader(state)
    const caps = selectCaps(state)
    const binary = selectBinary(state)
    const balance = selectBalance(state)
    const home = selectHome(state)
    const convert = selectConvert(state)
    const gif = selectGif(state)
    const results = selectResults(state)

    if (minimized) {
      return h('button', {
        className: 'kq-float-mini',
        type: 'button',
        title: '打开金桔',
        onClick: () => setMinimized(false),
      }, '金桔')
    }

    return h('div', {
      className: 'kq-float',
      ref: floatRef,
      tabIndex: -1,
      style: {
        left: floatLayout.x + 'px',
        top: floatLayout.y + 'px',
        width: floatLayout.w + 'px',
        height: floatLayout.h + 'px',
      },
    },
    h('div', {
      className: 'kq-float__bar',
      onPointerDown: startDrag,
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    h('span', { className: 'kq-float__grip' }, '\u2807'),
    h('span', { className: 'kq-float__title' }, 'Kumquat 金桔 · v' + KQ_VERSION),
    h('span', { className: 'kq-float__balance' }, balance.visible === false ? null : h(BalanceLine, { text: balance.text, tone: balance.tone })),
    h('span', { className: 'kq-float__hint' }, '按住这里拖动'),
    h('button', { className: 'kq-float__x', type: 'button', 'aria-label': '关闭金桔面板', title: '关闭', onPointerDown: (event) => event.stopPropagation(), onClick: (event) => { event.stopPropagation(); setMinimized(true) } }, '×')),
    h('div', { className: 'kq-float__body' },
    h('section', {
      className: 'kq-panel',
      'aria-label': 'Kumquat 金桔',
      'data-kumquat-root': 'true',
    },
    h(ScreenHeader, { header, onBack: goHome }),
    h('div', { className: 'kq-body' },
      h(BinaryBanner, { binary, onInstall: installBinary, onCancel: cancelInstall }),
      caps.online === false && binary.visible !== true
        ? h(OfflineNote, {
          title: '未连接宿主',
          message: caps.error ? caps.error.message : '宿主没有响应',
          hint: caps.error ? caps.error.hint : '',
          onRetry: retry,
          busy: caps.status === 'loading',
        })
        : null,
      state.screen === 'home' ? h(HomeScreen, { model: home, onOpen: openScreen }) : null,
      (state.screen === 'convert' || state.screen === 'audio')
        ? h(ConvertScreen, {
          model: convert,
          onPick: () => pick('convert'),
          onOpenPaste: () => dispatch({ type: ACT.PASTE_OPEN, slot: 'convert', open: true }),
          onClosePaste: () => dispatch({ type: ACT.PASTE_OPEN, slot: 'convert', open: false }),
          onDraft: (value) => dispatch({ type: ACT.PASTE_DRAFT, slot: 'convert', draft: value }),
          onSubmitPaste: () => submitPaste('convert'),
          onClearFile: () => dispatch({ type: ACT.FILE_CLEAR, slot: 'convert' }),
          onTarget: (to) => dispatch({ type: ACT.TARGET, to }),
          onCopyToggle: (checked) => dispatch({ type: ACT.COPY, copy: checked }),
          onSubmit: () => submit('convert'),
          outputDir,
          outputPath,
          onChooseOutput: chooseOutputDir,
        })
        : null,
      state.screen === 'gif'
        ? h(GifScreen, {
          model: gif,
          onPick: () => pick('gif'),
          onOpenPaste: () => dispatch({ type: ACT.PASTE_OPEN, slot: 'gif', open: true }),
          onClosePaste: () => dispatch({ type: ACT.PASTE_OPEN, slot: 'gif', open: false }),
          onDraft: (value) => dispatch({ type: ACT.PASTE_DRAFT, slot: 'gif', draft: value }),
          onSubmitPaste: () => submitPaste('gif'),
          onClearFile: () => dispatch({ type: ACT.FILE_CLEAR, slot: 'gif' }),
          onSlider: (handle, value) => dispatch({ type: ACT.GIF_SLIDER, handle, value }),
          onText: (handle, text) => dispatch({ type: ACT.GIF_TEXT, handle, text }),
          onTextDone: (handle) => dispatch({ type: ACT.GIF_TEXT_DONE, handle }),
          onField: (field, value) => dispatch({ type: ACT.GIF_FIELD, field, value }),
          onSubmit: () => submit('gif'),
          outputDir,
          outputPath,
          onChooseOutput: chooseOutputDir,
        })
        : null,
      state.screen !== 'home'
        ? h(ResultsPanel, { model: results, onToggle: (id) => dispatch({ type: ACT.EXPAND, id }), onCopy: copy, onCancel: cancelJob, onRepair: repair, onReveal: reveal })
        : null,
      state.notice ? h('p', { className: 'kq-hint', role: 'status' }, state.notice) : null),
    dialogSlot !== null
      ? h(FileDialog, {
        React,
        api,
        slot: dialogSlot,
        onClose: () => setDialogSlot(null),
        onChoose: (path, name) => {
          loadFile(dialogSlot, path, name)
          setDialogSlot(null)
        },
      })
      : null,
    dirDialog
      ? h(FileDialog, {
        React,
        api,
        mode: 'dir',
        slot: 'convert',
        onClose: () => setDirDialog(false),
        onChoose: (path) => setOutputDir(path),
      })
      : null,
    h('div', { className: 'kq-foot' },
      h('p', { className: 'kq-foot__note' }, '文件在本机处理；网页端选择文件会复制到临时目录。每次任务自动验收并留证据。')))))
  }

  return KumquatPanel
}





















