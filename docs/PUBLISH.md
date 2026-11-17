# 发布清单

主仓库在 GitHub：<https://github.com/adengou/dsh-kumquat>；Gitee 是同内容的镜像：<https://gitee.com/adengou/dsh-kumquat>。

## 1. GitHub 主仓库

位置：仓库页 →「Settings」→「General」，以及首页「About」齿轮。

简介：

```
DSH 插件：视频/音频格式转换与取景 GIF，产物出厂前自动验收。
```

Topics：

```
dsh, dsh-plugin, deepseek-harness, ffmpeg, gif, video-converter, audio-converter
```

主页：

```
https://www.npmjs.com/package/dsh-kumquat
```

## 2. CI

推送 `main` 或开 PR 都会跑 `.github/workflows/ci.yml`：零运行时依赖校验、`client.js` 与源码一致性、单元测试（Node 24，跑测试前安装 FFmpeg）。

## 3. Gitee 镜像

改完 GitHub 后同步过去：

```bash
git push https://gitee.com/adengou/dsh-kumquat.git main
git push https://gitee.com/adengou/dsh-kumquat.git --tags
```

Gitee 仓库页的简介与标签（网页填写），可用脚本改简介与主页：

```bash
GITEE_TOKEN=xxxx node scripts/gitee-meta.mjs
```

## 4. npm 发布（一条命令安装）

```bash
npm login
npm publish --registry=https://registry.npmjs.org/
```

之后用户即可：

```bash
dsh plugin --profile desktop add dsh-kumquat
```

发布前检查：

```bash
npm pack --dry-run     # 98 个文件，约 741 kB
```

包名 `dsh-kumquat` 发布到 npmjs；国内镜像同步有延迟，以 `npm view dsh-kumquat version` 为准。

## 版本与标签

- 当前版本 `0.0.42`，标签 `v0.0.42`；
- 每次发版：改 `package.json` → 构建 `client.js` → 提交 → 打标签 → `npm publish` → `git push --tags`。
