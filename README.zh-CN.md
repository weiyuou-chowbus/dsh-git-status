# dsh-git-status

[English](README.md) | [中文](README.zh-CN.md)

一个 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的 **Web 客户端插件**：在输入框工具行实时显示当前 git 分支，并且不用离开聊天界面就能切换分支。

## 功能特性

- **实时分支指示器** — 输入框工具行（访问模式选择器右侧）有一个胶囊徽标，显示当前分支和一个干净/有改动的状态圆点，每 3 秒轮询一次。
- **跟随工作区** — 跟随当前会话的工作区（`cwd`），切换工作区时显示的分支也会跟着变。
- **分支切换** — 点击展开一个可过滤的*本地*分支列表（按最近提交排序，附上游跟踪信息）；点击某个分支会先弹出确认。
- **脏状态安全** — 工作区有未提交改动时，默认禁止切换；只有显式点击 **「Stash & switch」** 才会先 `git stash push --include-untracked` 再切换，切换失败时会恢复 stash。
- **默认安全** — 详见[安全设计](#安全设计)。

## 工作原理

DSH 插件是包含两半的 npm 包：

| 部分 | 文件 | 职责 |
|------|------|------|
| Host（宿主） | [`lib/index.js`](./lib/index.js) | Cordis 服务，注册两条 HTTP 路由并执行 `git` |
| Client（客户端） | [`lib/client.js`](./lib/client.js) | Module-loader 格式的 bundle，把一个 React 组件注入 `conversation.input.left` 插槽 |

客户端在挂载时以及每 3 秒轮询一次 `GET /git-status?cwd=…`，并通过 `POST /git-checkout` 切换分支。无需构建步骤：客户端 bundle 直接按 module-loader 格式手写，原样由 shell 提供。

## 安装

> 需要 DSH 的 Web profile。默认 Web profile 位于 `~/.dsh/profiles/web/`。

### 1. 获取源码

```bash
git clone https://github.com/weiyuou-chowbus/dsh-git-status.git
# 也可以把解压后的包放到任意位置，例如 ~/dsh-git-status
```

### 2. 软链到你的 profile 的 `node_modules`

```bash
ln -sfn "$(pwd)/dsh-git-status" ~/.dsh/profiles/web/node_modules/dsh-git-status
```

### 3. 在 `cordis.patch.yml` 中启用

编辑 `~/.dsh/profiles/web/cordis.patch.yml`，加入一条 `insert` 配置：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: git-status
      name: dsh-git-status
      config:
        repoPath: /absolute/path/to/your/default/repo
```

- `repoPath` 是当前会话没有工作区 `cwd` 时的**兜底**仓库路径。省略时，插件会回退到 DSH 进程的工作目录。

### 4. 重启

```bash
npm exec @deepseek-ai/dsh web
```

然后刷新 `http://127.0.0.1:3080`。

## 配置

| 键 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `repoPath` | string | 否 | 默认仓库的绝对路径。仅当没有会话 `cwd` 时作为兜底使用。缺省时回退到 DSH 进程的 cwd。 |

## HTTP API

| 路由 | 方法 | Body / Query | 响应 |
|-------|------|--------------|------|
| `/git-status` | `GET` | `?cwd=<workspace path>` | `{ branch, dirty, branches: [{ name, track }] }` |
| `/git-checkout` | `POST` | `{ branch, cwd?, stash? }` | 更新后的状态；当有改动且 `stash` 不为 `true` 时返回 `409 { error: "dirty" }` |

## 安全设计

插件对每一次 git 调用和每一条输入路径都做了加固：

- **不经过 shell** — 所有 git 命令都使用 `child_process.execFile` 的数组参数调用，任何内容都不会被拼进 shell 字符串。
- **`cwd` 白名单** — 请求中的 `cwd` 会先 `realpath` 规范化，只有匹配已注册的工作区路径（来自 `workspaceRegistry.list()`）或配置的 `repoPath` 时才被接受。浏览器传来的任意目录会被拒绝，返回 `400 not a registered workspace`。
- **分支白名单** — 切换目标必须匹配 `git for-each-ref refs/heads` 枚举出的本地分支。分支名在通过该校验之前绝不会传给 git。
- **副作用仅限 POST** — 读接口只接受 `GET`/`HEAD`；切换接口是 `POST`，否则返回 `405`。
- **脏状态默认阻止** — 有未提交改动时，切换分支必须显式传 `stash: true`。

## 开发

- **客户端改动**（`lib/client.js`）支持热更新：DSH 的 client-modules watcher 会自动重新哈希 bundle，刷新页面即可生效。
- **宿主改动**（`lib/index.js`）需要重启 `dsh web`。
- 包的 `dsh.client` 元数据声明了 `inject: ["@deepseek-ai/dsh-client-runtime"]` 和 `platform: "web"`，shell 据此解析并提供 `/plugins/dsh-git-status/client.js`。

## License

[MIT](./LICENSE)
