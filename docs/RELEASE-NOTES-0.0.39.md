# v0.0.39

金桔的第一个公开版本：视频/音频格式转换 + 取景 GIF，每个产物出厂前自动验收。

## 能做什么

- **视频格式转换**：MP4 / MKV / MOV / WEBM / AVI 互转；兼容时直接流拷贝（画质零损失），不兼容才重编码（H.264 CRF 18）。
- **音频格式转换**：MP3 / M4A / WAV / FLAC / AAC / OGG / OPUS / WMA 八种互转。
- **视频裁剪**：填起止时间只转中间一段，切点准确，验收按裁剪后时长。
- **批量转换**：一次多选，按同一格式依次提交，逐条验收、逐条取消。
- **视频做 GIF**：拖选区、调帧率与宽度；超出目标体积自动降宽重试两轮。
- **监控格式**：`.vdat` / `.sdv` 按内容识别，标准容器可换壳；加密私有外壳会明确告知。

## 验收

每个产物都给出：期望、实际、差多少、怎么修。结果可展开看逐项检查，并落一份 `verify.json`（完整 argv、FFmpeg 版本、逐项判定），失败可复现。

## 安装

```bash
dsh plugin --profile desktop add dsh-kumquat
dsh plugin --profile web add dsh-kumquat
```

要求 DSH 0.2.x、Node 20.12+；运行时零依赖。首次使用若本机没有 FFmpeg，点一次「开始转换」会自动下载并继续。

## 验证

- 单元测试 352 条、端到端 16 条（Windows 实测）；
- 视频流拷贝实测与源文件 MD5 一致；
- 重编码 1080×1920 实测 SSIM 0.9928；
- 8 种音频格式互转全部通过。

## 已知边界

- 加密或私有外壳的 `.vdat` / `.sdv` 需要原厂工具先导出 MP4；
- macOS 不能自动安装 FFmpeg（需 `brew install ffmpeg`）；
- Linux / macOS 界面未上机验证；
- 网页端上传单文件上限 2 GB。

完整说明见 [README](../README.md) 与 [docs/DETAIL.md](DETAIL.md)。
