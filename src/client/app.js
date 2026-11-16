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
import { requestPath } from './picker.js'
import { copyText } from './clipboard.js'
import { BalanceLine } from './components/BalanceLine.js'
import { BinaryBanner } from './components/BinaryBanner.js'
import { OfflineNote } from './components/OfflineNote.js'
import { ScreenHeader } from './screens/ScreenHeader.js'
import { HomeScreen } from './screens/HomeScreen.js'
import { ConvertScreen } from './screens/ConvertScreen.js'
import { GifScreen } from './screens/GifScreen.js'
import { ResultsPanel } from './screens/ResultsPanel.js'
export function createPanel(React) {
  /**
   * @param {{ api?: any, pickFile?: Function, hostCtx?: any }} props
   */
  function KumquatPanel(props) {
    const api = props.api || createUnavailableApi()
    const pickFile = props.pickFile
    const [, force] = React.useState(0)
    const [refreshKey, setRefreshKey] = React.useState(0)
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
    const goHome = () => dispatch({ type: ACT.SCREEN, screen: 'home' })
    const openScreen = (screen) => dispatch({ type: ACT.SCREEN, screen })
    const retry = () => setRefreshKey((value) => value + 1)

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
      // No host-side picker in this deployment: open the path field directly
      // instead of leaving the button looking dead.
      if (typeof pickFile !== 'function') {
        dispatch({ type: ACT.PASTE_OPEN, slot, open: true })
        dispatch({ type: ACT.NOTICE, notice: '宿主未提供文件选择器，请在下方粘贴绝对路径。' })
        return
      }
      dispatch({ type: ACT.FILE_BEGIN, slot })
      const result = await requestPath(pickFile)
      if (result.ok === true) {
        loadFile(slot, result.path, result.name)
        return
      }
      dispatch({ type: ACT.FILE_PICK_ERR, slot, error: result.error })
      if (result.error.code === 'E_NO_PICKER' || result.error.code === 'E_PICKER') dispatch({ type: ACT.PASTE_OPEN, slot, open: true })
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
      const result = await api.run(validation.task)
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
      const result = await api.run(nextTask)
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

    return h('section', {
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
      state.screen === 'convert'
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
        })
        : null,
      state.screen !== 'home'
        ? h(ResultsPanel, { model: results, onToggle: (id) => dispatch({ type: ACT.EXPAND, id }), onCopy: copy, onCancel: cancelJob, onRepair: repair })
        : null,
      state.notice ? h('p', { className: 'kq-hint', role: 'status' }, state.notice) : null),
    h('div', { className: 'kq-foot' },
      h(BalanceLine, { text: balance.text, tone: balance.tone }),
      h('p', { className: 'kq-foot__note' }, '文件以本机路径登记，不上传、不复制；每次任务自动验收并留证据。')))
  }

  return KumquatPanel
}
