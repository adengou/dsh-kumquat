# 仓库设置清单（GitHub 主仓 + Gitee 镜像）

代码侧已经补齐，下面这些是仓库设置页才有的字段，逐项照抄即可。

## GitHub（主仓库）

- 简介：`DSH 插件：视频/音频格式转换、裁剪、批量与取景 GIF，产物出厂前自动验收。`
- Topics：`dsh, dsh-plugin, deepseek-harness, ffmpeg, gif, video-converter, audio-converter`
- 主页：`https://www.npmjs.com/package/dsh-kumquat`
- 默认分支：`main`
- Issues：开启

## Gitee（镜像）

- 简介与 Topics 与 GitHub 保持一致；
- 可用令牌脚本改简介与主页（标签仍需网页填）：

```bash
GITEE_TOKEN=你的令牌 node scripts/gitee-meta.mjs
```

## 发布 Release

- 标签：`v0.0.42`
- 标题：`v0.0.42 — 视频/音频转换与取景 GIF`
- 说明：按本次 CHANGELOG「0.0.42」一节撰写

## 其它

- 许可证：MIT
- 默认分支：`main`
