import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";

const execFileAsync = promisify(execFile);

const name = "git-status";
const inject = ["webServer", "workspaceRegistry"];

/** Run git with array args (no shell), cwd-locked to the repo. */
async function git(repoPath, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

/** Read the current branch name, falling back to a short hash when detached. */
async function currentBranch(repoPath) {
  try {
    const out = await git(repoPath, ["symbolic-ref", "--short", "HEAD"]);
    const value = out.trim();
    if (value) return value;
  } catch {
    // detached HEAD — fall through to short hash
  }
  const hash = await git(repoPath, ["rev-parse", "--short", "HEAD"]);
  return hash.trim();
}

/** Whether the working tree has uncommitted changes (tracked + untracked). */
async function isDirty(repoPath) {
  const out = await git(repoPath, ["status", "--porcelain"]);
  return out.trim().length > 0;
}

/** Local branch names, newest-committer first, with upstream track info. */
async function listBranches(repoPath) {
  const out = await git(repoPath, [
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname:short)%00%(upstream:track)",
    "refs/heads",
  ]);
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, track = ""] = line.split("\0");
      return { name, track };
    });
}

/** Full read-only status payload. */
async function readStatus(repoPath) {
  const [branch, dirty, branches] = await Promise.all([
    currentBranch(repoPath),
    isDirty(repoPath),
    listBranches(repoPath),
  ]);
  return { branch, dirty, branches };
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache",
  });
  res.end(data);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  return JSON.parse(text);
}

/**
 * Resolve the git repo path for a request.
 *
 * The client sends the current session's `cwd` (workspace path). We realpath
 * it and only accept it when it matches a registered Workspace path (or the
 * configured default repoPath) — never an arbitrary directory the browser
 * hands over. When no cwd is sent, fall back to the configured default.
 *
 * Returns null when the requested cwd is not an allowed workspace.
 */
async function resolveRepoPath(ctx, defaultPath, requestedCwd) {
  const allowed = new Set();
  for (const ws of ctx.workspaceRegistry.list()) {
    allowed.add(ws.path);
  }
  if (defaultPath) {
    try {
      allowed.add(await realpath(defaultPath));
    } catch {
      // default path is gone — keep the set as-is
    }
  }

  if (typeof requestedCwd !== "string" || requestedCwd.length === 0) {
    return defaultPath ?? null;
  }

  let target;
  try {
    target = await realpath(requestedCwd);
  } catch {
    return null;
  }
  return allowed.has(target) ? target : null;
}

function apply(ctx, config) {
  const defaultPath = config?.repoPath ?? process.cwd();

  // GET /git-status?cwd=… — read-only: { branch, dirty, branches: [{name, track}] }
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/git-status",
    handler: async (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      try {
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        const repoPath = await resolveRepoPath(ctx, defaultPath, url.searchParams.get("cwd"));
        if (repoPath === null) {
          sendJson(res, 400, { error: "not a registered workspace" });
          return;
        }
        sendJson(res, 200, await readStatus(repoPath));
      } catch (error) {
        sendJson(res, 500, { error: String(error) });
      }
    },
  }), "git-status: read route");

  // POST /git-checkout — switch branch: { branch, cwd?, stash?: boolean }
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/git-checkout",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { error: "invalid JSON body" });
        return;
      }

      const target = body?.branch;
      if (typeof target !== "string" || target.length === 0) {
        sendJson(res, 400, { error: "branch is required" });
        return;
      }

      try {
        const repoPath = await resolveRepoPath(ctx, defaultPath, body?.cwd);
        if (repoPath === null) {
          sendJson(res, 400, { error: "not a registered workspace" });
          return;
        }

        // Whitelist: target must be an enumerated local branch name.
        const branches = await listBranches(repoPath);
        const allowed = new Set(branches.map((b) => b.name));
        if (!allowed.has(target)) {
          sendJson(res, 400, { error: `not a local branch: ${target}` });
          return;
        }

        const dirty = await isDirty(repoPath);
        const wantStash = body?.stash === true;

        if (dirty && !wantStash) {
          sendJson(res, 409, { error: "dirty", dirty: true, branch: target });
          return;
        }

        let stashed = false;
        if (dirty && wantStash) {
          await git(repoPath, ["stash", "push", "--include-untracked"]);
          stashed = true;
        }

        try {
          await git(repoPath, ["switch", target]);
        } catch (error) {
          // Best effort: put the stash back so nothing is lost on a failed switch.
          if (stashed) {
            try {
              await git(repoPath, ["stash", "pop"]);
            } catch {
              // leave stash in place; report the original failure
            }
          }
          throw error;
        }

        sendJson(res, 200, {
          ...await readStatus(repoPath),
          stashed,
        });
      } catch (error) {
        sendJson(res, 500, { error: String(error) });
      }
    },
  }), "git-status: checkout route");
}

export { apply, inject, name };
