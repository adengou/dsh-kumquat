# 验证记录

截至 2026-11-16。以下均为本机实测（Windows 11、ffmpeg 6.1.1、Node 24.16）。

## 一、自动化测试

| 项 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `node --test --test-isolation=none "test/unit/*.test.mjs"` | 339 条全部通过 |
| 端到端 | `node --test --test-isolation=none "test/e2e/*.test.mjs"` | 16 条全部通过 |
| 零依赖 | `node scripts/check-deps.mjs` | runtime 与 build 均无依赖 |

覆盖到的真实行为：

- mp4→mkv 走流拷贝（百毫秒级）；mp4→webm 自动重编码；mp3→m4a 自动转 AAC；
- GIF 取段：帧数、时长、体积、循环四项验收，超体积给出降宽建议；
- 取消：进程退出后才置 cancelled，临时目录不残留；
- 并发：两个任务同时跑、进度互不串扰、取消只命中指定任务；
- 坏样本：伪 mp4、截断文件、带 BOM 的列表、不存在路径，均返回带 hint 的错误码；
- 宿主：路由接线、按任务隔离进度、余额无 key 时零网络请求；
- 证据包：每次任务写 `verify.json`（期望、实际、逐项判定）。

## 二、两端运行

| 端 | 验证方式 | 结果 |
|---|---|---|
| dsh web | 启动服务后请求页面与接口 | 页面 200；`GET /api/kumquat/capabilities` 200，返回真实 ffmpeg 路径与编码器列表 |
| 桌面客户端 | 装入 desktop profile | 依赖与 bundles 已登记 |

界面用无头浏览器在真实 dsh web 上操作并截图：

- 侧栏出现「金桔」；
- 点击后弹出面板，标题 `Kumquat 金桔`，右上角 `ffmpeg 6.1.1 · 就绪`；
- 首页两张任务卡、最近、余额未配置、页脚说明正常；
- 点「格式转换」进入表单：文件区、九个格式胶囊、仅换封装、开始转换、结果空态；
- 浏览器控制台零错误；
- 走完整流程：填绝对路径 → 识别 `1280×720 · 0:12 · 1.7 MB` → 选 MKV → 转换 → 验收通过，产物 1.76 MB、时长 12.021s（期望 12 ± 0.2s）。

![界面](images/panel.png)

## 三、FFmpeg 自动安装（Windows 实测）

| 项 | 实测值 |
|---|---|
| 来源 | gyan.dev essentials 滚动别名 → `ffmpeg-9.0.2` |
| 下载体积 | 114,768,076 B（109.5 MiB），sha256 与官方逐位一致 |
| 解压 | 0.6 s，只提取 `ffmpeg.exe` 与 `ffprobe.exe` |
| 落盘 | 200.9 MiB |
| 二次调用 | 117 ms，0 次网络请求，走缓存 |
| 清理 | 无 `.part`、无残留 staging |

## 四、未验证

| 项 | 原因 | 影响 |
|---|---|---|
| macOS | 无可信校验和的构建源 | 不自动安装，需用户自行安装或在配置里指定路径 |
| Linux | 无真机 | 平台层只做静态审查 |
| 超大文件 | 只在 12–30 秒素材上跑过 | 长视频的内存与耗时未实测 |
| 余额真实接口 | 需要真实 key | 只验证了无 key 与失败降级 |
| 桌面端目视 | 未在桌面窗口内截图 | 与 web 共用同一份客户端代码 |

## 五、复现

```bash
node scripts/make-fixtures.mjs
node --test --test-isolation=none "test/unit/*.test.mjs"
node --test --test-isolation=none "test/e2e/*.test.mjs"
```

沙箱里 `node --test` 会为每个文件 spawn 子进程并报 EPERM，必须带 `--test-isolation=none`。
