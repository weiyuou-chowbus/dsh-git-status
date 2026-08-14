// dsh-git-status client half — composer tool-row git branch indicator,
// seated right of the permission (access mode) selector.
// Hand-authored in the module-loader bundle format (no build step needed):
// the shell serves this file verbatim and materializes it as a client plugin.
window.__ModuleLoader__.load({
  id: "dsh-git-status",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");
    var ReactJsxRuntime = require("react/jsx-runtime");

    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var useCallback = React.useCallback;

    // ---- styles (scoped under one data attribute to avoid collisions) ----
    var css = [
      ".dsh-git-status__wrap{position:relative}",
      ".dsh-git-status__btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:16px;cursor:pointer;white-space:nowrap;max-width:220px}",
      ".dsh-git-status__btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".dsh-git-status__btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}",
      ".dsh-git-status__dot{flex:none;width:7px;height:7px;border-radius:999px;background:var(--dsw-alias-state-success-primary)}",
      ".dsh-git-status__dot[data-dirty='true']{background:var(--dsw-alias-state-warn-primary,var(--dsw-alias-state-business-primary))}",
      ".dsh-git-status__name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-git-status__spinner{flex:none;color:var(--dsw-alias-label-tertiary)}",
      ".dsh-git-status__pop{position:absolute;left:0;bottom:calc(100% + 6px);z-index:50;width:280px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-shadow-lv1);overflow:hidden;display:flex;flex-direction:column}",
      ".dsh-git-status__search{padding:8px}",
      ".dsh-git-status__search input{width:100%;height:32px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:0 10px;box-sizing:border-box}",
      ".dsh-git-status__search input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}",
      ".dsh-git-status__list{max-height:260px;overflow-y:auto;padding:0 6px 6px}",
      ".dsh-git-status__row{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;text-align:left}",
      ".dsh-git-status__row:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".dsh-git-status__row[data-current='true']{color:var(--dsw-alias-state-business-primary)}",
      ".dsh-git-status__row-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-git-status__row-track{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px}",
      ".dsh-git-status__err{padding:8px 10px;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}",
      ".dsh-git-status__confirm{padding:8px;border-top:1px solid var(--dsw-alias-border-l2)}",
      ".dsh-git-status__confirm-msg{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);margin-bottom:6px}",
      ".dsh-git-status__confirm-actions{display:flex;gap:6px}",
      ".dsh-git-status__confirm-actions button{flex:1;min-height:28px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;cursor:pointer}",
      ".dsh-git-status__confirm-actions button[data-primary='true']{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}",
      ".dsh-git-status__confirm-actions button:disabled{opacity:.5;cursor:default}",
    ].join("\n");

    var tagId = "dsh-git-status/client.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-git-status";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    var POLL_MS = 3000;

    function GitStatusIndicator(props) {
      // The slot's standard props give us useSessions (a selector hook) and
      // the active sessionId; read the current session's cwd (workspace path).
      var useSessions = props.useSessions;
      var sessionId = props.sessionId;
      var cwd = typeof useSessions === "function"
        ? useSessions(function (s) { return sessionId === void 0 || sessionId === null ? void 0 : s.byId[sessionId] && s.byId[sessionId].cwd; })
        : void 0;

      var state = useState({ branch: null, dirty: false, branches: [], loading: true, error: null, notGit: false });
      var status = state[0];
      var setStatus = state[1];

      var openState = useState(false);
      var open = openState[0];
      var setOpen = openState[1];

      var filterState = useState("");
      var filter = filterState[0];
      var setFilter = filterState[1];

      var confirmState = useState(null);
      var confirm = confirmState[0];
      var setConfirm = confirmState[1];

      var busyState = useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];

      var actionErrorState = useState(null);
      var actionError = actionErrorState[0];
      var setActionError = actionErrorState[1];

      var wrapRef = useRef(null);

      var load = useCallback(function () {
        var q = cwd ? "?cwd=" + encodeURIComponent(cwd) : "";
        fetch("/git-status" + q, { cache: "no-store" })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .then(function (data) {
            setStatus({
              branch: data.branch,
              dirty: data.dirty,
              branches: data.branches || [],
              loading: false,
              error: null,
              notGit: data.notGit === true,
            });
          })
          .catch(function (e) {
            setStatus(function (prev) { return { branch: prev.branch, dirty: prev.dirty, branches: prev.branches, loading: false, error: String(e && e.message || e), notGit: prev.notGit }; });
          });
      }, [cwd]);

      useEffect(function () {
        load();
        var id = setInterval(load, POLL_MS);
        return function () { clearInterval(id); };
      }, [load]);

      // close on outside click
      useEffect(function () {
        if (!open) return;
        function onDoc(e) {
          if (wrapRef.current && !wrapRef.current.contains(e.target)) {
            setOpen(false);
            setFilter("");
            setConfirm(null);
          }
        }
        document.addEventListener("mousedown", onDoc);
        return function () { document.removeEventListener("mousedown", onDoc); };
      }, [open]);

      var doSwitch = useCallback(function (branch, stash) {
        setBusy(true);
        setActionError(null);
        fetch("/git-checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ branch: branch, stash: stash === true, cwd: cwd }),
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (res) {
            if (!res.ok) {
              var msg = res.d && res.d.error ? res.d.error : "HTTP error";
              setActionError(msg);
              return;
            }
            setConfirm(null);
            setFilter("");
            setOpen(false);
            load();
          })
          .catch(function (e) {
            setActionError(String(e && e.message || e));
          })
          .finally(function () {
            setBusy(false);
          });
      }, [load, cwd]);

      var filtered = (status.branches || []).filter(function (b) {
        if (!filter) return true;
        return b.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
      });

      var jsx = ReactJsxRuntime.jsx;
      var jsxs = ReactJsxRuntime.jsxs;
      var Fragment = ReactJsxRuntime.Fragment;

      if (status.notGit) return null;

      var currentLabel = status.loading
        ? "loading\u2026"
        : status.error
          ? "git error"
          : (status.branch || "(detached)");

      return jsx("div", {
        className: "dsh-git-status__wrap",
        ref: wrapRef,
        children: jsxs(Fragment, {
          children: [
            jsxs("button", {
              type: "button",
              className: "dsh-git-status__btn",
              title: "Git branch",
              onClick: function () { setOpen(!open); setActionError(null); },
              children: [
                jsx("span", { className: "dsh-git-status__dot", "data-dirty": status.dirty ? "true" : "false" }),
                jsx("span", { className: "dsh-git-status__name", children: currentLabel }),
                status.loading ? jsx("span", { className: "dsh-git-status__spinner", children: "\u22ef" }) : null,
              ],
            }),
            open ? jsxs("div", {
              className: "dsh-git-status__pop",
              children: [
                jsx("div", {
                  className: "dsh-git-status__search",
                  children: jsx("input", {
                    type: "text",
                    placeholder: "Filter branches\u2026",
                    value: filter,
                    autoFocus: true,
                    onChange: function (e) { setFilter(e.target.value); setConfirm(null); },
                  }),
                }),
                confirm
                  ? jsxs("div", {
                      className: "dsh-git-status__confirm",
                      children: [
                        jsx("div", { className: "dsh-git-status__confirm-msg", children: "Switch " + (status.branch || "(detached)") + " \u2192 " + confirm }),
                        jsxs("div", {
                          className: "dsh-git-status__confirm-actions",
                          children: [
                            jsx("button", {
                              type: "button",
                              "data-primary": "true",
                              disabled: busy,
                              onClick: function () { doSwitch(confirm, false); },
                              children: busy ? "Switching\u2026" : "Switch",
                            }),
                            status.dirty
                              ? jsx("button", {
                                  type: "button",
                                  disabled: busy,
                                  onClick: function () { doSwitch(confirm, true); },
                                  children: "Stash & switch",
                                })
                              : null,
                            jsx("button", {
                              type: "button",
                              disabled: busy,
                              onClick: function () { setConfirm(null); },
                              children: "Cancel",
                            }),
                          ],
                        }),
                      ],
                    })
                  : null,
                actionError ? jsx("div", { className: "dsh-git-status__err", children: actionError }) : null,
                jsx("div", {
                  className: "dsh-git-status__list",
                  children: filtered.length === 0
                    ? jsx("div", { className: "dsh-git-status__row", children: "No matching branches" })
                    : filtered.map(function (b) {
                        return jsxs("button", {
                          type: "button",
                          className: "dsh-git-status__row",
                          "data-current": b.name === status.branch ? "true" : "false",
                          key: b.name,
                          onClick: function () { setConfirm(b.name); setActionError(null); },
                          children: [
                            jsx("span", { className: "dsh-git-status__row-name", children: b.name }),
                            b.track ? jsx("span", { className: "dsh-git-status__row-track", children: b.track }) : null,
                          ],
                        });
                      }),
                }),
              ],
            }) : null,
          ],
        }),
      });
    }

    var inject = ["slots"];

    function apply(ctx) {
      ctx.slots.inject("conversation.input.left", function () {
        return ctx.slots.register({
          name: "conversation.input.left",
          id: "git-status",
          order: 100,
          label: "Git branch",
        }, GitStatusIndicator);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});