# dsh-git-status

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) **web** client plugin that shows the current git branch in the composer tool row and lets you switch branches without leaving the chat UI.

## Features

- **Live branch indicator** — a chip in the composer tool row (right of the access-mode selector) showing the current branch and a clean/dirty dot, polling every 3s.
- **Workspace-aware** — follows the active session's workspace (`cwd`), so switching workspaces switches the branch it shows.
- **Branch switching** — click to open a filterable list of *local* branches (newest committer first, with upstream track info); clicking a branch asks for confirmation.
- **Dirty-state safety** — if the working tree has uncommitted changes, checkout is blocked by default; an explicit **"Stash & switch"** action stashes (`git stash push --include-untracked`) before switching and restores it if the switch fails.
- **Secure by construction** — see [Security](#security).

## How it works

DSH plugins are npm packages with two halves:

| Half | File | Role |
|------|------|------|
| Host | [`lib/index.js`](./lib/index.js) | Cordis service that registers two HTTP routes and runs `git` |
| Client | [`lib/client.js`](./lib/client.js) | Module-loader bundle that injects a React component into the `conversation.input.left` slot |

The client fetches `GET /git-status?cwd=…` on mount and every 3s, and `POST`s `/git-checkout` to switch branches. No build step: the client bundle is hand-authored in the module-loader format and served verbatim.

## Install

> Requires the DSH web profile. The default web profile lives at `~/.dsh/profiles/web/`.

### 1. Get the source

```bash
git clone https://github.com/weiyuou-chowbus/dsh-git-status.git
# or place the extracted package anywhere, e.g. ~/dsh-git-status
```

### 2. Link it into your profile's `node_modules`

```bash
ln -sfn "$(pwd)/dsh-git-status" ~/.dsh/profiles/web/node_modules/dsh-git-status
```

### 3. Enable it in `cordis.patch.yml`

Edit `~/.dsh/profiles/web/cordis.patch.yml` and add an `insert` entry:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: git-status
      name: dsh-git-status
      config:
        repoPath: /absolute/path/to/your/default/repo
```

- `repoPath` is the **fallback** repository used when the active session has no workspace `cwd`. If you omit it, the plugin falls back to the DSH process's working directory.

### 4. Restart

```bash
npm exec @deepseek-ai/dsh web
```

Then refresh `http://127.0.0.1:3080`.

## Configuration

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `repoPath` | string | no | Absolute path to the default repo. Used as fallback when no session `cwd` is available. Defaults to the DSH process cwd. |

## HTTP API

| Route | Method | Body / Query | Response |
|-------|--------|--------------|----------|
| `/git-status` | `GET` | `?cwd=<workspace path>` | `{ branch, dirty, branches: [{ name, track }] }` |
| `/git-checkout` | `POST` | `{ branch, cwd?, stash? }` | updated status, or `409 { error: "dirty" }` when dirty and `stash` is not `true` |

## Security

The plugin hardens every git invocation and input path:

- **No shell** — all git commands use `child_process.execFile` with array args; nothing is ever interpolated into a shell string.
- **`cwd` whitelist** — the request's `cwd` is `realpath`-resolved and only accepted if it matches a registered Workspace path (from `workspaceRegistry.list()`) or the configured `repoPath`. Arbitrary directories from the browser are rejected with `400 not a registered workspace`.
- **Branch whitelist** — checkout targets must match a branch enumerated by `git for-each-ref refs/heads` (local branches only). A branch name is never passed to git before this check.
- **Side effects are POST-only** — the read route accepts only `GET`/`HEAD`; checkout is `POST` and returns `405` otherwise.
- **Dirty state is blocked by default** — switching with uncommitted changes requires an explicit `stash: true`.

## Development

- **Client changes** (`lib/client.js`) hot-reload: DSH's client-modules watcher rehashes the bundle automatically; refresh the page.
- **Host changes** (`lib/index.js`) require restarting `dsh web`.
- The package's `dsh.client` metadata declares `inject: ["@deepseek-ai/dsh-client-runtime"]` and `platform: "web"`, which is how the shell resolves and serves `/plugins/dsh-git-status/client.js`.

## License

[MIT](./LICENSE)
