# 发布清单

三件事只差账号授权；代码与文案已备好。

## 1. Gitee 仓库简介与标签

位置：仓库页 →「管理」→「基本信息」。

简介：

```
DSH 插件：视频/音频格式转换与取景 GIF，产物出厂前自动验收。
```

标签：

```
dsh, dsh-plugin, ffmpeg, gif, media-converter
```

有个人访问令牌（`projects` 权限）时，也可用脚本：

```bash
GITEE_TOKEN=xxxx node scripts/gitee-meta.mjs
```

脚本只改简介与主页，不改可见性、不改代码；标签仍需在网页上填。

## 2. GitHub 镜像（CI 用）

先在 GitHub 建空仓库 `dsh-kumquat`（不要勾选 README），然后：

```bash
git remote add github https://github.com/<账号>/dsh-kumquat.git
git push github main
git push github --tags
```

推上去后 `.github/workflows/ci.yml` 会自动跑：零运行时依赖校验、`client.js` 与源码一致性、352 条单元测试。

## 3. npm 发布（一条命令安装）

首次：

```bash
npm login
npm publish
```

之后用户即可：

```bash
dsh plugin --profile desktop add dsh-kumquat
```

发布前检查：

```bash
npm pack --dry-run     # 94 个文件，约 462 kB
```

包名 `dsh-kumquat` 当前未被占用（registry 返回 404）。

## 版本与标签

- 当前版本 `0.0.38`，Gitee 标签 `v0.0.38` 已推；
- 每次发版：改 `package.json` → 构建 `client.js` → 提交 → 打标签 → `npm publish` → `git push --tags`。
