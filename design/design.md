# Kumquat　设计稿 v0.6

> 定位：两个高频任务的专用工具，不是媒体工具箱。
> 状态：设计稿。数字来自 `report.md` 实测。

---

## 一、一页纸

| 项 | 内容 |
|---|---|
| 名称 | **Kumquat**（中文：金桔） |
| 包名 | `dsh-kumquat` |
| 读法 | /ˈkʌmkwɒt/；界面标题写 Kumquat，中文用户直接叫金桔 |
| 一句话 | 换个格式，或取几秒做成 GIF；做完自动验一遍。 |
| 用户 | 做口播、课程、短视频的中文用户，Windows 为主 |
| 差异 | 别人返回“成功/失败”，Kumquat 返回“期望、实际、差多少、怎么修” |
| V1 范围 | **只有两件事：格式转换、取段做 GIF** |
| 形态 | 一个 npm 包、零运行时依赖、FFmpeg 用用户已装的 |

---

## 二、V1 只做两件事

### 任务 A　格式转换

| 项 | 内容 |
|---|---|
| 输入 | 视频或音频文件 |
| 输出 | MP4 / MKV / MOV / WEBM / AVI / MP3 / M4A / WAV / FLAC |
| 用户要定 | 目标格式；是否仅换封装（能就点亮，不能就置灰并写明原因） |
| 不做 | 任何滤镜、任何画质调整。要调画质是另一件事 |

视频选 MP3 就是抽声音——不单独做一个“提取音频”入口，减少一个概念。

### 任务 B　取段做 GIF

| 项 | 内容 |
|---|---|
| 输入 | 视频文件 |
| 用户要定 | 选区（起止）、帧率、宽度 |
| 可选 | 目标体积；超了自动降尺寸重试 |
| 固定 | 循环、256 色、无声音；不提供“整段转” |

### 支撑能力（不占独立界面）

- **验收**：每次任务结束自动跑，结论挂在结果卡上，点开才看细目。
- **记录**：`job.json` + `verify.json` + argv，任何一次都能复现。
- **诊断**：失败给一句人话 + 下一步。

### 为什么不并列

原来的十项功能挤在一屏，界面必须在同一个位置承接“选格式”和“取段”两种完全不同的操作，于是第二步随格式变形、参数没有主次。那不是排版能救的，是范围问题。

**一个界面只承接一个决定。** 裁剪、拼接、竖屏、响度、字幕、压缩到体积、批量，全部进 P1，等 V1 有人天天用再说。

---

## 三、GIF 的实测与规矩

实测（2:22、1080p 素材取 5 秒，480px、12fps）：

| 路线 | 耗时 | 体积 | 帧数 |
|---|---|---|---|
| 单遍 split | 5.6 s | 6.17 MB | 60 |
| 两遍调色板 | 5.8 s | 6.17 MB | 60 |
| 同参数 20 秒 | 16.0 s | 24.58 MB | 240 |

- **两遍不是质量银弹**：同一素材同一滤镜，两条路线产物 SHA256 完全相同。两遍只在“用另一段生成调色板”时才有意义。
- **体积按秒线性涨**，约 1.2 MB/秒（480px/12fps）。

四条规矩：

1. 选 GIF 时**没有“仅换封装”**，永远重编码。
2. **必须先有选区**，默认 00:00 起 5 秒；不选不许开始。
3. **体积闭环**：超目标先降宽度（×0.85），再降帧率，最多两轮；仍超就报差多少。
4. **GIF 没有声音**，界面上直接写，不留悬念。

选区交互三条：起止必须明确；手填与拖拽双向同步；验收回查“GIF 时长 ≈ 选区长度（±0.2s）”。

---

## 四、界面：只有三个屏幕

### 屏幕 1　选任务

```
┌ Kumquat ────────────────────────── ffmpeg 6.1.1 ┐
│                                              │
│  要做什么？                                   │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 格式转换                               │  │
│  │ 换个格式，或把视频里的声音抽出来        │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │ 视频做 GIF                             │  │
│  │ 取几秒，做成循环动图                    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  最近   ✓ 猫猫打滚.mkv   ✓ 猫猫_03.2-08.4.gif │
└──────────────────────────────────────────────┘
```

### 屏幕 2A　格式转换

```
← 格式转换
文件   [＋ 添加文件] [粘贴路径]
       🎬 猫猫打滚.mp4 · 1920×1080 · 0:12

转成   [MP4] [MKV] [MOV] [WEBM] [AVI]
       [MP3] [M4A] [WAV] [FLAC]

       ☑ 仅换封装 · 3 秒 · 不重编码
       ⓘ 想只要声音，直接选 MP3

       [ 开始转换 ]   预计 3 秒
```

只有一个必答项：转成什么。其余全是默认值。

### 屏幕 2B　视频做 GIF

```
← 视频做 GIF
文件   🎬 猫猫打滚.mp4 · 0:12

截取   ──────██████████──────────
       00:03.2 → 00:08.4     5.2s

       帧率 12     宽度 480     目标 8MB（可选）

       [ 开始生成 GIF ]   预计 7 秒
```

也只有一个必答项：哪几秒。帧率、宽度是默认值，不用管。

### 屏幕 3　结果（就挂在表单下面）

```
结果
✓ 猫猫打滚.mkv          1080p · 2:22 · 210 MB    打开
✓ 猫猫_03.2-08.4.gif    480×270 · 5.2s · 6.3 MB  打开
⚠ 表情包_00-08.gif      9.8 MB，超目标 1.8 MB    修复
```

点开才展开验收细目与“下一步”。

### 三条层级规则

1. **一次一个决定**：每个屏幕只有一个必答项，其余是默认值。
2. **结果不另开页面**：挂在当前表单下方，做完立刻看见。
3. **验收不占位置**：一行徽章，点开才有细目。它不该和任务抢注意力。

---

## 五、架构与模块边界

```
dsh-kumquat/
  package.json          exports 只开 "." 与 "./client"
  src/
    public/             createService / 类型，唯一出口
    app/                用例编排：run-convert / run-gif / verify-job
    domain/             纯逻辑：argv、checks、recipe、policy
    infra/              runner、probe、capability、store、locate、platform
    host/               DSH bundle 入口
    client/             三个屏幕
```

依赖方向：`public → app → domain ← infra`。`domain` 不认识文件和进程，可纯单测；`client` 不 import 内部代码。

**只给接口的六条硬机制**

1. `exports` 白名单只开 `.` 与 `./client`；
2. 内部模块不进任何 barrel；
3. 对外只返回冻结的纯数据，不返回类实例或句柄；
4. 数据目录是实现细节，外部只能通过 `service.jobs` 查；
5. 构建期扫描反向 import，命中即失败（自研，不引依赖）；
6. 错误统一 `MediaQcError { code, message, hint }`。

---

## 六、对外接口

```ts
export type Task =
  | { kind: 'convert'; input: string; to: string; copy?: boolean }
  | { kind: 'gif'; input: string; from: number; to: number
      fps?: number; width?: number; maxBytes?: number }

export interface MediaQcService {
  readonly apiVersion: 1
  probe(path: string): Promise<MediaFacts>
  run(task: Task, opts?: { overwrite?: boolean }): Promise<JobHandle>
  verify(path: string, spec: MediaSpec): Promise<Verdict>
  cancel(jobId: string): Promise<void>
  jobs: { list(): Promise<JobSummary[]>; get(id: string): Promise<JobDetail> }
}

export interface Verdict {
  ok: boolean
  spec: MediaSpec
  facts: MediaFacts
  checks: Check[]          // 每条必带 expected / actual
  repairs: RepairRecord[]
  evidencePath?: string
}

export type MediaQcErrorCode =
  | 'E_INPUT' | 'E_CAPABILITY' | 'E_ENCODE'
  | 'E_VERIFY' | 'E_REPAIR_EXHAUSTED' | 'E_COMMIT' | 'E_CANCEL'
```

`apiVersion` 为 1 期间只增不改。外部插件通过 DSH 服务名取接口，不 import 包内路径。

---

## 七、零第三方依赖

| 需要 | 用什么 |
|---|---|
| 子进程 / 文件 / 哈希 / UUID | `node:child_process`、`node:fs/promises`、`node:crypto` |
| 路径 | `node:path`，长路径自己处理 |
| 并发、校验、日志、原子写 | 自研 |
| 测试 | `node:test` |
| 构建 | `tsc`（仅构建期） |

**运行时不装任何包。** FFmpeg 不是依赖，是外部前提：只定位，不捆绑，不自动下载。

---

## 八、跨平台

| 关注点 | Windows | macOS | Linux |
|---|---|---|---|
| 可执行名 | `ffmpeg.exe` | `ffmpeg` | `ffmpeg` |
| 定位顺序 | 环境变量 → PATH → 常见目录 → 用户指定 | 同左 | 同左 |
| 终止进程树 | `taskkill /T /F` | 进程组 TERM | 进程组 TERM |
| 临时目录 | ASCII 子目录 | 同左 | 同左 |
| 长路径 | `\\?\` 前缀 | — | — |
| 字幕字体 | 雅黑 / 思源 | PingFang | Noto（常缺） |
| 硬件编码 | NVENC / QSV / AMF | VideoToolbox | VAAPI |

平台差异全部收在 `infra/platform/`，`domain` 里不出现 `process.platform`。

---

## 九、安全

1. 永远 argv 数组，不拼 shell。
2. 转换不接受滤镜串；GIF 的参数是白名单字段。
3. 只读用户投料，输出目录固定，拒绝系统目录。
4. 不发网络请求。
5. 不改 PATH、不写注册表、不执行用户脚本。

---

## 十、性能预算（实测）

| 指标 | 目标 |
|---|---|
| 包体积（纯 JS） | < 300 KB |
| 冷启动 | < 50 ms |
| L0 验收（probe） | < 200 ms |
| L1 验收（音频全解码） | < 600 ms / 143s |
| 全片解码 | 约时长 9.3%，仅显式开启 |
| GIF 5s/480px | 约 6 s，6.2 MB |

---

## 十一、质量门槛

- 单元：argv 构造、容差判定、体积换算。
- 契约：每个模块用假 Port 测，跑在 `node:test`。
- 集成：5 类真实素材 × 2 平台。
- 回归：`report.md` 里 11 条 stderr 全部映射到错误码并给 hint。
- GIF 专项：5 秒与 20 秒样本，体积达标、时长≈选区、循环存在；超限只重试两轮。
- 零依赖：`npm ls --omit=dev` 必须为空。

---

## 十二、路线图

| 阶段 | 内容 | 判据 |
|---|---|---|
| M0 | 设计（本稿） | 三个屏幕与接口定稿 |
| M1 | 内核：convert / gif / verify | 命令行跑通两条任务，Verdict 可用 |
| M2 | 三个屏幕 + 结果卡 | 从选任务到出片全流程可用 |
| M3 | 任务记录 + 断点续跑 | 关页面不丢任务 |
| M4 | 体积/响度闭环修复 | 不合格能自动修 |
| M5 | 发布 | 安装到首次成功 < 3 分钟 |

P1（V1 之后再谈）：裁剪、拼接、竖屏、响度、字幕、压缩到体积、批量、元数据、黑帧静音检测。

---

## 十三、风险

| 风险 | 应对 |
|---|---|
| 用户没装 FFmpeg | 全屏引导 + 可复制命令 |
| 范围再次膨胀 | V1 写死两件事，新功能必须替换旧功能才准入 |
| 平台规格过期 | 配方带核对日期，内置只作示例 |
| 验收拖慢批量 | 分档 + 默认 L1 |
| 维护成本 | domain 纯函数、单测覆盖，改坏即红 |
