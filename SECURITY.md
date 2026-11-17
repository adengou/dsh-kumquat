# 安全策略

## 报告问题

发现安全问题请通过 Gitee 私信或仓库 Issue 的私密渠道联系维护者，不要在公开 Issue 里贴可利用细节。

## 密钥

- 本项目**不包含任何真实 API Key**，仓库中只允许 `sk-...` 占位符。
- Key 的来源按优先级：插件配置 `kumquat.config.apiKey` → 环境变量 `DEEPSEEK_API_KEY` → Harness 凭据服务里的同名引用（与聊天模型共用同一把 key）。
- Key 只在宿主进程内使用，不下发客户端、不写日志、不进错误信息。
- 未配置 key 时，插件不发起任何与余额相关的网络请求。

## 网络出口

| 用途 | 地址 | 触发条件 |
|---|---|---|
| 余额查询 | `https://api.deepseek.com/user/balance` | 配置了 key |
| FFmpeg 下载 | 各平台构建源（白名单） | 本机没有 FFmpeg 且自动安装开启 |

除此之外没有遥测、没有媒体上传。

## 本地文件

- 只读取用户显式投料的文件路径；
- 临时文件写在输出目录下的 `.kumquat-tmp/`，成功后原子改名，失败或取消即清理；
- 不写入系统目录，不修改 PATH、注册表或环境变量。

## 供应链

- 运行时零 npm 依赖；
- FFmpeg 下载强制 sha256 校验，只提取 `ffmpeg` 与 `ffprobe`；
- 没有校验和的来源不进入自动安装路径。

## 子进程

插件需要执行外部程序：`ffmpeg`、`ffprobe`，以及 Windows 下结束进程树的 `taskkill`。

- 只使用 `spawn`，参数以数组传入，**从不设置 `shell: true`**，也不拼接命令字符串；
- 调用点只有三处：
  - `src/engine/runner.js`（执行 ffmpeg/ffprobe，argv 由白名单参数构造）；
  - `src/binary/exec.js`（校验下载的二进制可执行）；
  - `src/engine/platform/win32.js`（取消任务时结束进程树）；
- `src/verify/measure.js` **没有**导入 `child_process`；它通过注入的 `run(argv)` 端口测量产物。扫描器若在该文件报告 `exec`，属于把局部函数名误判为 `child_process.exec`，该局部函数已改名为 `runTool`。
- 转换不接受用户滤镜串，GIF 参数走白名单，文件路径只作为 argv 元素传入。