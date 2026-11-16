# 测试助手与 e2e（S4 quality）

本目录只做两件事：**造可复现的素材**、**用公共契约验收行为**。
不 import `src/engine/**`；唯一例外是 `test/e2e/concurrency.test.mjs` 里的调度器桥接（见第六节，Lead 批准）。

| 文件 | 职责 |
|---|---|
| `test/helpers/ffmpeg.mjs` | 定位 ffmpeg/ffprobe、以 argv 执行、ffprobe 读规格/帧数；子进程输出落临时文件而不是管道（受限沙箱下管道会 EPERM） |
| `test/helpers/fixtures.mjs` | 夹具路径表、就绪检查、缺夹具时 skip |
| `test/helpers/service.mjs` | `createService()` 单例、任务轮询、失败/取消辅助、输出路径解析、产物扫描 |
| `test/e2e/convert.test.mjs` | 转换三条正向路径 + 四个坏样本 |
| `test/e2e/gif.test.mjs` | GIF 时长/帧数/体积/无声/循环 + 超体积验收 |
| `test/e2e/cancel.test.mjs` | 长任务取消、进程与半成品残留 |
| `test/e2e/concurrency.test.mjs` | 双任务并行、进度隔离、取消互不影响 |
| `scripts/make-fixtures.mjs` | 生成 `fixtures/**`（幂等，自带规格校验） |
| `scripts/check-deps.mjs` | 零第三方依赖断言 |

## 一、前置条件

- Node ≥ 20.12（`package.json` 的 engines）；本机实测 v24.16.0。
- ffmpeg 6.x **和 ffprobe** 在 PATH，或显式指定：
  - `KUMQUAT_FFMPEG` / `FFMPEG_PATH` 指向 ffmpeg 可执行文件或所在目录；
  - `KUMQUAT_FFPROBE` / `FFPROBE_PATH` 指向 ffprobe（默认取 ffmpeg 同目录）。
- 不联网、不安装任何 npm 包。

## 二、生成夹具

```bash
node scripts/make-fixtures.mjs          # 已存在且非空则跳过
node scripts/make-fixtures.mjs --force  # 全部重新生成
```

- 产物写入 `fixtures/`；该目录自带 `.gitignore`（`*` + `!.gitignore`），不入库。
- 每个文件生成后都会 ffprobe 复核尺寸/帧率/时长/声道，不符立即非 0 退出，避免坏夹具污染 e2e。
- 实测：冷启动 **5.12 s**（Windows 11 / ffmpeg 6.1.1-essentials / Node 24.16.0）；已存在时 **0.44 s**。预算 120 s。
- `fixtures/bad-sub.srt` **永不生成**；若发现残留会被删除（它是“路径不存在”样本）。

### 夹具清单

| 文件 | 规格 | 用途 |
|---|---|---|
| `bar-12s.mp4` | 1280×720 @30fps，h264 + 440Hz aac 立体声，12s | 转换/GIF 主素材 |
| `bar-30s-longgop.mp4` | 640×360 @30fps，`g=300`（10s 关键帧间隔），30s | 长任务、长 GOP |
| `tone-30s.wav` | 48kHz 立体声 pcm_s16le，30s | 纯音频 |
| `tone-5s.mp3` | 24kHz 单声道 mp3，5s | mp3→m4a 必须转 AAC |
| `noaudio-4s.mp4` | 640×360 @30fps，无音轨，4s | 无音源 GIF |
| `vertical-4s.mp4` | 1080×1920 竖屏，含音轨，4s | 竖屏素材（预留给后续用例） |
| `fake.mp4` | 纯文本重复 40 行改名 | 坏样本 |
| `truncated.mp4` | `bar-12s.mp4` 前 100KB | 坏样本（moov 缺失） |
| `list-bom.txt` | UTF-8 BOM + `ffconcat` 列表 | 坏样本（BOM） |
| `bad-sub.srt` | 不生成 | 坏样本（路径不存在） |

## 三、跑 e2e

标准（普通终端）：

```bash
node --test test/e2e
```

单文件：

```bash
node test/e2e/gif.test.mjs
```

**受限沙箱内**（如 DSH agent 的 workspace-write）：`node --test` 会因为用管道 spawn 子进程而 `spawn EPERM`，改用任一写法：

```bash
node --test --test-isolation=none "test/e2e/*.test.mjs"
# 或
NODE_OPTIONS=--test-isolation=none node --test "test/e2e/*.test.mjs"
# 或逐文件直跑
node test/e2e/convert.test.mjs && node test/e2e/gif.test.mjs && node test/e2e/cancel.test.mjs && node test/e2e/concurrency.test.mjs
```

零依赖检查：

```bash
node scripts/check-deps.mjs   # 退出码 0 = 干净
```

## 四、skip 规则（不把环境问题报成红灯）

| 条件 | 结果 | 提示文本 |
|---|---|---|
| `createService()` 抛错（未接线） | 所有 service 用例 skip | `service not wired yet`（同时 `diagnostic` 原始错误） |
| 无 ffmpeg | service 用例 skip；调度器用例照跑 | `ffmpeg not found` |
| 无 ffprobe | `gif.test.mjs` 三条 skip | `ffprobe not found` |
| 夹具缺失/为空 | 依赖它的用例 skip | `fixtures missing (...)` + 生成命令 |
| `bad-sub.srt` 意外存在 | 仅“缺失路径”子用例 skip | `bad-sub.srt unexpectedly exists` |
| 调度器模块不可 import | 调度器两条 skip | `scheduler module unavailable` |
| 取消并发用例里幸存任务已先完成 | 该用例 skip | `survivor task finished before cancel` |

当前（`createService` 未接线）实测：12 条用例，**2 pass / 10 skip / 0 fail**（pass 的是调度器两条）。

## 五、坏样本清单与预期判定

| 坏样本 | 构造 | 预期判定 | 覆盖测试 | 依据 |
|---|---|---|---|---|
| `fake.mp4` | 文本改名 | 任务失败；错误码 ∈ `{E_INPUT, E_ENCODE, E_VERIFY}`；`message`/`hint` 均非空 | `convert.test.mjs` → bad samples | `report.md` 第 9 条（`moov atom not found`） |
| `truncated.mp4` | 前 100KB | 同上 | 同上 | `report.md` 第 9 条（moov 缺失） |
| `list-bom.txt` | UTF-8 BOM concat 列表 | 作为输入失败；错误码 ∈ `{E_INPUT, E_ENCODE, E_VERIFY}`；`hint` 非空 | 同上 | `report.md` 第 8 条（BOM 使列表读不了） |
| `bad-sub.srt` | 不生成，保持不存在 | 必须失败，错误码 **E_INPUT**；`hint` 非空 | 同上（缺失路径子用例） | `report.md` 第 1 条（路径错/被挡） |

说明：V1 不提供拼接、字幕任务，后两个样本按要求生成/保留，但只能以“非法输入”的方式观测其错误语义。

## 六、并发用例

`concurrency.test.mjs` 分两层：

1. **调度器层**（现在就跑）：直接 `import('../../src/app/scheduler.js')`，用假任务验证
   - 两个任务确实重叠（并发 2）；
   - `progress` 事件按 job id 路由，回调载荷不串（`event.progress.job === event.id`）；
   - 取消长任务后，短任务继续产生进度并正常完成；
   - `stats()` 计数（done/cancelled/running/queued）正确。

   这条桥接是过渡措施：`createService()` 接线后，第 2 层成为主判据，调度器层可保留为回归。

2. **公共契约层**（未接线时 skip）：同时 `run()` 一个 GIF 和一个 WebM 转换，断言两个都完成、输出扩展名/编解码/argv 不串；再取消其中一个，断言另一个继续跑完并产出合格 GIF。

## 七、断言与阈值

| 用例 | 断言 |
|---|---|
| mp4→mkv copy | `status=done` 且 `verdict.ok`；argv 含 `copy`；墙钟 < 5 s；输出 h264+aac、12 s ±0.2；体积 > 输入 90% |
| mp4→webm | 完成且 verdict 通过；视频 vp8/vp9/av1、音频 opus/vorbis、容器含 webm；12 s ±0.3 |
| mp3→m4a | 完成且 verdict 通过；音频 aac；无视频流；5 s ±0.3 |
| GIF 5 s @12fps/480 | 帧数 57–63；时长（容器时长，缺失时按帧数/fps）5 s ±0.25；< 8 MB；无音轨；含 `NETSCAPE2.0` |
| 无音源 GIF | 45–51 帧；4 s ±0.25；无音轨 |
| 超体积 GIF | `verify({maxBytes: 体积/2}).ok=false`；有失败检查且 id/文案含 byte/size/max/MB/体积/大小；该检查 `expected`/`actual` 非空；有降尺寸建议（`repair.kind='reencode'` 且 width<720，或 hint 含 width/宽度/尺寸/缩放） |
| 取消 | `cancel()` 后 job=`cancelled` 且 `endedAt` 有限；未发布 output；输出目录与工作目录无 `.part/.tmp`；再等 1 s 无新产物 |
| 并发 | 两任务都 `done` 且 verdict 通过；输出路径/扩展名/编解码/argv 不串；取消一个后另一个完成 |

所有 service 用例都先把夹具复制成带唯一 token 的临时文件，避免并行测试文件在输出目录互相覆盖（输出名若按源文件名生成会撞车）。

## 八、取消的可见性与局限

- 公共契约不暴露 PID，所以“进程已退出”用**可观测证据**断言：`run()` 在 30 s 内 settle、job 进入 `cancelled` 且 `endedAt` 有限、未发布输出、`.part` 不存在、取消后 1 s 内产物集合不再变化。直接查 PID 需要引擎内部信息，e2e 不做。
- 取消测试先用一次快速 copy 任务探明服务真实的输出目录，不硬编码路径。
- 若引擎把临时文件放在名字不含 token 的私有目录，扫描可能漏检；集成后需按 S1 的实际命名复核一次。

## 九、已知环境限制

- DSH 受限沙箱下 `node --test` 报 `spawn EPERM`（runner 用管道 spawn 测试文件），按第三节用 `--test-isolation=none`。
- 本机只有 Windows；macOS/Linux 的 `spawn`/杀进程树/路径分支只做静态核对，未实测。
- 公共契约目前没有 job 进度订阅（`types.d.ts` 无此字段），公共层并发用例因此不覆盖“进度回调”，该点在调度器层覆盖。

## 十、维护约定

- 新增夹具：改 `scripts/make-fixtures.mjs` 的 `GOOD_FIXTURES`，同步 `test/helpers/fixtures.mjs` 与本表。
- 调阈值必须在提交说明里写清原因，并附一次实测数据。
- `fixtures/` 永不入库；换 ffmpeg 版本后先 `--force` 重生成再跑 e2e。
