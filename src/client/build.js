#!/usr/bin/env node
/**
 * Kumquat · 把 src/client 下的 ESM 源码装配成宿主能吃的 client.js。
 *
 * 为什么需要这一步：DSH 的浏览器半身只认「单文件 lazy-CJS bundle」——
 * window.__ModuleLoader__.load({ id, factory })，require 只能命中平台种子
 * （react）与已注册的包；相对路径、ESM import 都不会被解析。所以源码保持
 * 可单测的 ESM 拆分，client.js 由这个零依赖脚本机械合成：
 *
 *   1. 按 MODULES 顺序读文件；
 *   2. 去掉 `import ... from './x.js'` 行（同一作用域里名字已经存在）；
 *   3. 去掉行首 `export `（bundle 内部不再需要模块边界）；
 *   4. 检查重名声明、未提供的导入名、残留的 import/export/require；
 *   5. 拼进 loader 工厂，写回 package.json exports["./client"] 指的文件；
 *   6. 用 node:vm 解析一遍，语法错误立即可见。
 *
 * 用法：node src/client/build.js [--check]
 *   --check 只校验，不写盘（交付/CI 用）。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(here, '..', '..')
const outputPath = join(projectRoot, 'client.js')

/** 装配顺序即执行顺序；函数声明会提升，const 按此顺序初始化。 */
const MODULES = [
  'h.js',
  'format.js',
  'state.js',
  'logic.js',
  'api.js',
  'clipboard.js',
  'picker.js',
  'pickfile.js',
  'styles.js',
  'components/Icon.js',
  'components/Badge.js',
  'components/Button.js',
  'components/Section.js',
  'components/TaskCard.js',
  'components/FileStrip.js',
  'components/FileDialog.js',
  'components/OutputPicker.js',
  'components/TrimFields.js',
  'components/KumquatMark.js',
  'components/FormatPill.js',
  'components/CopyToggle.js',
  'components/TimelineRange.js',
  'components/GifFields.js',
  'components/CommandBlock.js',
  'components/ResultRow.js',
  'components/BalanceLine.js',
  'components/RecentLine.js',
  'components/BinaryBanner.js',
  'components/OfflineNote.js',
  'screens/ScreenHeader.js',
  'screens/HomeScreen.js',
  'screens/ConvertScreen.js',
  'screens/GifScreen.js',
  'screens/ResultsPanel.js',
  'app.js',
]

const IMPORT_LINE = /^import\s+\{([^}]*)\}\s+from\s+'(\.[^']+)'\s*;?\s*$/
const BANNED = [
  { pattern: /^export\s+default\b/m, reason: '不支持 export default' },
  { pattern: /^export\s*\{/m, reason: '不支持 export { } 聚合' },
  { pattern: /^export\s*\*/m, reason: '不支持 export *' },
  { pattern: /\bimport\s*\(/m, reason: '不支持动态 import()' },
  { pattern: /\brequire\s*\(/m, reason: '模块里不能 require；需要宿主模块就写在客户端工厂里' },
]

/**
 * @param {string} source
 * @param {string} file
 */
function transform(source, file) {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n')
  const imports = []
  const output = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^import\b/.test(line)) {
      let statement = line
      let cursor = index
      while (!/from\s+'/.test(statement)) {
        cursor += 1
        if (cursor >= lines.length) throw new Error(`${file}: import 语句没有结束: ${line}`)
        statement += ` ${lines[cursor].trim()}`
      }
      const match = IMPORT_LINE.exec(statement.replace(/\s+/g, ' '))
      if (match === null) throw new Error(`${file}: 只允许单行具名相对导入，实际是: ${statement}`)
      imports.push({
        names: match[1].split(',').map((name) => name.trim()).filter(Boolean),
        from: match[2],
      })
      index = cursor
      continue
    }
    if (/^export\b/.test(line)) {
      if (!/^export\s+(?:async\s+)?function\s+[A-Za-z_$]/.test(line) && !/^export\s+(?:const|let|var|class)\s+[A-Za-z_$]/.test(line)) {
        throw new Error(`${file}: 只允许行首 export function/const/let/class，实际是: ${line}`)
      }
      output.push(line.replace(/^export\s+/, ''))
      continue
    }
    output.push(line)
  }
  const body = output.join('\n')
  for (const rule of BANNED) {
    if (rule.pattern.test(body)) throw new Error(`${file}: ${rule.reason}`)
  }
  return { body, imports }
}

/**
 * @param {string} body
 */
function declaredNames(body) {
  const names = new Set()
  const pattern = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm
  let match = pattern.exec(body)
  while (match !== null) {
    names.add(match[1] || match[2])
    match = pattern.exec(body)
  }
  return names
}

function main() {
  const checkOnly = process.argv.includes('--check')
  const exported = new Map()
  const declared = new Map()
  const parsed = []

  for (const relativePath of MODULES) {
    const absolute = join(here, relativePath)
    const source = readFileSync(absolute, 'utf8')
    const { body, imports } = transform(source, relativePath)
    const names = new Set()
    const exportPattern = /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm
    let match = exportPattern.exec(source)
    while (match !== null) {
      names.add(match[1] || match[2])
      match = exportPattern.exec(source)
    }
    if (names.size === 0) throw new Error(`${relativePath}: 没有任何导出，装配后不可用`)
    for (const name of names) {
      if (exported.has(name)) throw new Error(`导出重名: ${name}（${exported.get(name)} 与 ${relativePath}）`)
      exported.set(name, relativePath)
    }
    for (const name of declaredNames(body)) {
      if (declared.has(name)) throw new Error(`顶层声明重名: ${name}（${declared.get(name)} 与 ${relativePath}）`)
      declared.set(name, relativePath)
    }
    parsed.push({ relativePath, body, imports })
  }

  for (const module of parsed) {
    for (const statement of module.imports) {
      for (const name of statement.names) {
        if (!exported.has(name)) {
          throw new Error(`${module.relativePath}: 导入了 ${name}，但没有任何模块导出它（来自 ${statement.from}）`)
        }
      }
    }
  }

  const banner = [
    '/*',
    ' * Kumquat · client bundle（自动生成，勿手改）',
    ' * 源文件：src/client/**（ESM，可单测）；装配脚本：src/client/build.js',
    ' * 重新生成：node src/client/build.js',
    ' */',
  ].join('\n')

  const body = parsed.map((module) => `/* ── ${module.relativePath} ── */\n${module.body}`).join('\n\n')
  let source = `${banner}
window.__ModuleLoader__.load({
  id: 'dsh-kumquat',
  factory(require) {
    'use strict'
    const React = require('react')

${body}

    bindHost(React)
    const Panel = createPanel(React)

    return {
      inject: ['slots'],
      // Exposed for tests and for hosts that want to mount the panel directly.
      panel: Panel,
      apply(ctx) {
        const installStyle = () => {
          if (typeof document === 'undefined') return () => {}
          const style = document.createElement('style')
          style.setAttribute('data-plugin', 'dsh-kumquat')
          style.textContent = CSS_TEXT
          document.head.append(style)
          return () => { style.remove() }
        }
        let hasEffect = false
        try {
          hasEffect = typeof ctx.effect === 'function'
        } catch (error) {
          hasEffect = false
        }
        if (hasEffect) ctx.effect(installStyle)
        else installStyle()
        if (!ctx.slots || typeof ctx.slots.inject !== 'function') {
          if (typeof console !== 'undefined') console.warn('kumquat: 客户端的 slots 服务不可用，面板未挂载')
          return
        }
        const api = createApi(ctx)
        let pickFile
        try {
          if (typeof ctx.pickFile === 'function') pickFile = ctx.pickFile.bind(ctx)
        } catch (error) {
          pickFile = undefined
        }
        const Launcher = () => {
          const wrapRef = React.useRef(null)
          const open = () => {
            try {
              window.dispatchEvent(new CustomEvent('kumquat:open'))
              const layout = typeof ctx.get === 'function' ? ctx.get('layout') : undefined
              if (layout && typeof layout.selectPanel === 'function') layout.selectPanel('kumquat')
            } catch (error) { /* ignore */ }
          }
          // The host row may swallow the click before it reaches this button.
          // Listen in the capture phase on the row itself so a click anywhere on
          // the row (icon, label, padding) still reopens the panel.
          React.useEffect(() => {
            const el = wrapRef.current
            if (!el) return undefined
            const handler = () => open()
            const nodes = []
            let node = el.parentElement
            for (let i = 0; i < 2 && node; i += 1) {
              if (i === 1 && node.children.length > 4) break
              node.addEventListener('click', handler, true)
              nodes.push(node)
              node = node.parentElement
            }
            return () => { for (const n of nodes) n.removeEventListener('click', handler, true) }
          }, [])
          return h('span', { className: 'kq-launchwrap', ref: wrapRef },
            h('button', {
              className: 'kq-launch',
              type: 'button',
              title: '金桔',
              'aria-label': '打开金桔面板',
              'aria-haspopup': 'dialog',
              onClick: open,
            },
            h('svg', {
              width: 18, height: 18, viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false',
            },
            h('circle', { cx: 16, cy: 19, r: 10, fill: '#ff9a2e' }),
            h('ellipse', { cx: 12.5, cy: 15, rx: 3, ry: 2, fill: '#ffd08a', opacity: 0.75 }),
            h('path', { d: 'M16 9c1.6-4.2 5.2-6.2 9.4-5.2-1.2 4.2-4.4 6.6-9.4 5.2z', fill: '#2fbf82' }),
            h('path', { d: 'M16 9c-2.6-3-6-3.6-8.6-2.2 1.6 3 4.8 4.2 8.6 2.2z', fill: '#3ddc97' }),
            h('path', { d: 'M16 9V5.5', stroke: '#8a5a2b', strokeWidth: 2, strokeLinecap: 'round' })),
            h('span', { className: 'kq-launch__text' }, '金桔')))
        }        // The layout switches panels by id: a same-key 'main' registration is
        // required, even though the overlay is what users actually see.
        const layoutService = (() => { try { return typeof ctx.get === 'function' ? ctx.get('layout') : undefined } catch { return undefined } })()
        const Bound = (slotProps) => h(Panel, Object.assign({}, slotProps, { api, pickFile, layout: layoutService }))
        const register = (name, options, component) => {
          try {
            ctx.slots.inject(name, () => ctx.slots.register(Object.assign({ name }, options), component))
          } catch (error) {
            if (typeof console !== 'undefined') console.warn('kumquat: 无法注册 ' + name, error)
          }
        }
        register('main', { key: 'kumquat' }, Bound)
        // The overlay opens from the sidebar row and from the composer dock, so
        // the panel does not depend on a skin's main-area layout.
        register('sidebar.panellist', { id: 'kumquat', order: 40, label: () => '' }, Launcher)
        register('conversation.composer.dock', { id: 'kumquat', order: 5 }, Launcher)
      },
    }
  },
})
`

  for (const name of ['bindHost', 'createPanel', 'createApi', 'CSS_TEXT', 'h']) {
    if (!declared.has(name)) throw new Error(`装配结果缺少 ${name}；检查 MODULES 顺序`)
  }
  const pkgVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
  source = source.split('__KQ_VERSION__').join(pkgVersion)
  new vm.Script(source, { filename: 'client.js' })

  if (checkOnly) {
    const current = readFileSync(outputPath, 'utf8')
    if (current !== source) {
      console.error('client.js 与源码不一致：请运行 node src/client/build.js')
      process.exitCode = 1
      return
    }
    console.log(`client.js 已同步（${parsed.length} 个模块，${source.length} 字节）`)
    return
  }
  writeFileSync(outputPath, source, 'utf8')
  console.log(`client.js 已生成：${parsed.length} 个模块，${source.length} 字节，${relative(projectRoot, outputPath)}`)
}

main()







