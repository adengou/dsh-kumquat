# Kumquat · 客户端（界面）说明

三个屏幕、一个结果区、一条缺 FFmpeg 横幅。没有第四屏，没有弹窗，没有设置页。
文件只登记本机绝对路径，不上传、不复制。

---

## 一、文件清单

| 文件 | 职责 |
|---|---|
| `../../client.js` | **自动生成**的宿主 bundle：`window.__ModuleLoader__.load({ id: 'dsh-kumquat', factory })`，只做 loader 注册与装配（绑定 React、建 api、注册 `conversation.composer.dock`、注入样式）。勿手改。 |
| `build.js` | 零依赖装配脚本：按顺序读下面的 ESM 源文件，去掉 `import`/`export`，检查重名与残留，拼成 `client.js`，并用 `node:vm` 解析一遍。`node src/client/build.js`（`--check` 只校验）。 |
| `h.js` | 把宿主的 `React.createElement` 绑成全局 `h`，以及 `cx()`。 |
| `format.js` | 九种目标格式表、GIF 默认值、流拷贝编码白名单、muxer 别名、编码可读名。纯数据 + 查表。 |
| `state.js` | `ACT` 动作名、`initialState()`、`createStore()`（同步、引用不变不通知）。 |
| `logic.js` | 纯逻辑：时间/体积格式化、选区换算、`copyAvailability`、`validateConvert/validateGif`、`reducer`、全部 selector（视图模型）、命令拼装、修复建议。 |
| `api.js` | `createApi(ctx)`（capabilities/probe/run/job/jobs/cancel/balance + binaryStatus/binaryInstall）、`createUnavailableApi()`、`createFakeApi()`、`fakeFacts()`。所有方法只 resolve，不 reject。 |
| `picker.js` | 「添加文件」的宿主目录浏览入口；宿主没给 `pickFile` 时给一句「改用粘贴路径」。 |
| `clipboard.js` | 复制文本：`navigator.clipboard` → `textarea + execCommand` → 返回 false。 |
| `styles.js` | 全部 CSS（`CSS_TEXT`）。设计令牌只在这里出现一次；字体只用系统字体名。 |
| `components/Icon.js` | 内联 SVG 图标（currentColor，`aria-hidden`）。 |
| `components/Badge.js` | 状态徽章：圆点 + 描边用状态色，文字用正文色。 |
| `components/Button.js` | `PrimaryButton` / `GhostButton` / `LinkButton`。 |
| `components/Section.js` | 分区标签 + 内容。 |
| `components/TaskCard.js` | 屏幕 1 的任务卡（整卡可点，禁用时写明原因）。 |
| `components/FileStrip.js` | 文件条：两个入口、文件信息、粘贴路径表单、错误行。 |
| `components/FormatPill.js` | 格式胶囊（radiogroup，方向键移动并选中）。 |
| `components/CopyToggle.js` | 「仅换封装」，不可用时置灰并写原因 + 预计耗时。 |
| `components/TimelineRange.js` | 时间轴选区：双滑块 + 手填起止（双向同步）+ 时长。 |
| `components/GifFields.js` | 帧率 / 宽度 / 目标体积，默认 12 / 480 / 8MB。 |
| `components/CommandBlock.js` | 可复制命令块。 |
| `components/ResultRow.js` | 结果行：徽章、进度条、展开后的期望/实际/差多少/下一步/命令。 |
| `components/BalanceLine.js` | 底部余额小字。 |
| `components/RecentLine.js` | 首页「最近」一行。 |
| `components/BinaryBanner.js` | 缺 FFmpeg 横幅：下载并安装 / 进度条 / 取消 / 重试。 |
| `components/OfflineNote.js` | 未连接提示 + 重试。 |
| `screens/ScreenHeader.js` | 顶栏：返回、标识、当前任务名、FFmpeg 状态。 |
| `screens/HomeScreen.js` | 屏幕 1：标题 + 两张任务卡 + 最近。 |
| `screens/ConvertScreen.js` | 屏幕 2A：文件 → 格式 → 仅换封装 → 开始转换。 |
| `screens/GifScreen.js` | 屏幕 2B：文件 → 时间轴选区 → 参数 → 开始生成 GIF。 |
| `screens/ResultsPanel.js` | 屏幕 3：挂在表单下方，队列摘要 + 结果行。 |
| `app.js` | `createPanel(React)`：根组件与所有副作用（探测、提交、轮询、取消、修复、复制、装 FFmpeg）。 |

### 为什么 client.js 是生成的

DSH 浏览器半身只认单文件 lazy-CJS bundle：宿主把 `exports["./client"]` 当经典脚本拼进页面，
工厂里的 `require` 只能命中平台种子（`react`）与已注册的包；相对路径、ESM `import`、动态 `import()`
都不会被解析。所以源码保持可单测的 ESM 拆分（每个组件显式 import 自己用到的兄弟模块，是自足的 ESM），
`client.js` 由 `build.js` 机械合成。改任何 `src/client/**` 后必须重新跑：

```powershell
node src/client/build.js        # 写回 client.js
node src/client/build.js --check  # 交付/CI：不一致就非零退出
```

---

## 二、状态矩阵

「空 / 常 / 忙 / 错」按组件适用的状态列；`—` 表示该组件没有这个状态。

| 组件 | 空 | 常 | 忙 | 错 | 其他 |
|---|---|---|---|---|---|
| 顶栏 / 状态字 | 连接中… | `ffmpeg 6.1.1 · 就绪` | 正在装 FFmpeg | 未连接 / 缺 FFmpeg | 深/浅色两套 |
| 任务卡 ×2 | — | 悬停、按下 | — | — | 禁用（带原因，当前策略不禁用入口） |
| 文件条 | 还没有文件 | 已读取（尺寸 · 时长 · 体积） | 正在读取… | 读不了 / 选文件失败 | 粘贴路径展开、移除文件 |
| 格式胶囊 ×9 | 未选 | 选中、悬停 | — | — | 不可用（置灰 + 原因） |
| 仅换封装 | 未选文件 | 勾选（`N 秒 · 不重编码`） | — | — | 置灰（原因 + 预计耗时） |
| 时间轴选区 | 无文件（禁用） | 双滑块 + 手填同步 | 拖动中 | 手填写错（`aria-invalid`） | 超 60 秒提示、超目标提示 |
| GIF 参数 | 目标体积留空（不限） | 12fps / 480px / 8MB | — | 帧率/宽度/体积越界 | — |
| 主按钮 | 禁用 + 一句「先…」 | 可点 / 悬停 / 按下 | 处理中…（`aria-busy`，禁用） | 提交失败一行错误 | 缺 FFmpeg 时点击先装再续跑 |
| 任务卡入口 | — | — | — | — | — |
| 缺 FFmpeg 横幅 | 隐藏 | 未找到 + 「下载并安装」 | 进度条 + 百分比/阶段 + 取消 | 下载失败 + 「重试」 | 已取消（可重试）、装好自动消失 |
| 未连接提示 | — | — | — | 一条 + 「重试连接」 | 不遮界面 |
| 结果区 | 「还没有结果」 | 一行一个徽章 | 队列摘要 + 每行独立进度条/剩余秒数 | 失败行（不合格 + 错误码） | 展开/收起、已取消 |
| 结果行 | — | 通过 / 警告 / 不合格 / 已取消 | 进行中 + 进度 | 失败 → 不合格 | 展开细目、修复、复制、取消 |
| 命令块 | — | 一行等宽命令 | — | 复制失败提示 | 已复制 |
| 余额 | 读取中… | `余额 ¥12.34` | — | 未连接 / 读取失败 | 未配置 |
| 最近 | 还没有记录 | 最多两条产物 | — | — | — |

三屏都覆盖空态：断网时首页照常渲染两张卡与「最近」；表单显示「未连接宿主」并禁用主按钮；
结果区显示空态文案。没有接口失败导致的白屏路径。

---

## 三、键盘路径

焦点环统一为 `2px` 强调色描边 + `offset 2px`，`prefers-reduced-motion` 下动效为 0。

1. **屏幕 1（选任务）**：`Tab` 依次到两张任务卡（原生 `button`）→ `Enter` / `Space` 进入。
2. **顶栏**：表单屏的第一个焦点是「← 返回」（`aria-label="返回选任务"`）。
3. **屏幕 2A（转换）**：
   `添加文件` → `粘贴路径` →（粘贴表单展开时：绝对路径输入框 → `读取` → `取消`）→
   格式胶囊组 → `仅换封装`（`role="checkbox"`，`Space` 切换）→ `开始转换` →
   结果行标题（`aria-expanded`，`Enter`/`Space` 展开）→ 细目里的按钮。
4. **格式胶囊**：`Tab` 只落在选中项（没有选中时落第一个可用项）；`←/↑` 与 `→/↓` 在可用胶囊间移动并同时选中，
   `Home`/`End` 跳首尾；不可用项由 `disabled` + `aria-disabled` + 原因说明。
5. **屏幕 2B（GIF）**：
   `添加文件` → `粘贴路径` → `起` / `止` 手填框（`Enter` 提交并归一，非法值标 `aria-invalid`）→
   起点滑块 → 终点滑块 → 帧率 → 宽度 → 目标体积 → `开始生成 GIF` → 结果行。
   滑块是原生 `input[type=range]`：方向键 ±0.1 秒，`PageUp/PageDown` 按浏览器默认步进，`Home/End` 到两端；
   两个滑块都带 `aria-label` 与 `aria-valuetext`（`00:03.2`）。
6. **结果区**：结果行标题是 `button`，展开区域是 `role="region"` 并带 `aria-label`；
   细目里有 `复制命令`、`取消任务`、`按建议修复`、`复制输出路径`。
7. **缺 FFmpeg 横幅**：`下载并安装` / `重试`（主按钮）与 `取消`（幽灵按钮）；
   进度条为 `role="progressbar"`，有百分比时给 `aria-valuenow`，否则只给阶段文字。
8. **提示播报**：顶栏状态与余额用 `aria-live="polite"`；每行进度是 `role="progressbar"`
   （`aria-valuenow` / `aria-valuetext`），不做高频播报；错误行用 `role="alert"`；
   结果徽章文字本身可读，颜色不是唯一信息。

---

## 四、设计令牌落地

- 深色默认（`#131519` 底 / `#191C22` 面板 / `#1F242C` 浮起 / `#272C35` 线），
  `@media (prefers-color-scheme: light)` 覆盖为浅色；两套都只引用变量。
- 强调色 `#FF8A2B` 只出现在变量定义处一次，用于主按钮、选中态、焦点环、链接下划线；
  链接正文仍用正文色（浅色主题下橙色文字达不到 4.5:1）。
- 状态绿/琥珀/红只出现在徽章：圆点与 1px 描边用状态色，徽章文字用正文色。
  这是有意的取舍：`#F5A524` 作为文字放在浅色背景上只有约 2:1，而正文色在徽章底上 ≥ 4.5:1。
- 字号只有 11 / 12.5 / 14.5 / 18；圆角 8 / 12 / 16；动效 150ms ease-out；
  `prefers-reduced-motion: reduce` 时 `--kq-motion` 归零并停掉过渡。
- **字体（D9）**：`system-ui, -apple-system, "Segoe UI", "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif`。
  没有 `@font-face`，不打包任何字体文件，只把字体名当 fallback。
- 次要文字用 `--kq-muted`（`#9AA3B3`），`--kq-dim`（`#697183`）在深色卡片上只有约 3.5:1，
  只用于非文字的装饰/描边，不承载信息。

---

## 五、文件接入（没有拖拽）

两个入口，全部以**绝对路径**登记：

1. **添加文件**：调用宿主注入的 `pickFile({ filters })`（目录浏览）。
   宿主没有提供时，不发假请求，直接给一句「宿主没有提供目录浏览」并自动展开粘贴框。
2. **粘贴路径**：手填或用「添加文件」拿到的路径；`parsePathInput` 接受 Windows 盘符、UNC、POSIX 绝对路径、
   `file://` 地址与带引号的路径；相对路径直接拒绝并给示例。

拿到路径后调 `api.probe(path)` 读 `MediaFacts`；GIF 选区默认 0 → 5 秒，并在片长不足时自动夹到片长。

---

## 六、与宿主通信

`src/client/api.js` 的 `createApi(ctx)`：

- `ctx.transport` 可以是函数 `(spec) => {status, data}`，也可以是 `{ request(spec) }` 对象；
  都没有时退回同源 `fetch`；再没有就给出「未连接」。
- 响应宽容三种形状：裸数据、`{ok:true,data}`、`{ok:false,error}`（HTTP ≥ 400 也按错误处理）。
- 每个方法都返回 `{ ok, data?, error?, source }`，网络异常折算成 `E_OFFLINE`，永不 reject。
- `binaryInstall(onProgress, {signal})`：`POST install` → 拿 `jobId` → 轮询 `progress?jobId=`，
  把 `{phase, percent, receivedBytes, totalBytes}` 交给界面；成功返回 `{state, version}`，
  失败返回一句 `{code,message,hint}`，`AbortController` 取消会得到 `E_CANCELLED`。
- `createFakeApi()`：不联网、不读盘、可复现，供离线演示与单测；`binary: 'missing' | 'system' | 'cached'`、
  `installFails`、`failRun`、`balance` 都可注入。

未连接时：首页正常渲染，表单显示「未连接宿主」并禁用主按钮，余额显示「余额 未连接」。

---

## 七、队列与每行进度

- 每次 `run` 成功都会往 `jobs.items` 前插一行；每行的状态、`JobSummary.progress`、展开状态都独立，
  互不共享（`normalizeJob` + `mergeJob`）。一行失败不影响其它行。
- 轮询优先调 `GET /api/kumquat/jobs`（列表响应带每行的 `progress`，宿主的 detail 路由不一定合并进度），
  只更新当前在跑的那几行；宿主没提供列表或列表失败时，退回按行 `GET /jobs/:id`。
  整个轮询只有一个定时器，但每一行保存自己的进度，不存在「所有行共用一个进度」。
- `progress` 字段（apiVersion 1 的加法）：`{ phase?: 'probing'|'encoding'|'verifying'|'repairing', percent?, outTimeSec?, speed?, etaSec? }`。
  进行中的行显示进度条与「剩余 X 秒」（≥60 秒显示 `剩余 1:05`），并按行给 `role="progressbar"`；
  轮询没带 `progress` 时沿用上一次的值，进度不会闪回。
- 结果区顶部有队列摘要：「队列：N 个进行中 · M 个排队」。组件不做任何并发控制，排队/并发全部由宿主
  `src/app/scheduler.js` 决定。

---

## 八、与 S5 路由对接的假设（已按 `src/host/routes.js` 核对）

| 方法 | 路由 | 客户端发送 | 宿主返回 |
|---|---|---|---|
| capabilities | `GET /api/kumquat/capabilities` | — | 裸 `Capabilities`（含 `apiVersion`、`panel`） |
| probe | `POST /api/kumquat/probe` | `{ input }` | 裸 `MediaFacts`（宿主同时接受 `{ path }`） |
| run | `POST /api/kumquat/run` | `{ task, overwrite }` | `202` 裸 `JobSummary`（可能带 `progress`） |
| job | `GET /api/kumquat/jobs/:id` | 路径参数 URL 编码 | 裸 `JobDetail`（进度以列表为准） |
| jobs | `GET /api/kumquat/jobs` | — | 裸 `JobSummary[]`（每行带 `progress`） |
| cancel | `POST /api/kumquat/jobs/:id/cancel` | 空 JSON | `{ ok:true, jobId }` |
| balance | `GET /api/kumquat/balance` | — | 裸 `BalanceInfo`；无 key 时 `ok:false` → 界面显示「未配置」 |
| binaryStatus | `GET /api/kumquat/ffmpeg/status` | — | 裸 `{state:'system'\|'cached'\|'missing', version?, sizeHint?}` |
| binaryInstall | `POST /api/kumquat/ffmpeg/install` | 空 JSON | `202 { jobId }`（忙碌时 `{jobId, reused:true}`） |
| binaryProgress | `GET /api/kumquat/ffmpeg/progress?jobId=` | `jobId` 查询 | `{phase:'download'\|'extract'\|'verify'\|'done'\|'error', state?, version?, percent?, received?, total?, receivedBytes?, totalBytes?, message?, error?}` |

其他假设：

- 错误统一 `HTTP 4xx/5xx + { ok:false, error:{ code, message, hint } }`；界面显示 `message` 与 `hint`。
- 进度以 `GET /api/kumquat/jobs` 的每行 `progress` 为准：宿主只在列表与 run 响应上合并调度器进度，
  `GET /jobs/:id` 未合并；面板优先轮询列表，缺列表时退回 detail（此时进度可能只有状态没有百分比）。
- 「添加文件」依赖宿主注入 `ctx.pickFile`；本版宿主没有该入口时降级为粘贴路径（不假装能选文件）。
- 结果行的「打开」没有宿主能力，本版改为「复制输出路径」；若 S5 提供打开接口，只换这个按钮的回调。
- 安装 FFmpeg 的「取消」只中止客户端轮询与请求，不保证停止宿主已开始的下载（宿主同一时刻只跑一个安装，
  且明确说明关闭面板不取消）。装完后下一次 `binaryStatus` 会显示 `cached`。

---

## 九、测试与验收

```powershell
node --test --test-isolation=none test/unit/ui-format.test.mjs test/unit/ui-logic.test.mjs test/unit/ui-api.test.mjs test/unit/ui-bundle.test.mjs
# 或（沙箱下不 spawn 子进程时整个目录）：
node --test --test-isolation=none test/unit
```

- `ui-format`：格式表、默认值、muxer 别名、编码名。
- `ui-logic`：时间/体积、绝对路径、拷贝可行性、两套校验、reducer 全分支、三屏 selector、
  结果行四态、进度与剩余秒数、命令拼装、修复、队列摘要、store 通知。
- `ui-api`：路由表、三种响应体、HTTP 错误、离线、余额未配置、FFmpeg 状态/安装/进度/失败/取消/超时、fake。
- `ui-bundle`：`client.js` 语法与注册、`inject/apply`、样式注入与清理、`slots` 缺失降级、
  **断网空态渲染**、三屏空态/忙态/错误态与结果细目、缺 FFmpeg 横幅三态、
  无 `@font-face`、30 个模块装配、令牌与唯一强调色。

---

## 十、已知限制

1. 视觉只在无 DOM 的假 React 下验证过「能渲染且文案齐全」，深浅色与 200% 缩放的截图需要宿主里人工过一遍。
2. 原生 `input[type=range]` 双滑块在极窄宽度（< 320px）会挤，页面最窄按 320px 设计。
3. 结果行最多显示 8 条（更早的仍在宿主记录里，V1 不做「全部记录」页）。
4. 取消 FFmpeg 下载是客户端侧取消（见上）。
5. `client.js` 是生成物；忘跑 `build.js` 时 `--check` 会失败，测试 `ui-bundle` 也会因为模块内容陈旧而失败。
6. 「最近」只覆盖本次面板会话内已出产物的任务；宿主 `/jobs` 列表可跨会话，V1 只把它用于进度轮询，
   没有拿它回填「最近」。重开面板后「最近」为空，直到本次再跑一次任务。
