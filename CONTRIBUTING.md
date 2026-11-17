# 参与 Kumquat

先谢谢你看这个仓库。它很小，规则也少。

## 本地跑起来

要求：Node 20.12+，一个 DSH 0.2.x 环境（桌面客户端或 `dsh web`）。

```bash
# 装到你的 profile（当前方式）
dsh plugin --profile desktop add file:C:/path/to/dsh-kumquat
dsh plugin --profile web add file:C:/path/to/dsh-kumquat
```

改完客户端代码先构建：

```bash
node src/client/build.js        # 生成 client.js
node src/client/build.js --check # 校验 client.js 与源码一致（CI 用）
```

## 测试

```bash
node scripts/make-fixtures.mjs
node --test --test-isolation=none "test/unit/*.test.mjs"
node --test --test-isolation=none "test/e2e/*.test.mjs"
```

沙箱里 `node --test` 可能为每个文件 spawn 子进程并报 `EPERM`；用 `--test-isolation=none` 在当前进程内跑。

E2E 需要本机有 ffmpeg，且不要在 Windows 受控文件夹（桌面/下载/文档）里写产物。

## 代码边界

- `src/public/`：对外契约（类型、服务工厂）。只暴露接口，外部不读内部。
- `src/engine/`：ffmpeg 定位、探测、能力、argv 构造、进程执行。纯 Node，不碰 UI。
- `src/verify/`：验收检查、容差、修复、证据。
- `src/app/`：调度与服务装配。
- `src/host/`：DSH 宿主接线与 HTTP 路由。
- `src/client/`：三屏界面；构建产物是根目录 `client.js`（要提交，DSH 直接加载）。

新增能力优先做成独立纯函数模块（参考 `src/engine/trim.js`），再接进 argv 与验收，最后才是界面。

## 提交要求

1. 不引入第三方运行时依赖；
2. 改动必须带测试，`test/unit` 全绿；
3. 客户端改动要跑 `node src/client/build.js`，并提交生成的 `client.js`；
4. 提交信息说清楚“改了什么、为什么”，不要只写“update”；
5. 不提交密钥、本机绝对路径、真实用户文件名；
6. 新格式或新参数必须能被验收：期望值、实际值、差多少，缺一不可。

## 报 Bug

请附上：

- 系统与版本（Windows 11 / macOS / Linux）；
- DSH 版本与 `ffmpeg -version` 第一行；
- 复现步骤；
- 结果行里“复制命令”出来的完整命令（打码路径即可）。

能复现的最小样本最有价值；涉及监控私有格式（`.vdat` / `.sdv`）时，先确认原厂工具能打开。

## 许可证

提交即同意以 MIT 许可证发布。
