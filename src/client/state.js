/**
 * Kumquat · 界面状态形状、动作名、极简 store。
 *
 * 这里只放「状态长什么样」和「怎么通知订阅者」；状态怎么变（reducer）
 * 与怎么读（selector）在 logic.js。没有 DOM，可直接在 node:test 里跑。
 */

import { GIF_DEFAULTS } from './format.js'

/** 所有动作类型。界面只发这些字符串，reducer 只认这些字符串。 */
export const ACT = Object.freeze({
  SCREEN: 'screen',
  CAPS_LOAD: 'caps/load',
  CAPS_OK: 'caps/ok',
  CAPS_ERR: 'caps/err',
  BALANCE_LOAD: 'balance/load',
  BALANCE_OK: 'balance/ok',
  BALANCE_ERR: 'balance/err',
  FILE_BEGIN: 'file/begin',
  FILE_INFO: 'file/info',
  FILE_FACTS: 'file/facts',
  FILE_ERR: 'file/err',
  FILE_PICK_ERR: 'file/pick-error',
  FILE_CLEAR: 'file/clear',
  PASTE_OPEN: 'file/paste-open',
  PASTE_DRAFT: 'file/paste-draft',
  PASTE_ERR: 'file/paste-error',
  TARGET: 'convert/target',
  COPY: 'convert/copy',
  TRIM_TOGGLE: 'convert/trim-toggle',
  TRIM_TEXT: 'convert/trim-text',
  BATCH_SET: 'convert/batch',
  GIF_SLIDER: 'gif/slider',
  GIF_TEXT: 'gif/text',
  GIF_TEXT_DONE: 'gif/text-done',
  GIF_FIELD: 'gif/field',
  JOB_BEGIN: 'job/begin',
  JOB_ERR: 'job/error',
  JOB_ADD: 'job/add',
  JOB_UPDATE: 'job/update',
  EXPAND: 'job/expand',
  COPIED: 'ui/copied',
  NOTICE: 'ui/notice',
  BINARY_LOAD: 'binary/load',
  BINARY_READY: 'binary/ready',
  BINARY_ERR: 'binary/error',
  BINARY_INSTALL_BEGIN: 'binary/install-begin',
  BINARY_PROGRESS: 'binary/progress',
  BINARY_DONE: 'binary/done',
  BINARY_FAIL: 'binary/fail',
  BINARY_CANCEL: 'binary/cancel',
  PENDING_SUBMIT: 'job/pending-submit',
})

/**
 * 新建一个文件条目（还没有 facts，也没开始探测）。
 * @param {string} path 绝对路径
 * @param {string} name 展示名
 */
export function fileEntry(path, name) {
  return Object.freeze({
    path,
    name,
    facts: null,
    factsStatus: 'idle',
    error: null,
  })
}

/**
 * 一份新的界面状态。所有屏幕共享同一份，切屏不丢表单。
 */
export function initialState() {
  return {
    screen: 'home',
    caps: { status: 'idle', data: null, error: null },
    balance: { status: 'idle', data: null, error: null },
    binary: {
      status: 'idle',
      state: null,
      version: null,
      sizeHint: null,
      installing: false,
      progress: null,
      error: null,
      cancelled: false,
    },
    convert: {
      file: null,
      picking: false,
      pickError: null,
      paste: { open: false, draft: '', error: null },
      to: null,
      copy: true,
      trim: { enabled: false, fromText: '00:00.0', toText: '' },
      batch: [],
      busy: false,
      error: null,
    },
    gif: {
      file: null,
      picking: false,
      pickError: null,
      paste: { open: false, draft: '', error: null },
      from: 0,
      to: GIF_DEFAULTS.spanSec,
      fromText: '00:00.0',
      toText: '00:05.0',
      fps: GIF_DEFAULTS.fps,
      width: GIF_DEFAULTS.width,
      maxMB: GIF_DEFAULTS.maxMB,
      busy: false,
      error: null,
      textError: null,
    },
    jobs: { status: 'idle', items: [], error: null, expanded: {} },
    pendingSubmit: null,
    copied: null,
    notice: null,
  }
}

/**
 * 一个同步 store：dispatch 归约、引用不变就不通知。
 * @template S
 * @param {(state: S, action: any) => S} reducer
 * @param {S} initial
 */
export function createStore(reducer, initial) {
  let state = initial
  /** @type {Set<(state: S) => void>} */
  const listeners = new Set()
  return {
    getState() {
      return state
    },
    dispatch(action) {
      const next = reducer(state, action)
      if (next === state) return state
      state = next
      for (const listener of Array.from(listeners)) listener(state)
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
