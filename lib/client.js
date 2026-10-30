window.__ModuleLoader__.load({id:"dsh-intent-recognition",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  PANEL_ID: () => PANEL_ID,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/App.tsx
var import_react7 = require("react");

// src/client/api.ts
var BASE = "/dsh-intent-recognition/api";
var ApiError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === void 0 ? {} : { "content-type": "application/json" },
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data;
}
var api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body ?? {}),
  put: (path, body) => request("PUT", path, body),
  del: (path) => request("DELETE", path)
};
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
async function downloadExport(scenarioId) {
  const res = await fetch(`${BASE}/scenarios/${scenarioId}/intents/export`);
  if (!res.ok) throw new ApiError(res.status, "\u5BFC\u51FA\u5931\u8D25");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "intents.xlsx";
  a.click();
  URL.revokeObjectURL(a.href);
}

// src/client/ConnectionTab.tsx
var import_react2 = require("react");

// src/client/components.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function ClampedText(props) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const text = props.text;
  if (text === "") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ir-muted", children: "\u2014" });
  const threshold = props.threshold ?? 100;
  const clampable = text.length > threshold;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "ir-clamped", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "span",
      {
        className: clampable && !open ? "ir-desc-clamp" : void 0,
        style: clampable && !open ? { WebkitLineClamp: props.lines ?? 2 } : void 0,
        children: text
      }
    ),
    clampable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "ir-link", onClick: () => setOpen(!open), children: open ? "\u6536\u8D77" : "\u5C55\u5F00" })
  ] });
}
function Modal(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ir-modal-mask", onClick: props.onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ir-modal", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: props.title }),
    props.children,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ir-modal-actions", children: props.footer })
  ] }) });
}
function Field(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ir-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: props.label }),
    props.children,
    props.hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ir-muted", children: props.hint }) : null
  ] });
}
function Toggle(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "ir-row", style: { gap: 6, cursor: "pointer", fontSize: 13 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: props.checked, onChange: (e) => props.onChange(e.target.checked) }),
    props.label
  ] });
}
var toList = (s) => s.split(/[\n、,，;；|]/).map((x) => x.trim()).filter(Boolean);
var fromList = (a, sep = "\u3001") => (a ?? []).join(sep);

// src/client/ConnectionTab.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var emptyForm = { host: "127.0.0.1", port: "5432", database: "dsh_intent", user: "postgres", password: "", ssl: false };
var SOURCE_LABEL = {
  page: "\u9875\u9762\u914D\u7F6E\uFF08\u672C\u6587\u4EF6\u4F18\u5148\uFF09",
  bundle: "\u63D2\u4EF6\u8865\u4E01 cordis.patch.yml"
};
function ConnectionTab(props) {
  const [state, setState] = (0, import_react2.useState)(null);
  const [form, setForm] = (0, import_react2.useState)({ ...emptyForm });
  const [rawMode, setRawMode] = (0, import_react2.useState)(false);
  const [rawUrl, setRawUrl] = (0, import_react2.useState)("");
  const [error, setError] = (0, import_react2.useState)("");
  const [notice, setNotice] = (0, import_react2.useState)("");
  const [busy, setBusy] = (0, import_react2.useState)("");
  const [dropOpen, setDropOpen] = (0, import_react2.useState)(false);
  const [dropConfirm, setDropConfirm] = (0, import_react2.useState)("");
  const reload = async () => {
    const s = await api.get("/connection");
    setState(s);
    setForm({
      host: s.fields.host,
      port: String(s.fields.port),
      database: s.fields.database,
      user: s.fields.user,
      password: s.fields.password,
      ssl: s.fields.ssl
    });
    setRawUrl(s.databaseUrl);
  };
  (0, import_react2.useEffect)(() => {
    reload().catch((e) => setError(e.message));
  }, []);
  const payload = () => rawMode ? { databaseUrl: rawUrl } : { host: form.host, port: Number(form.port) || 5432, database: form.database, user: form.user, password: form.password, ssl: form.ssl };
  const run = (kind, fn) => {
    setBusy(kind);
    setError("");
    setNotice("");
    fn().catch((e) => setError(e.message)).finally(() => setBusy(""));
  };
  const doTest = () => run("test", async () => {
    const d = await api.post("/connection/test", payload());
    setNotice(
      d.pgvector ? `\u8FDE\u63A5\u6210\u529F\uFF08${d.latency_ms}ms\uFF09\uFF0Cpgvector \u6269\u5C55\u53EF\u7528` : `\u8FDE\u63A5\u6210\u529F\uFF08${d.latency_ms}ms\uFF09\uFF1B\u4F46\u8BE5\u5B9E\u4F8B\u672A\u5B89\u88C5 pgvector \u6269\u5C55\uFF0C\u5C422 \u5411\u91CF\u68C0\u7D22\u4E0D\u53EF\u7528`
    );
  });
  const doSave = () => run("save", async () => {
    await api.put("/connection", payload());
    await reload();
    props.onChanged();
    setNotice("\u5DF2\u4FDD\u5B58\u5E76\u5207\u6362\u5230\u65B0\u8FDE\u63A5\uFF0C\u5373\u65F6\u751F\u6548\uFF08\u65E0\u9700\u91CD\u542F\u63D2\u4EF6\u6216\u684C\u9762\u7AEF\uFF09");
  });
  const doReset = () => run("save", async () => {
    await api.del("/connection");
    await reload();
    props.onChanged();
    setNotice("\u5DF2\u6E05\u9664\u9875\u9762\u914D\u7F6E\uFF0C\u56DE\u9000\u5230\u63D2\u4EF6\u8865\u4E01 cordis.patch.yml \u4E2D\u7684\u8FDE\u63A5\u4E32");
  });
  const dropTarget = rawMode ? (() => {
    try {
      return decodeURIComponent(rawUrl.split("?")[0].split("/").pop() ?? "");
    } catch {
      return rawUrl.split("?")[0].split("/").pop() ?? "";
    }
  })() : form.database.trim();
  const doDbCheck = () => run("db", async () => {
    const d = await api.post("/connection/database/check", payload());
    setNotice(d.exists ? `\u6570\u636E\u5E93 ${d.database} \u5B58\u5728\uFF0C\u53EF\u76F4\u63A5\u300C\u6D4B\u8BD5\u5E76\u4FDD\u5B58\u300D` : `\u6570\u636E\u5E93 ${d.database} \u4E0D\u5B58\u5728\uFF0C\u53EF\u70B9\u51FB\u4E0B\u65B9\u300C\u521B\u5EFA\u6570\u636E\u5E93\u300D\u4E00\u952E\u521B\u5EFA`);
  });
  const doDbCreate = () => run("db", async () => {
    const d = await api.post("/connection/database/create", payload());
    await reload();
    setNotice(
      `\u6570\u636E\u5E93 ${d.database} \u5DF2\u521B\u5EFA` + (d.vector ? "\uFF0Cpgvector \u6269\u5C55\u5DF2\u542F\u7528" : "\uFF1B\u4F46 pgvector \u6269\u5C55\u5B89\u88C5\u5931\u8D25\uFF08\u9700\u5B9E\u4F8B\u652F\u6301 pgvector\uFF0C\u5C422 \u6682\u4E0D\u53EF\u7528\uFF09") + (d.tables ? "\uFF0C\u8868\u7ED3\u6784\u5DF2\u521D\u59CB\u5316\u5B8C\u6210\uFF0C\u53EF\u76F4\u63A5\u300C\u6D4B\u8BD5\u5E76\u4FDD\u5B58\u300D\u5207\u6362\u4F7F\u7528" : "\uFF1B\u8868\u7ED3\u6784\u521D\u59CB\u5316\u5931\u8D25\uFF0C\u4FDD\u5B58\u5207\u6362\u65F6\u4F1A\u81EA\u52A8\u91CD\u8BD5")
    );
  });
  const doDbDrop = () => run("db", async () => {
    const d = await api.post("/connection/database/drop", { ...payload(), confirm: dropConfirm.trim() });
    setDropOpen(false);
    setDropConfirm("");
    await reload();
    props.onChanged();
    setNotice(`\u6570\u636E\u5E93 ${d.database} \u5DF2\u5220\u9664`);
  });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 14 }, children: [
    error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ir-error", children: error }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ir-ok", children: notice }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ir-card pad", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ir-card-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u8FDE\u63A5\u72B6\u6001" }),
        state && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `ir-badge ${state.connected ? "running" : "err"}`, children: state.connected ? "\u25CF \u5DF2\u8FDE\u63A5" : "\u25CF \u672A\u8FDE\u63A5" })
      ] }),
      state ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("dl", { className: "ir-kv", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u914D\u7F6E\u6765\u6E90" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: SOURCE_LABEL[state.source] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u8FDE\u63A5\u4E32" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: state.databaseUrl }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u914D\u7F6E\u6587\u4EF6" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: state.filePath }) }),
        state.error && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u72B6\u6001\u4FE1\u606F" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { className: state.connected ? "" : "ir-error", children: state.error })
        ] })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ir-muted", style: { marginTop: 8 }, children: "\u6B63\u5728\u8BFB\u53D6\u8FDE\u63A5\u72B6\u6001\u2026" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ir-card pad", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ir-card-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u8FDE\u63A5\u914D\u7F6E" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ir-btn", onClick: () => setRawMode(!rawMode), children: rawMode ? "\u5207\u6362\u4E3A\u8868\u5355\u586B\u5199" : "\u5207\u6362\u4E3A\u8FDE\u63A5\u4E32\u586B\u5199" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { marginTop: 12 }, children: rawMode ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "PostgreSQL \u8FDE\u63A5\u4E32", hint: "postgres://\u7528\u6237:\u5BC6\u7801@\u4E3B\u673A:\u7AEF\u53E3/\u6570\u636E\u5E93\uFF1B\u5BC6\u7801\u586B *** \u8868\u793A\u6CBF\u7528\u5F53\u524D\u5DF2\u4FDD\u5B58\u7684\u5BC6\u7801", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          className: "ir-input",
          style: { fontFamily: "monospace" },
          value: rawUrl,
          onChange: (e) => setRawUrl(e.target.value),
          placeholder: "postgres://postgres:postgres@127.0.0.1:5432/dsh_intent"
        }
      ) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ir-grid2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u4E3B\u673A\u5730\u5740", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "ir-input", value: form.host, onChange: (e) => setForm({ ...form, host: e.target.value }), placeholder: "127.0.0.1" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u7AEF\u53E3", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "ir-input", value: form.port, onChange: (e) => setForm({ ...form, port: e.target.value }), placeholder: "5432" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u6570\u636E\u5E93\u540D", hint: "\u5E93\u4E0D\u5B58\u5728\u65F6\u53EF\u7528\u4E0B\u65B9\u300C\u6570\u636E\u5E93\u7EF4\u62A4\u300D\u4E00\u952E\u68C0\u67E5/\u521B\u5EFA", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "ir-input", value: form.database, onChange: (e) => setForm({ ...form, database: e.target.value }), placeholder: "dsh_intent" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u7528\u6237\u540D", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "ir-input", value: form.user, onChange: (e) => setForm({ ...form, user: e.target.value }), placeholder: "postgres" }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u5BC6\u7801", hint: form.password === "***" ? "\u663E\u793A *** \u8868\u793A\u5DF2\u4FDD\u5B58\uFF0C\u91CD\u65B0\u8F93\u5165\u624D\u4F1A\u8986\u76D6" : "\u53EF\u7559\u7A7A", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "ir-input", type: "password", value: form.password, onChange: (e) => setForm({ ...form, password: e.target.value }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Toggle, { checked: form.ssl, onChange: (v) => setForm({ ...form, ssl: v }), label: "\u4F7F\u7528 SSL \u8FDE\u63A5\uFF08sslmode=require\uFF09" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ir-toolbar", style: { marginTop: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ir-btn", disabled: busy !== "", onClick: doTest, children: busy === "test" ? "\u6D4B\u8BD5\u4E2D\u2026" : "\u6D4B\u8BD5\u8FDE\u63A5" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ir-btn primary", disabled: busy !== "", onClick: doSave, children: busy === "save" ? "\u4FDD\u5B58\u4E2D\u2026" : "\u6D4B\u8BD5\u5E76\u4FDD\u5B58" }),
        state?.source === "page" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            className: "ir-btn danger",
            disabled: busy !== "",
            onClick: () => {
              if (confirm("\u6E05\u9664\u9875\u9762\u4FDD\u5B58\u7684\u6570\u636E\u5E93\u914D\u7F6E\uFF0C\u56DE\u9000\u5230 cordis.patch.yml \u4E2D\u7684\u8FDE\u63A5\u4E32\uFF1F")) doReset();
            },
            children: "\u6E05\u9664\u9875\u9762\u914D\u7F6E"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ir-card pad", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ir-card-title", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u6570\u636E\u5E93\u7EF4\u62A4" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ir-muted", style: { margin: "6px 0" }, children: "\u6309\u4E0A\u65B9\u8868\u5355\uFF08\u6216\u8FDE\u63A5\u4E32\uFF09\u6307\u5411\u7684\u670D\u52A1\u5668\u4E0E\u8D26\u53F7\u64CD\u4F5C\u6570\u636E\u5E93\uFF1A\u68C0\u67E5\u5E93\u662F\u5426\u5B58\u5728\u3001\u4E00\u952E\u5EFA\u5E93\uFF08\u81EA\u52A8\u542F\u7528 pgvector \u5E76\u521D\u59CB\u5316\u5168\u90E8\u8868\u7ED3\u6784\uFF09\u3001\u5220\u9664\u5E93\u3002\u5373\u4F7F\u5F53\u524D\u8FDE\u63A5\u5C1A\u672A\u751F\u6548\u4E5F\u53EF\u4F7F\u7528\u2014\u2014\u8FDE\u4E0A\u670D\u52A1\u5668\u4F46\u5E93\u4E0D\u5B58\u5728\u65F6\uFF0C\u6B63\u662F\u7528\u8FD9\u91CC\u81EA\u6551\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ir-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ir-btn", disabled: busy !== "", onClick: doDbCheck, children: "\u68C0\u67E5\u6570\u636E\u5E93" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ir-btn primary", disabled: busy !== "", onClick: doDbCreate, children: busy === "db" ? "\u6267\u884C\u4E2D\u2026" : "\u521B\u5EFA\u6570\u636E\u5E93" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            className: "ir-btn danger",
            disabled: busy !== "",
            onClick: () => {
              setDropConfirm("");
              setDropOpen(true);
            },
            children: "\u5220\u9664\u6570\u636E\u5E93"
          }
        )
      ] })
    ] }),
    dropOpen && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      Modal,
      {
        title: "\u5220\u9664\u6570\u636E\u5E93\uFF08\u9AD8\u5371\u64CD\u4F5C\uFF09",
        onClose: () => setDropOpen(false),
        footer: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ir-btn", onClick: () => setDropOpen(false), children: "\u53D6\u6D88" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              className: "ir-btn danger",
              disabled: busy !== "" || dropTarget === "" || dropConfirm.trim() !== dropTarget,
              onClick: doDbDrop,
              children: busy === "db" ? "\u5220\u9664\u4E2D\u2026" : "\u786E\u8BA4\u5220\u9664"
            }
          )
        ] }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ir-error", style: { lineHeight: 1.8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: "\u8BF7\u8C28\u614E\u64CD\u4F5C\uFF1A\u5220\u9664\u6570\u636E\u5E93\u5C06\u6E05\u7A7A\u5176\u4E2D\u5168\u90E8\u610F\u56FE\u3001\u670D\u52A1\u3001\u5411\u91CF\u4E0E\u65E5\u5FD7\u6570\u636E\uFF0C\u4E14\u4E0D\u53EF\u6062\u590D\uFF01" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
            "\u5C06\u6309\u4E0A\u65B9",
            rawMode ? "\u8FDE\u63A5\u4E32" : "\u8868\u5355",
            "\u6307\u5411\u7684\u670D\u52A1\u5668\uFF0C\u5220\u9664\u6570\u636E\u5E93\u300C",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: dropTarget || "\uFF08\u672A\u8BC6\u522B\uFF09" }),
            "\u300D\u3002 \u82E5\u5220\u9664\u7684\u6B63\u662F\u5F53\u524D\u6B63\u5728\u4F7F\u7528\u7684\u5E93\uFF0C\u63D2\u4EF6\u4F1A\u7ACB\u5373\u65AD\u5F00\uFF0C\u9700\u8981\u91CD\u65B0\u914D\u7F6E\u8FDE\u63A5\u3002"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: `\u8BF7\u8F93\u5165\u6570\u636E\u5E93\u540D\u300C${dropTarget}\u300D\u4EE5\u786E\u8BA4\u5220\u9664`, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "input",
            {
              className: "ir-input",
              value: dropConfirm,
              onChange: (e) => setDropConfirm(e.target.value),
              placeholder: dropTarget
            }
          ) })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ir-card pad", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ir-card-title", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u4F7F\u7528\u8BF4\u660E" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ir-muted", style: { marginTop: 8, lineHeight: 1.9 }, children: [
        "1. \u6570\u636E\u5E93\u9700\u8981\u5B89\u88C5 pgvector \u6269\u5C55\uFF08\u5C422 \u5411\u91CF\u68C0\u7D22\u4F9D\u8D56\uFF09\uFF1B\u6CA1\u6709\u73B0\u6210\u5B9E\u4F8B\u65F6\u53EF\u7528\u63D2\u4EF6\u5305\u5185\u7684 docker-compose.yml \u4E00\u952E\u542F\u52A8\u3002",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
        "2. \u914D\u7F6E\u751F\u6548\u4F18\u5148\u7EA7\uFF1A\u672C\u9875\u9762\u4FDD\u5B58\u7684\u914D\u7F6E > cordis.patch.yml \u8865\u4E01 > \u5185\u7F6E\u9ED8\u8BA4\u503C\u3002\u4FDD\u5B58\u540E\u5373\u65F6\u70ED\u5207\u6362\uFF0C\u65E0\u9700\u91CD\u542F\u3002",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
        "3. \u4FEE\u6539\u8FDE\u63A5\u540E\u5411\u91CF\u7EF4\u5EA6\u4E0D\u53D8\uFF08\u4ECD\u4E3A\u672C\u63D2\u4EF6\u521D\u59CB\u5316\u65F6\u7684 embeddingDim\uFF09\uFF1B\u5982\u9700\u53D8\u66F4\u7EF4\u5EA6\uFF0C\u8BF7\u8C03\u6574\u8865\u4E01\u4E2D\u7684 embeddingDim \u5E76\u91CD\u5EFA\u5411\u91CF\u3002",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
        "4. \u81EA\u52A8\u5EFA\u8868\u59CB\u7EC8\u5F00\u542F\uFF1A\u300C\u521B\u5EFA\u6570\u636E\u5E93\u300D\u4F1A\u4E00\u6B21\u6027\u5B8C\u6210\u5EFA\u5E93 + pgvector \u6269\u5C55 + ir_* \u8868\u4E0E\u7D22\u5F15\uFF1B\u624B\u52A8 createdb \u7684\u5E93\u5728\u300C\u6D4B\u8BD5\u5E76\u4FDD\u5B58\u300D\u5207\u6362\u65F6\u4E5F\u4F1A\u81EA\u52A8\u8865\u5EFA\u3002",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
        "5. \u300C\u5220\u9664\u6570\u636E\u5E93\u300D\u4E3A\u9AD8\u5371\u64CD\u4F5C\uFF0C\u9700\u8F93\u5165\u5E93\u540D\u4E8C\u6B21\u786E\u8BA4\uFF1B\u7CFB\u7EDF\u5E93\uFF08postgres/template*\uFF09\u4E0D\u5141\u8BB8\u64CD\u4F5C\u3002\u82E5\u5220\u7684\u662F\u5F53\u524D\u5728\u7528\u7684\u5E93\uFF0C\u63D2\u4EF6\u4F1A\u65AD\u5F00\u5E76\u7B49\u5F85\u91CD\u65B0\u914D\u7F6E\u3002"
      ] })
    ] })
  ] });
}

// src/client/IntentsTab.tsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var emptyIntent = {
  name: "",
  code: "",
  description: "",
  examples: "",
  keywords: "",
  blacklist: "",
  whitelist: "",
  route_type: "none",
  route_target: "",
  route_script: ""
};
var WORKFLOW_HELP = `\u5DE5\u4F5C\u6D41\u811A\u672C\u6A21\u677F\u4F7F\u7528\u8BF4\u660E
\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014
\u811A\u672C\u662F\u4E00\u6BB5\u666E\u901A JavaScript\uFF08\u652F\u6301\u9876\u5C42 await\uFF09\uFF0C\u7531 DSH \u5DE5\u4F5C\u6D41\u5F15\u64CE\u5728\u610F\u56FE\u547D\u4E2D\u65F6\u6267\u884C\uFF0C\u6700\u540E\u7684 return \u503C\u4F5C\u4E3A\u8DEF\u7531\u7ED3\u679C\u8FD4\u56DE\u7ED9\u4E3B Agent\u3002

\u811A\u672C\u5185\u53EF\u7528\u7684\u5168\u5C40\u53D8\u91CF\uFF1A
\u2022 args.query        \u7528\u6237\u539F\u59CB query\uFF08\u5B57\u7B26\u4E32\uFF09
\u2022 args.intent       \u547D\u4E2D\u7684\u610F\u56FE { code, name }
\u2022 args.confidence   \u7F6E\u4FE1\u5EA6\uFF080~1\uFF09
\u2022 args.matched_layer \u547D\u4E2D\u5C42\uFF08l1/l3/l4/l5\uFF09
\u2022 args.slots        \u5C425 \u62BD\u53D6\u7684\u69FD\u4F4D\u5BF9\u8C61\uFF08\u65E0\u69FD\u4F4D\u65F6\u4E3A {}\uFF09
\u2022 args.context      \u5BF9\u8BDD\u4E0A\u4E0B\u6587\uFF08\u5B57\u7B26\u4E32\u6570\u7EC4\uFF09
\u2022 agent(prompt, options?)  \u542F\u52A8\u4E00\u4E2A\u5B50 Agent\uFF0C\u8FD4\u56DE\u5176\u7ED3\u679C\uFF08\u7528\u4E8E\u7F16\u6392\u4E0B\u6E38\u667A\u80FD\u4F53\uFF09
\u2022 meta              \u672C\u6B21\u8FD0\u884C\u7684\u8EAB\u4EFD\u5757\uFF08\u53EA\u8BFB\uFF09

\u793A\u4F8B\uFF1A\u6839\u636E\u69FD\u4F4D\u7F16\u6392\u4E24\u4E2A\u5B50\u4EE3\u7406\u5E76\u6C47\u603B
  const slots = args.slots
  const a = await agent(\`\u67E5\u8BE2\u8D26\u6237 \${slots.\u8D26\u6237 ?? '\u9ED8\u8BA4\u8D26\u6237'} \u7684\u4F59\u989D\`)
  const b = await agent(\`\u67E5\u8BE2\u8D26\u6237 \${slots.\u8D26\u6237 ?? '\u9ED8\u8BA4\u8D26\u6237'} \u7684\u8FD1\u671F\u4EA4\u6613\`)
  return { balance: a, recent: b, intent: args.intent.code }

\u6CE8\u610F\uFF1A\u811A\u672C\u4EE5 return \u7ED3\u675F\uFF1B\u4E0D\u8981\u5728\u811A\u672C\u91CC\u505A\u65E0\u5173\u526F\u4F5C\u7528\uFF1B\u8FD0\u884C\u5931\u8D25\u4F1A\u628A\u9519\u8BEF\u4FE1\u606F\u8FD4\u56DE\u7ED9\u4E3B Agent\u3002`;
var ROUTE_TYPE_OPTIONS = [
  { value: "none", label: "\u4E0D\u8DEF\u7531", hint: "\u53EA\u8FD4\u56DE\u8BC6\u522B\u7ED3\u679C\uFF0C\u7531\u4E3B Agent \u81EA\u884C\u5904\u7406" },
  { value: "workflow", label: "\u5DE5\u4F5C\u6D41", hint: "\u547D\u4E2D\u540E\u6267\u884C\u4E0B\u65B9\u811A\u672C\u6A21\u677F\uFF08DSH workflow \u5F15\u64CE\uFF09" },
  { value: "subagent", label: "\u5B50\u4EE3\u7406", hint: "\u547D\u4E2D\u540E\u6309 preset id \u6D3E\u53D1\u5B50\u4EE3\u7406\uFF08target \u586B preset id\uFF09" },
  { value: "service", label: "\u63D2\u4EF6\u670D\u52A1", hint: "\u8C03\u7528\u5176\u4ED6\u63D2\u4EF6\u7684 Cordis \u670D\u52A1\uFF08target \u586B \u670D\u52A1\u540D.\u65B9\u6CD5\u540D\uFF09" }
];
function IntentsTab() {
  const [scenarios, setScenarios] = (0, import_react3.useState)([]);
  const [activeId, setActiveId] = (0, import_react3.useState)("");
  const [intents, setIntents] = (0, import_react3.useState)([]);
  const [error, setError] = (0, import_react3.useState)("");
  const [notice, setNotice] = (0, import_react3.useState)("");
  const [scenarioForm, setScenarioForm] = (0, import_react3.useState)(null);
  const [intentForm, setIntentForm] = (0, import_react3.useState)(null);
  const [ruleForm, setRuleForm] = (0, import_react3.useState)(null);
  const [rebuildOpen, setRebuildOpen] = (0, import_react3.useState)(false);
  const [embModels, setEmbModels] = (0, import_react3.useState)([]);
  const [embModelId, setEmbModelId] = (0, import_react3.useState)("");
  const fileRef = (0, import_react3.useRef)(null);
  const importMode = (0, import_react3.useRef)("merge");
  const active = scenarios.find((s) => s.id === activeId);
  const reloadScenarios = async () => {
    const d = await api.get("/scenarios");
    setScenarios(d.scenarios);
    if (!activeId && d.scenarios[0]) setActiveId(d.scenarios[0].id);
    if (activeId && !d.scenarios.some((s) => s.id === activeId)) setActiveId(d.scenarios[0]?.id ?? "");
  };
  const reloadIntents = async (sid) => {
    const d = await api.get(`/scenarios/${sid}/intents`);
    setIntents(d.intents);
  };
  (0, import_react3.useEffect)(() => {
    reloadScenarios().catch((e) => setError(e.message));
  }, []);
  (0, import_react3.useEffect)(() => {
    if (activeId) reloadIntents(activeId).catch((e) => setError(e.message));
  }, [activeId]);
  const run = (fn, okMsg) => {
    setError("");
    setNotice("");
    fn().then(() => {
      if (okMsg) setNotice(okMsg);
    }).catch((e) => setError(e.message));
  };
  const saveScenario = () => run(async () => {
    if (!scenarioForm) return;
    if (scenarioForm.id) await api.put(`/scenarios/${scenarioForm.id}`, scenarioForm);
    else await api.post("/scenarios", scenarioForm);
    setScenarioForm(null);
    await reloadScenarios();
  }, "\u573A\u666F\u5DF2\u4FDD\u5B58");
  const saveIntent = () => run(async () => {
    if (!intentForm || !activeId) return;
    const payload = {
      name: intentForm.name,
      code: intentForm.code,
      description: intentForm.description,
      examples: toList(intentForm.examples),
      keywords: toList(intentForm.keywords),
      blacklist: toList(intentForm.blacklist),
      whitelist: toList(intentForm.whitelist),
      route: {
        type: intentForm.route_type,
        target: intentForm.route_target,
        ...intentForm.route_type === "workflow" ? { script: intentForm.route_script } : {}
      }
    };
    if (intentForm.id) await api.put(`/intents/${intentForm.id}`, payload);
    else await api.post(`/scenarios/${activeId}/intents`, payload);
    setIntentForm(null);
    await reloadIntents(activeId);
    await reloadScenarios();
  }, "\u610F\u56FE\u5DF2\u4FDD\u5B58");
  const saveRules = () => run(async () => {
    if (!ruleForm || !activeId) return;
    await api.put(`/scenarios/${activeId}`, {
      rule_config: {
        greeting_keywords: toList(ruleForm.greeting),
        exit_keywords: toList(ruleForm.exit),
        command_patterns: toList(ruleForm.command)
      }
    });
    setRuleForm(null);
    await reloadScenarios();
  }, "\u89C4\u5219\u914D\u7F6E\u5DF2\u4FDD\u5B58");
  const onImportFile = (file) => run(async () => {
    if (!activeId) return;
    const b64 = await fileToBase64(file);
    const d = await api.post(`/scenarios/${activeId}/intents/import`, {
      file_base64: b64,
      mode: importMode.current
    });
    await reloadIntents(activeId);
    await reloadScenarios();
    setNotice(`\u5DF2\u5BFC\u5165 ${d.imported} \u6761\u610F\u56FE\uFF08${importMode.current === "replace" ? "\u8986\u76D6" : "\u5408\u5E76"}\u6A21\u5F0F\uFF09`);
  });
  const doRebuild = () => run(async () => {
    if (!activeId || !embModelId) return;
    const d = await api.post(`/scenarios/${activeId}/embeddings/rebuild`, { model_id: embModelId });
    setRebuildOpen(false);
    await reloadScenarios();
    setNotice(`\u5DF2\u91CD\u5EFA ${d.embedded} \u6761\u793A\u4F8B\u5411\u91CF`);
  });
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ir-layout", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ir-side", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ir-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { style: { fontSize: 14 }, children: "\u573A\u666F" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn", onClick: () => setScenarioForm({ name: "", description: "" }), children: "\u65B0\u5EFA\u573A\u666F" })
      ] }),
      scenarios.map((s) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "div",
        {
          className: `ir-card ${s.id === activeId ? "selected" : ""}`,
          style: { cursor: "pointer" },
          onClick: () => setActiveId(s.id),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ir-card-title", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: s.name }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "ir-row", style: { gap: 4, flexWrap: "nowrap" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn", onClick: (e) => {
                  e.stopPropagation();
                  setScenarioForm({ id: s.id, name: s.name, description: s.description });
                }, children: "\u7F16\u8F91" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn danger", onClick: (e) => {
                  e.stopPropagation();
                  if (confirm(`\u5220\u9664\u573A\u666F\u300C${s.name}\u300D\u53CA\u5176\u5168\u90E8\u610F\u56FE\u4E0E\u670D\u52A1\uFF1F`)) {
                    run(async () => {
                      await api.del(`/scenarios/${s.id}`);
                      await reloadScenarios();
                    });
                  }
                }, children: "\u5220" })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "ir-muted ir-card-desc", children: s.description || "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ir-muted", children: [
              "\u610F\u56FE ",
              s.intent_count,
              " \xB7 \u5411\u91CF ",
              s.embedding_count
            ] })
          ]
        },
        s.id
      )),
      scenarios.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "ir-muted", children: "\u8FD8\u6CA1\u6709\u573A\u666F\uFF0C\u5148\u65B0\u5EFA\u4E00\u4E2A\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ir-main", children: [
      error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "ir-error", children: error }),
      notice && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "ir-ok", children: notice }),
      active && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ir-toolbar", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn primary", onClick: () => setIntentForm({ ...emptyIntent }), children: "\u65B0\u5EFA\u610F\u56FE" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn", onClick: () => downloadExport(active.id).catch((e) => setError(e.message)), children: "\u5BFC\u51FA Excel" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { className: "ir-select", defaultValue: "merge", onChange: (e) => {
            importMode.current = e.target.value;
          }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "merge", children: "\u5BFC\u5165:\u5408\u5E76" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "replace", children: "\u5BFC\u5165:\u8986\u76D6" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn", onClick: () => fileRef.current?.click(), children: "\u5BFC\u5165 Excel" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              ref: fileRef,
              type: "file",
              accept: ".xlsx",
              style: { display: "none" },
              onChange: (e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = "";
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn", onClick: () => {
            api.get("/models?kind=embedding").then((d) => {
              setEmbModels(d.models);
              setEmbModelId(d.models[0]?.id ?? "");
              setRebuildOpen(true);
            }).catch((e) => setError(e.message));
          }, children: "\u91CD\u5EFA\u5411\u91CF" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn", onClick: () => setRuleForm({
            greeting: fromList(active.rule_config?.greeting_keywords),
            exit: fromList(active.rule_config?.exit_keywords),
            command: fromList(active.rule_config?.command_patterns)
          }), children: "\u5C421 \u89C4\u5219\u914D\u7F6E" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "ir-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("table", { className: "ir-table", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("th", { children: "\u540D\u79F0" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("th", { children: "\u7F16\u7801" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("th", { children: "\u63CF\u8FF0" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("th", { children: "\u793A\u4F8B" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("th", { children: "\u5173\u952E\u8BCD" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("th", { children: "\u8DEF\u7531\u76EE\u6807" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("th", {})
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tbody", { children: [
            intents.map((i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { children: i.name }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: i.code }) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { className: "ir-muted ir-desc-cell", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ClampedText, { text: i.description }) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("td", { children: [
                i.examples.length,
                " \u6761"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { children: fromList(i.keywords) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { className: "ir-muted", children: i.route?.type === "none" || !i.route ? "\u2014" : `${i.route.type}${i.route.target ? `: ${i.route.target}` : ""}` }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("td", { style: { whiteSpace: "nowrap" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn", onClick: () => setIntentForm({
                  id: i.id,
                  name: i.name,
                  code: i.code,
                  description: i.description,
                  examples: i.examples.join("\n"),
                  keywords: fromList(i.keywords),
                  blacklist: fromList(i.blacklist),
                  whitelist: fromList(i.whitelist),
                  route_type: i.route?.type ?? "none",
                  route_target: i.route?.target ?? "",
                  route_script: i.route?.script ?? ""
                }), children: "\u7F16\u8F91" }),
                " ",
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn danger", onClick: () => {
                  if (confirm(`\u5220\u9664\u610F\u56FE\u300C${i.name}\u300D\uFF1F`)) {
                    run(async () => {
                      await api.del(`/intents/${i.id}`);
                      await reloadIntents(active.id);
                      await reloadScenarios();
                    });
                  }
                }, children: "\u5220" })
              ] })
            ] }, i.id)),
            intents.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { colSpan: 7, className: "ir-muted", children: "\u8BE5\u573A\u666F\u6682\u65E0\u610F\u56FE\uFF0C\u53EF\u65B0\u5EFA\u6216\u4ECE Excel \u5BFC\u5165\u3002" }) })
          ] })
        ] }) })
      ] }),
      !active && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "ir-muted", children: "\u8BF7\u9009\u62E9\u5DE6\u4FA7\u573A\u666F\u3002" }),
      scenarioForm && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        Modal,
        {
          title: scenarioForm.id ? "\u7F16\u8F91\u573A\u666F" : "\u65B0\u5EFA\u573A\u666F",
          onClose: () => setScenarioForm(null),
          footer: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn", onClick: () => setScenarioForm(null), children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn primary", onClick: saveScenario, children: "\u4FDD\u5B58" })
          ] }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u573A\u666F\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "ir-input",
                value: scenarioForm.name,
                onChange: (e) => setScenarioForm({ ...scenarioForm, name: e.target.value })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u573A\u666F\u63CF\u8FF0", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "textarea",
              {
                className: "ir-textarea",
                value: scenarioForm.description,
                onChange: (e) => setScenarioForm({ ...scenarioForm, description: e.target.value })
              }
            ) })
          ]
        }
      ),
      intentForm && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        Modal,
        {
          title: intentForm.id ? "\u7F16\u8F91\u610F\u56FE" : "\u65B0\u5EFA\u610F\u56FE",
          onClose: () => setIntentForm(null),
          footer: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn", onClick: () => setIntentForm(null), children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn primary", onClick: saveIntent, children: "\u4FDD\u5B58" })
          ] }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ir-grid2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u610F\u56FE\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  className: "ir-input",
                  value: intentForm.name,
                  onChange: (e) => setIntentForm({ ...intentForm, name: e.target.value })
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u610F\u56FE\u7F16\u7801", hint: "\u82F1\u6587\u6807\u8BC6\uFF0C\u6A21\u578B\u8F93\u51FA\u4E0E API \u7ED3\u679C\u4F7F\u7528", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  className: "ir-input",
                  value: intentForm.code,
                  onChange: (e) => setIntentForm({ ...intentForm, code: e.target.value })
                }
              ) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u610F\u56FE\u63CF\u8FF0", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "textarea",
              {
                className: "ir-textarea",
                value: intentForm.description,
                onChange: (e) => setIntentForm({ ...intentForm, description: e.target.value })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u793A\u4F8B\uFF08\u6BCF\u884C\u4E00\u6761\uFF0C\u7528\u4E8E\u5C422\u5411\u91CF\u68C0\u7D22\u4E0E\u5C425\u63D0\u793A\u8BCD\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "textarea",
              {
                className: "ir-textarea",
                value: intentForm.examples,
                onChange: (e) => setIntentForm({ ...intentForm, examples: e.target.value })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ir-grid2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u5C421 \u5173\u952E\u8BCD\uFF08\u3001\u5206\u9694\uFF0C\u8BCD\u8FB9\u754C\u5F3A\u5339\u914D\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  className: "ir-input",
                  value: intentForm.keywords,
                  onChange: (e) => setIntentForm({ ...intentForm, keywords: e.target.value })
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u9ED1\u540D\u5355\uFF08\u547D\u4E2D\u5373\u6392\u9664\uFF0C\u3001\u5206\u9694\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  className: "ir-input",
                  value: intentForm.blacklist,
                  onChange: (e) => setIntentForm({ ...intentForm, blacklist: e.target.value })
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u767D\u540D\u5355\uFF08\u975E\u7A7A\u65F6\u5FC5\u987B\u547D\u4E2D\u5176\u4E00\uFF0C\u3001\u5206\u9694\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  className: "ir-input",
                  value: intentForm.whitelist,
                  onChange: (e) => setIntentForm({ ...intentForm, whitelist: e.target.value })
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u8DEF\u7531\u7C7B\u578B", hint: ROUTE_TYPE_OPTIONS.find((o) => o.value === intentForm.route_type)?.hint, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "select",
                {
                  className: "ir-select",
                  value: intentForm.route_type,
                  onChange: (e) => setIntentForm({ ...intentForm, route_type: e.target.value }),
                  children: ROUTE_TYPE_OPTIONS.map((o) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: o.value, children: o.label }, o.value))
                }
              ) })
            ] }),
            intentForm.route_type !== "none" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              Field,
              {
                label: intentForm.route_type === "workflow" ? "\u8DEF\u7531\u76EE\u6807\uFF08\u5DE5\u4F5C\u6D41\u8FD0\u884C\u540D\uFF0C\u53EF\u9009\uFF09" : intentForm.route_type === "subagent" ? "\u8DEF\u7531\u76EE\u6807\uFF08agent preset id\uFF09" : "\u8DEF\u7531\u76EE\u6807\uFF08Cordis \u670D\u52A1\u540D.\u65B9\u6CD5\u540D\uFF09",
                hint: intentForm.route_type === "subagent" ? "\u4E0B\u6E38\u667A\u80FD\u4F53\u4EE5 @deepseek-ai/dsh-agent-preset \u63D2\u4EF6\u884C\u5F62\u5F0F\u63A5\u5165 DSH\uFF1B\u8FD9\u91CC\u586B\u5B83\u7684 preset id" : intentForm.route_type === "service" ? "\u4F8B\u5982 orderService.createOrder\uFF1B\u8BE5\u670D\u52A1\u7531\u5176\u4ED6 DSH \u63D2\u4EF6\u63D0\u4F9B" : void 0,
                children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "input",
                  {
                    className: "ir-input",
                    value: intentForm.route_target,
                    onChange: (e) => setIntentForm({ ...intentForm, route_target: e.target.value })
                  }
                )
              }
            ),
            intentForm.route_type === "workflow" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u5DE5\u4F5C\u6D41\u811A\u672C\u6A21\u677F", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "textarea",
                {
                  className: "ir-textarea",
                  style: { minHeight: 140, fontFamily: "monospace" },
                  value: intentForm.route_script,
                  onChange: (e) => setIntentForm({ ...intentForm, route_script: e.target.value }),
                  placeholder: "const slots = args.slots\nconst r = await agent(`\u5904\u7406 ${args.query}`)\nreturn { result: r }"
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("details", { style: { marginBottom: 10 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("summary", { style: { cursor: "pointer", fontSize: 13, color: "var(--dsw-color-primary, #4d6bfe)" }, children: "\u{1F4D6} \u811A\u672C\u6A21\u677F\u4F7F\u7528\u8BF4\u660E\uFF08args \u5951\u7EA6 + \u793A\u4F8B\uFF0C\u70B9\u51FB\u5C55\u5F00\uFF09" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { className: "ir-pre", style: { marginTop: 8 }, children: WORKFLOW_HELP })
              ] })
            ] })
          ]
        }
      ),
      ruleForm && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        Modal,
        {
          title: "\u5C421 \u89C4\u5219\u914D\u7F6E\uFF08\u95EE\u5019 / \u9000\u51FA / \u6307\u4EE4\uFF09",
          onClose: () => setRuleForm(null),
          footer: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn", onClick: () => setRuleForm(null), children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn primary", onClick: saveRules, children: "\u4FDD\u5B58" })
          ] }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u95EE\u5019\u5173\u952E\u8BCD\uFF08\u3001\u5206\u9694\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "ir-input",
                value: ruleForm.greeting,
                onChange: (e) => setRuleForm({ ...ruleForm, greeting: e.target.value }),
                placeholder: "\u4F60\u597D\u3001\u60A8\u597D\u3001hi\u3001hello"
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u9000\u51FA\u5173\u952E\u8BCD\uFF08\u3001\u5206\u9694\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "ir-input",
                value: ruleForm.exit,
                onChange: (e) => setRuleForm({ ...ruleForm, exit: e.target.value }),
                placeholder: "\u9000\u51FA\u3001\u518D\u89C1\u3001\u62DC\u62DC"
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u6307\u4EE4\u6B63\u5219\uFF08\u6BCF\u884C\u4E00\u6761\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "textarea",
              {
                className: "ir-textarea",
                value: ruleForm.command,
                onChange: (e) => setRuleForm({ ...ruleForm, command: e.target.value }),
                placeholder: "^/(help|reset)\\b"
              }
            ) })
          ]
        }
      ),
      rebuildOpen && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        Modal,
        {
          title: "\u91CD\u5EFA\u573A\u666F\u5411\u91CF\uFF08\u5C422\uFF09",
          onClose: () => setRebuildOpen(false),
          footer: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn", onClick: () => setRebuildOpen(false), children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "ir-btn primary", disabled: !embModelId, onClick: doRebuild, children: "\u5F00\u59CB\u91CD\u5EFA" })
          ] }),
          children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u9009\u62E9\u5411\u91CF\u6A21\u578B", hint: "\u5148\u5728\u300C\u6A21\u578B\u914D\u7F6E\u300D\u9875\u6DFB\u52A0 embedding \u6A21\u578B\uFF1B\u91CD\u5EFA\u4F1A\u5BF9\u6240\u6709\u610F\u56FE\u793A\u4F8B\u91CD\u65B0\u8BA1\u7B97\u5411\u91CF\u5E76\u5199\u5165 pgvector\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { className: "ir-select", value: embModelId, onChange: (e) => setEmbModelId(e.target.value), children: [
            embModels.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: "\uFF08\u65E0\u53EF\u7528\u5411\u91CF\u6A21\u578B\uFF09" }),
            embModels.map((m) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: m.id, children: m.name }, m.id))
          ] }) })
        }
      )
    ] })
  ] });
}

// src/client/ModelsTab.tsx
var import_react4 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var KINDS = [
  { key: "embedding", label: "\u5411\u91CF\u6A21\u578B", hint: "\u5C422 \u4F7F\u7528\uFF1BOpenAI \u517C\u5BB9 /v1/embeddings \u6216 http JSON \u63A5\u53E3" },
  { key: "jev", label: "Jev \u6982\u7387\u5206\u7C7B\u6A21\u578B", hint: "\u5C423 \u4F7F\u7528\uFF1B\u8F93\u51FA\u5404\u5019\u9009\u610F\u56FE\u7684\u6982\u7387" },
  { key: "finetune", label: "\u8F7B\u91CF\u5FAE\u8C03\u6A21\u578B", hint: "\u5C424 \u4F7F\u7528\uFF1BBERT \u6216\u5C0F\u53C2\u6570 LLM\uFF0C\u5904\u7406\u8FB9\u754C case" },
  { key: "llm", label: "LLM", hint: "\u5C425 \u4F7F\u7528\uFF1B\u7ED3\u6784\u5316\u8F93\u51FA\u515C\u5E95\uFF0C\u652F\u6301\u591A\u610F\u56FE\u4E0E\u69FD\u4F4D\u62BD\u53D6" }
];
var emptyForm2 = { name: "", kind: "embedding", base_url: "", api_key: "", model: "", api_style: "openai", extra: "" };
function ModelsTab() {
  const [models, setModels] = (0, import_react4.useState)([]);
  const [error, setError] = (0, import_react4.useState)("");
  const [notice, setNotice] = (0, import_react4.useState)("");
  const [form, setForm] = (0, import_react4.useState)(null);
  const [testing, setTesting] = (0, import_react4.useState)("");
  const [draftScenarios, setDraftScenarios] = (0, import_react4.useState)([]);
  const [draftScenarioId, setDraftScenarioId] = (0, import_react4.useState)("");
  const [drafting, setDrafting] = (0, import_react4.useState)(false);
  const reload = async () => {
    const d = await api.get("/models");
    setModels(d.models);
  };
  (0, import_react4.useEffect)(() => {
    reload().catch((e) => setError(e.message));
  }, []);
  (0, import_react4.useEffect)(() => {
    if (form?.kind === "jev" && draftScenarios.length === 0) loadDraftScenarios();
  }, [form?.kind]);
  const loadDraftScenarios = () => {
    api.get("/scenarios").then((d) => {
      setDraftScenarios(d.scenarios);
      setDraftScenarioId(d.scenarios[0]?.id ?? "");
    }).catch((e) => setError(e.message));
  };
  const run = (fn, okMsg) => {
    setError("");
    setNotice("");
    fn().then(() => {
      if (okMsg) setNotice(okMsg);
    }).catch((e) => setError(e.message));
  };
  const generateJevDraft = (source) => run(async () => {
    if (!form || !draftScenarioId) throw new Error("\u8BF7\u5148\u9009\u62E9\u573A\u666F");
    setDrafting(source);
    try {
      const d = await api.post(
        "/jev/draft-config",
        { scenario_id: draftScenarioId, model: form.model.trim() || void 0, source }
      );
      setForm({ ...form, extra: JSON.stringify(d.extra, null, 2) });
      setNotice(d.note);
    } finally {
      setDrafting(false);
    }
  });
  const save = () => run(async () => {
    if (!form) return;
    let extra = {};
    if (form.extra.trim() !== "") {
      try {
        extra = JSON.parse(form.extra);
      } catch {
        throw new Error("\u6269\u5C55\u914D\u7F6E\u4E0D\u662F\u5408\u6CD5 JSON");
      }
    }
    const payload = { name: form.name, kind: form.kind, base_url: form.base_url, api_key: form.api_key, model: form.model, api_style: form.api_style, extra };
    if (form.id) await api.put(`/models/${form.id}`, payload);
    else await api.post("/models", payload);
    setForm(null);
    await reload();
  }, "\u6A21\u578B\u5DF2\u4FDD\u5B58");
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "ir-toolbar", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "ir-btn primary", onClick: () => setForm({ ...emptyForm2 }), children: "\u6DFB\u52A0\u6A21\u578B" }) }),
    error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "ir-error", children: error }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "ir-ok", children: notice }),
    KINDS.map((k) => {
      const rows = models.filter((m) => m.kind === k.key);
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ir-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ir-card-title", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: k.label }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "ir-muted", children: k.hint })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "ir-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("table", { className: "ir-table", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u540D\u79F0" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u6A21\u578B" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "Base URL" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", { children: "\u63A5\u53E3\u6837\u5F0F" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("th", {})
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tbody", { children: [
            rows.map((m) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: m.name }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { children: m.model }) }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { className: "ir-muted", children: m.base_url }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { children: m.api_style }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("td", { style: { whiteSpace: "nowrap" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "ir-btn", disabled: testing === m.id, onClick: () => {
                  setTesting(m.id);
                  setError("");
                  setNotice("");
                  api.post(`/models/${m.id}/test`).then((d) => setNotice(`\u300C${m.name}\u300D\u8FDE\u901A\u6B63\u5E38\uFF08${d.latency_ms}ms${d.dimension ? `\uFF0C\u7EF4\u5EA6 ${d.dimension}` : ""}\uFF09`)).catch((e) => setError(`\u300C${m.name}\u300D\u6D4B\u8BD5\u5931\u8D25\uFF1A${e.message}`)).finally(() => setTesting(""));
                }, children: testing === m.id ? "\u6D4B\u8BD5\u4E2D\u2026" : "\u6D4B\u8BD5" }),
                " ",
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "ir-btn", onClick: () => setForm({
                  id: m.id,
                  name: m.name,
                  kind: m.kind,
                  base_url: m.base_url,
                  api_key: m.api_key,
                  model: m.model,
                  api_style: m.api_style,
                  extra: JSON.stringify(m.extra ?? {}, null, 2)
                }), children: "\u7F16\u8F91" }),
                " ",
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "ir-btn danger", onClick: () => {
                  if (confirm(`\u5220\u9664\u6A21\u578B\u300C${m.name}\u300D\uFF1F\u5F15\u7528\u5B83\u7684\u670D\u52A1\u5C06\u5931\u53BB\u8BE5\u5C42\u80FD\u529B\u3002`)) {
                    run(async () => {
                      await api.del(`/models/${m.id}`);
                      await reload();
                    });
                  }
                }, children: "\u5220" })
              ] })
            ] }, m.id)),
            rows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("td", { colSpan: 5, className: "ir-muted", children: "\u672A\u914D\u7F6E" }) })
          ] })
        ] }) })
      ] }, k.key);
    }),
    form && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      Modal,
      {
        title: form.id ? "\u7F16\u8F91\u6A21\u578B" : "\u6DFB\u52A0\u6A21\u578B",
        onClose: () => setForm(null),
        footer: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "ir-btn", onClick: () => setForm(null), children: "\u53D6\u6D88" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "ir-btn primary", onClick: save, children: "\u4FDD\u5B58" })
        ] }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ir-grid2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { label: "\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                className: "ir-input",
                value: form.name,
                onChange: (e) => setForm({ ...form, name: e.target.value })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { label: "\u7C7B\u578B", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "select",
              {
                className: "ir-select",
                value: form.kind,
                disabled: Boolean(form.id),
                onChange: (e) => setForm({ ...form, kind: e.target.value }),
                children: KINDS.map((k) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: k.key, children: k.label }, k.key))
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { label: "\u63A5\u53E3\u6837\u5F0F", hint: "openai = OpenAI \u517C\u5BB9\u63A5\u53E3\uFF1Bhttp = \u81EA\u5B9A\u4E49 JSON \u5206\u7C7B\u63A5\u53E3\uFF08jev/\u5FAE\u8C03\u5E38\u7528\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
              "select",
              {
                className: "ir-select",
                value: form.api_style,
                onChange: (e) => setForm({ ...form, api_style: e.target.value }),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "openai", children: "openai" }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "http", children: "http" })
                ]
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { label: "\u6A21\u578B\u540D", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                className: "ir-input",
                value: form.model,
                onChange: (e) => setForm({ ...form, model: e.target.value }),
                placeholder: "\u5982 bge-m3 / jev-cls-v1 / bert-ft / deepseek-chat"
              }
            ) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { label: "Base URL", hint: "openai \u6837\u5F0F\u586B\u670D\u52A1\u6839\u5730\u5740\uFF08\u81EA\u52A8\u62FC /v1/embeddings\u3001/v1/chat/completions\uFF09\uFF1Bhttp \u6837\u5F0F\u586B\u5B8C\u6574\u5206\u7C7B\u63A5\u53E3\u5730\u5740", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              className: "ir-input",
              value: form.base_url,
              onChange: (e) => setForm({ ...form, base_url: e.target.value }),
              placeholder: "https://api.example.com"
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { label: "API Key", hint: form.id ? "\u663E\u793A *** \u8868\u793A\u5DF2\u4FDD\u5B58\uFF0C\u91CD\u65B0\u8F93\u5165\u624D\u4F1A\u8986\u76D6" : "\u53EF\u7559\u7A7A", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              className: "ir-input",
              type: "password",
              value: form.api_key,
              onChange: (e) => setForm({ ...form, api_key: e.target.value })
            }
          ) }),
          form.kind === "jev" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ir-card", style: { marginBottom: 10, background: "var(--dsw-color-bg-spotlight, #f7f8fa)" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "ir-card-title", style: { fontSize: 13 }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: "\u6269\u5C55\u914D\u7F6E\u81EA\u52A8\u751F\u6210\uFF08systemone questions\uFF09" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ir-muted", style: { margin: "6px 0" }, children: [
              "\u6839\u636E\u6240\u9009\u573A\u666F\u7684\u610F\u56FE\uFF08\u7F16\u7801/\u540D\u79F0/\u63CF\u8FF0\u5168\u6587\uFF09\u81EA\u52A8\u586B\u5145\u4E0B\u65B9\u6269\u5C55\u914D\u7F6E\uFF1A",
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: "\u4E00\u6B21\u751F\u6210 score / choice / noul \u4E09\u79CD\u5224\u5B9A\u65B9\u5F0F" }),
              "\uFF08modes.score / modes.choice / modes.noul\uFF09\uFF0C\u6BCF\u79CD\u65B9\u5F0F\u53EA\u6709\u4E00\u4E2A\u540D\u4E3A intent_recognition \u7684\u95EE\u9898\uFF0C\u670D\u52A1\u7F16\u8F91\u9875\u7684\u5C423\u300C\u5224\u5B9A\u65B9\u5F0F\u300D\u4E0B\u62C9\u51B3\u5B9A\u8FD0\u884C\u65F6\u542F\u7528\u54EA\u4E00\u79CD\uFF1A score \u7684 criteria \u4E3A\u5404\u610F\u56FE\u5224\u5B9A\u63CF\u8FF0\u6570\u7EC4\uFF08\u4E0E intent_order \u4E00\u4E00\u5BF9\u5E94\uFF09\uFF0C\u8981\u6C42\u6A21\u578B\u6309\u5E8F\u8F93\u51FA 0~1 \u5206\uFF1B choice \u7684 criteria \u4E3A\u300C\u610F\u56FE\u540D \u2192 \u5224\u5B9A\u63CF\u8FF0\u300D\u5BF9\u8C61\uFF0C\u8981\u6C42\u6A21\u578B\u53EA\u56DE\u7B54\u4E00\u4E2A\u610F\u56FE\u540D\uFF1B noul \u4E3A\u662F/\u5426\u4E8C\u5206\u7C7B\uFF0C",
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: "\u4EC5\u5F53\u573A\u666F\u6070\u597D 2 \u4E2A\u610F\u56FE\u65F6\u751F\u6210" }),
              '\uFF08map \u628A"\u662F"/"\u5426"\u6620\u5C04\u5230\u610F\u56FE\u7F16\u7801\uFF09\u3002',
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: "AI \u751F\u6210" }),
              "\u8C03\u7528\u5DF2\u914D\u7F6E\u7684 LLM\uFF08\u8BED\u4E49\u66F4\u51C6\uFF0C\u9700\u5148\u5728\u6A21\u578B\u914D\u7F6E\u4E2D\u6DFB\u52A0 LLM\uFF09\uFF1B",
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: "\u89C4\u5219\u6A21\u677F\u751F\u6210" }),
              "\u4E0D\u4F9D\u8D56 LLM\uFF0C\u76F4\u63A5\u628A\u6BCF\u4E2A\u610F\u56FE\u7684\u5B9A\u4E49/\u5F52\u5165\u4FE1\u53F7/\u6392\u9664\u89C4\u5219\u5168\u6587\u5D4C\u5165\u5224\u5B9A\u6307\u4EE4\u3002\u751F\u6210\u540E\u8BF7",
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: "\u5BA1\u6838\u4FEE\u6539\u518D\u4FDD\u5B58" }),
              "\uFF1B\u4FDD\u5B58\u540E\u5C423 \u5C06\u6309 systemone \u62A5\u6587\uFF08model/state/questions\uFF09\u8C03\u7528\u672C\u63A5\u53E3\u3002"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ir-toolbar", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { className: "ir-select", value: draftScenarioId, onChange: (e) => setDraftScenarioId(e.target.value), children: [
                draftScenarios.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "", children: "\uFF08\u65E0\u573A\u666F\uFF0C\u8BF7\u5148\u521B\u5EFA\u610F\u56FE\uFF09" }),
                draftScenarios.map((s) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: s.id, children: s.name }, s.id))
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "ir-btn primary", disabled: drafting !== false || !draftScenarioId, onClick: () => generateJevDraft("llm"), children: drafting === "llm" ? "AI \u751F\u6210\u4E2D\u2026" : "AI \u81EA\u52A8\u751F\u6210\u6269\u5C55\u914D\u7F6E" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "ir-btn", disabled: drafting !== false || !draftScenarioId, onClick: () => generateJevDraft("rule"), children: drafting === "rule" ? "\u751F\u6210\u4E2D\u2026" : "\u89C4\u5219\u6A21\u677F\u751F\u6210" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { label: "\u6269\u5C55\u914D\u7F6E\uFF08JSON\uFF0C\u53EF\u9009\uFF09", hint: '\u5982 {"timeout_ms": 30000, "temperature": 0, "headers": {}, "embeddings_path": "/v1/embeddings", "prompt": "\u81EA\u5B9A\u4E49\u5C425\u7CFB\u7EDF\u63D0\u793A\u8BCD"}\uFF1Bjev http \u63A5\u53E3\u542B questions \u5BF9\u8C61\u65F6\u6309 systemone \u62A5\u6587\u8C03\u7528', children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "textarea",
            {
              className: "ir-textarea",
              style: { minHeight: form.kind === "jev" ? 220 : void 0 },
              value: form.extra,
              onChange: (e) => setForm({ ...form, extra: e.target.value })
            }
          ) })
        ]
      }
    )
  ] });
}

// src/client/ServicesTab.tsx
var import_react5 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
var LAYER_META = [
  {
    key: "l1",
    name: "\u5C421 \u89C4\u5219\u786C\u8FC7\u6EE4",
    params: [{ k: "confidence", label: "\u7F6E\u4FE1\u5EA6" }],
    hint: "\u5173\u952E\u8BCD/\u9ED1\u767D\u540D\u5355\u89C4\u5219\u76F4\u63A5\u547D\u4E2D\u4E14\u89C4\u5219\u7F6E\u4FE1\u5EA6 \u2265 \u8BE5\u503C\u65F6\u76F4\u63A5\u8DEF\u7531\uFF0C\u4E0D\u518D\u8D70\u540E\u7EED\u5C42\u3002"
  },
  {
    key: "l2",
    name: "\u5C422 \u5411\u91CF\u68C0\u7D22",
    params: [{ k: "topK", label: "TopK" }, { k: "minScore", label: "\u7F6E\u4FE1\u5EA6\u9608\u503C\uFF08\u6700\u4F4E\u76F8\u4F3C\u5EA6\uFF09" }],
    hint: "\u53EC\u56DE\u5207\u7247\u5206\u6570\u4F4E\u4E8E\u300C\u7F6E\u4FE1\u5EA6\u9608\u503C\u300D\u4E0D\u8FDB\u5165\u5019\u9009\uFF1BTopK \u9650\u5236\u6700\u591A\u4FDD\u7559\u7684\u5019\u9009\u610F\u56FE\u6570\u3002\u5C422 \u53EA\u538B\u7F29\u5019\u9009\uFF0C\u4E0D\u76F4\u63A5\u547D\u4E2D\u3002"
  },
  {
    key: "l3",
    name: "\u5C423 Jev \u6982\u7387\u7CBE\u5224",
    params: [{ k: "high", label: "\u9AD8\u7F6E\u4FE1\u9608\u503C" }, { k: "mid", label: "\u4E2D\u7F6E\u4FE1\u9608\u503C" }],
    selects: [{
      k: "mode",
      label: "\u5224\u5B9A\u65B9\u5F0F",
      options: [
        { v: "score", label: "score\uFF08\u8BC4\u5206\uFF09" },
        { v: "choice", label: "choice\uFF08\u5355\u9009\uFF09" },
        { v: "noul", label: "noul\uFF08\u662F\u975E\uFF09" }
      ]
    }],
    hint: "Jev \u5BF9\u6BCF\u4E2A\u5019\u9009\u610F\u56FE\u8BC4\u5206\uFF1A\u6700\u9AD8\u5206 \u2265 \u9AD8\u7F6E\u4FE1\u9608\u503C \u2192 \u76F4\u63A5\u547D\u4E2D\uFF08\u8DF3\u8FC7\u5C424/\u5C425\uFF09\uFF1B\u4F4D\u4E8E [\u4E2D, \u9AD8) \u533A\u95F4 \u2192 \u538B\u7F29\u5019\u9009\u4EA4\u5C424 \u4EF2\u88C1\uFF1B\u4F4E\u4E8E\u4E2D\u7F6E\u4FE1\u9608\u503C \u2192 \u4EA4\u5C425 \u515C\u5E95\u3002\u5224\u5B9A\u65B9\u5F0F\u5BF9\u5E94 Jev \u6269\u5C55\u914D\u7F6E modes.<\u65B9\u5F0F> \u7684\u95EE\u9898\u96C6\uFF08noul \u4EC5\u4E8C\u5206\u7C7B\u573A\u666F\u751F\u6210\uFF09\u3002"
  },
  {
    key: "l4",
    name: "\u5C424 \u8F7B\u91CF\u5FAE\u8C03",
    params: [{ k: "threshold", label: "\u9608\u503C" }],
    hint: "\u5FAE\u8C03\u6A21\u578B\u5BF9\u5C423 \u538B\u7F29\u540E\u7684\u5019\u9009\u505A\u4EF2\u88C1\uFF0C\u7F6E\u4FE1\u5EA6 \u2265 \u9608\u503C\u65F6\u547D\u4E2D\uFF0C\u5426\u5219\u4EA4\u5C425\u3002"
  },
  { key: "l5", name: "\u5C425 LLM \u7ED3\u6784\u5316\u515C\u5E95", params: [] }
];
var MODEL_SLOTS = [
  { key: "embedding", label: "\u5411\u91CF\u6A21\u578B\uFF08\u5C422\uFF09" },
  { key: "jev", label: "Jev \u6A21\u578B\uFF08\u5C423\uFF09" },
  { key: "finetune", label: "\u5FAE\u8C03\u6A21\u578B\uFF08\u5C424\uFF09" },
  { key: "llm", label: "LLM\uFF08\u5C425\uFF09" }
];
var defaultLayers = () => ({
  l1: { enabled: true, confidence: 0.99 },
  l2: { enabled: true, topK: 8, minScore: 0.5 },
  l3: { enabled: true, high: 0.85, mid: 0.5, mode: "score" },
  l4: { enabled: true, threshold: 0.7 },
  l5: { enabled: true }
});
function ServicesTab() {
  const [services, setServices] = (0, import_react5.useState)([]);
  const [scenarios, setScenarios] = (0, import_react5.useState)([]);
  const [models, setModels] = (0, import_react5.useState)([]);
  const [error, setError] = (0, import_react5.useState)("");
  const [notice, setNotice] = (0, import_react5.useState)("");
  const [form, setForm] = (0, import_react5.useState)(null);
  const [testSvc, setTestSvc] = (0, import_react5.useState)(null);
  const [testQuery, setTestQuery] = (0, import_react5.useState)("");
  const [testContext, setTestContext] = (0, import_react5.useState)("");
  const [testResult, setTestResult] = (0, import_react5.useState)(null);
  const [testing, setTesting] = (0, import_react5.useState)(false);
  const [logs, setLogs] = (0, import_react5.useState)(null);
  const [revealKey, setRevealKey] = (0, import_react5.useState)("");
  const reload = async () => {
    const [s, sc, m] = await Promise.all([
      api.get("/services"),
      api.get("/scenarios"),
      api.get("/models")
    ]);
    setServices(s.services);
    setScenarios(sc.scenarios);
    setModels(m.models);
  };
  (0, import_react5.useEffect)(() => {
    reload().catch((e) => setError(e.message));
  }, []);
  const run = (fn, okMsg) => {
    setError("");
    setNotice("");
    fn().then(() => {
      if (okMsg) setNotice(okMsg);
    }).catch((e) => setError(e.message));
  };
  const openCreate = () => setForm({
    name: "",
    description: "",
    scenario_id: scenarios[0]?.id ?? "",
    layers: defaultLayers(),
    models: { embedding: null, jev: null, finetune: null, llm: null },
    route_mode: "auto"
  });
  const save = () => run(async () => {
    if (!form) return;
    if (form.id) await api.put(`/services/${form.id}`, form);
    else await api.post("/services", form);
    setForm(null);
    await reload();
  }, "\u670D\u52A1\u5DF2\u4FDD\u5B58");
  const modelsOf = (kind) => models.filter((m) => m.kind === kind);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn primary", onClick: openCreate, disabled: scenarios.length === 0, children: "\u521B\u5EFA\u670D\u52A1" }),
      scenarios.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "ir-muted", children: "\u8BF7\u5148\u5728\u300C\u610F\u56FE\u7BA1\u7406\u300D\u521B\u5EFA\u573A\u666F" })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ir-error", children: error }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ir-ok", children: notice }),
    services.map((s) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-card-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          s.name,
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "ir-muted", children: [
            "\xB7 ",
            s.scenario_name
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "ir-badge on", style: { marginRight: 6 }, children: s.route_mode === "suggest" ? "\u4EC5\u5EFA\u8BAE" : "\u81EA\u52A8\u8DEF\u7531" }),
          s.status === "running" && s.tool && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "span",
            {
              className: `ir-badge ${s.tool.registered ? "on" : "err"}`,
              style: { marginRight: 6 },
              title: s.tool.registered ? `\u5BF9\u8BDD\u5DE5\u5177 ${s.tool_name} \u5DF2\u5C31\u7EEA` : s.tool.error ?? "\u5DE5\u5177\u6CE8\u518C\u5931\u8D25",
              children: s.tool.registered ? "\u5BF9\u8BDD\u5DE5\u5177\u5DF2\u6CE8\u518C" : "\u5BF9\u8BDD\u5DE5\u5177\u672A\u6CE8\u518C"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: `ir-badge ${s.status}`, children: s.status === "running" ? "\u8FD0\u884C\u4E2D" : "\u5DF2\u505C\u6B62" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ir-muted", style: { margin: "6px 0" }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ClampedText, { text: s.description }) }),
      s.status === "running" && s.tool && !s.tool.registered && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-error", style: { margin: "4px 0" }, children: [
        "\u5BF9\u8BDD\u5DE5\u5177\u6CE8\u518C\u5931\u8D25",
        s.tool.error ? `\uFF1A${s.tool.error}` : "",
        "\u2014\u2014\u4E3B Agent \u5C06\u65E0\u6CD5\u5728\u5BF9\u8BDD\u4E2D\u8C03\u7528\u672C\u670D\u52A1\uFF0C\u8BF7\u67E5\u770B\u5BBF\u4E3B\u65E5\u5FD7\u6216\u91CD\u542F\u63D2\u4EF6\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ir-row", style: { fontSize: 12 }, children: LAYER_META.map((l) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: `ir-badge ${s.layers[l.key]?.enabled ? "on" : "off"}`, children: l.name.split(" ")[0] }, l.key)) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-row", style: { margin: "8px 0", fontSize: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "ir-muted", children: "API Key:" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { children: revealKey === s.id ? s.api_key : s.api_key.slice(0, 7) + "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn", onClick: () => setRevealKey(revealKey === s.id ? "" : s.id), children: revealKey === s.id ? "\u9690\u85CF" : "\u663E\u793A" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn", onClick: () => {
          navigator.clipboard?.writeText(s.api_key);
        }, children: "\u590D\u5236" })
      ] }),
      s.status === "running" && s.tool?.registered && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-muted", style: { margin: "0 0 8px", fontSize: 12 }, children: [
        "\u5BF9\u8BDD\u4F7F\u7528\uFF1A\u5728\u4EFB\u610F\u4F1A\u8BDD\u4E2D\u63D0\u51FA\u8BE5\u573A\u666F\u7684\u95EE\u9898\uFF0C\u4E3B Agent \u4F1A\u81EA\u52A8\u8C03\u7528\u5DE5\u5177 ",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { children: s.tool_name }),
        "\uFF1B\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5BF9\u5B83\u8BF4\u300C\u7528 ",
        s.tool_name,
        " \u5224\u65AD\u4E00\u4E0B\uFF1A\u2026\u2026\u300D\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-toolbar", children: [
        s.status === "stopped" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn primary", onClick: () => run(async () => {
          await api.post(`/services/${s.id}/start`);
          await reload();
        }, "\u670D\u52A1\u5DF2\u542F\u52A8"), children: "\u8FD0\u884C" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn", onClick: () => run(async () => {
          await api.post(`/services/${s.id}/stop`);
          await reload();
        }, "\u670D\u52A1\u5DF2\u505C\u6B62"), children: "\u505C\u6B62" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn", onClick: () => {
          setTestSvc(s);
          setTestResult(null);
          setTestQuery("");
          setTestContext("");
        }, children: "\u6D4B\u8BD5" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn", disabled: s.status === "running", onClick: () => setForm({
          id: s.id,
          name: s.name,
          description: s.description,
          scenario_id: s.scenario_id,
          layers: { ...defaultLayers(), ...s.layers },
          models: { ...s.models },
          route_mode: s.route_mode ?? "auto"
        }), children: "\u7F16\u8F91" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn", onClick: () => run(async () => {
          await api.post(`/services/${s.id}/copy`);
          await reload();
        }, "\u5DF2\u590D\u5236\u670D\u52A1"), children: "\u590D\u5236" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn", onClick: () => run(async () => {
          const d = await api.get(`/services/${s.id}/logs`);
          setLogs({ svc: s, rows: d.logs });
        }), children: "\u65E5\u5FD7" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn danger", disabled: s.status === "running", onClick: () => {
          if (confirm(`\u5220\u9664\u670D\u52A1\u300C${s.name}\u300D\uFF1F`)) run(async () => {
            await api.del(`/services/${s.id}`);
            await reload();
          });
        }, children: "\u5220\u9664" })
      ] })
    ] }, s.id)),
    services.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ir-muted", children: "\u8FD8\u6CA1\u6709\u670D\u52A1\u3002\u521B\u5EFA\u670D\u52A1\u540E\u5373\u53EF\u901A\u8FC7 API \u6216 Agent \u5DE5\u5177\u8C03\u7528\u3002" }),
    form && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      Modal,
      {
        title: form.id ? "\u7F16\u8F91\u670D\u52A1" : "\u521B\u5EFA\u670D\u52A1",
        onClose: () => setForm(null),
        footer: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn", onClick: () => setForm(null), children: "\u53D6\u6D88" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn primary", onClick: save, children: "\u4FDD\u5B58" })
        ] }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-grid2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u670D\u52A1\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "input",
              {
                className: "ir-input",
                value: form.name,
                onChange: (e) => setForm({ ...form, name: e.target.value })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u573A\u666F", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "select",
              {
                className: "ir-select",
                value: form.scenario_id,
                onChange: (e) => setForm({ ...form, scenario_id: e.target.value }),
                children: scenarios.map((s) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: s.id, children: s.name }, s.id))
              }
            ) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u670D\u52A1\u63CF\u8FF0", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              className: "ir-input",
              value: form.description,
              onChange: (e) => setForm({ ...form, description: e.target.value })
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u6D41\u6C34\u7EBF\u5C42\u914D\u7F6E\uFF08\u5173\u95ED\u7684\u5C42\u4F1A\u88AB\u8DF3\u8FC7\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ir-layers", children: LAYER_META.map((l) => {
            const cfg = form.layers[l.key];
            return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-layer", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "name", children: l.name }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "ir-row", style: { gap: 4, fontSize: 12, cursor: "pointer" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked: cfg.enabled,
                    onChange: (e) => setForm({ ...form, layers: { ...form.layers, [l.key]: { ...cfg, enabled: e.target.checked } } })
                  }
                ),
                "\u542F\u7528"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "params", children: [
                l.params.map((p) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
                  p.label,
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                    "input",
                    {
                      type: "number",
                      step: "any",
                      value: String(cfg[p.k] ?? ""),
                      disabled: !cfg.enabled,
                      onChange: (e) => setForm({
                        ...form,
                        layers: { ...form.layers, [l.key]: { ...cfg, [p.k]: Number(e.target.value) } }
                      })
                    }
                  )
                ] }, p.k)),
                l.hint && cfg.enabled && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ir-muted", style: { flexBasis: "100%", fontSize: 12, lineHeight: 1.6 }, children: l.hint }),
                l.selects?.map((sel) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
                  sel.label,
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                    "select",
                    {
                      className: "ir-select",
                      style: { minWidth: 130 },
                      value: String(cfg[sel.k] ?? sel.options[0].v),
                      disabled: !cfg.enabled,
                      title: l.key === "l3" ? "Jev \u6269\u5C55\u914D\u7F6E\u9700\u5305\u542B\u5BF9\u5E94\u95EE\u9898\u96C6\uFF08modes.<\u65B9\u5F0F>\uFF09\uFF1B\u300CAI/\u89C4\u5219 \u81EA\u52A8\u751F\u6210\u300D\u4F1A\u4E00\u6B21\u751F\u6210\u5168\u90E8\u4E09\u79CD" : void 0,
                      onChange: (e) => setForm({
                        ...form,
                        layers: { ...form.layers, [l.key]: { ...cfg, [sel.k]: e.target.value } }
                      }),
                      children: sel.options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: o.v, children: o.label }, o.v))
                    }
                  )
                ] }, sel.k))
              ] })
            ] }, l.key);
          }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-grid2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u8DEF\u7531\u6A21\u5F0F", hint: "auto\uFF1AL1/L3/L4 \u9AD8\u7F6E\u4FE1\u547D\u4E2D\u65F6\u7531\u5DE5\u5177\u76F4\u63A5\u6267\u884C\u8DEF\u7531\uFF08\u786E\u5B9A\u6027\uFF09\uFF1BL5 \u547D\u4E2D\u53EA\u8FD4\u56DE\u5EFA\u8BAE\u3002suggest\uFF1A\u6C38\u4E0D\u81EA\u52A8\u6267\u884C\uFF0C\u5168\u90E8\u4EA4\u7ED9\u4E3B Agent \u51B3\u7B56\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
              "select",
              {
                className: "ir-select",
                value: form.route_mode,
                onChange: (e) => setForm({ ...form, route_mode: e.target.value }),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "auto", children: "auto\uFF08\u81EA\u52A8\u6267\u884C\u8DEF\u7531\uFF09" }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "suggest", children: "suggest\uFF08\u4EC5\u5EFA\u8BAE\uFF09" })
                ]
              }
            ) }),
            MODEL_SLOTS.map((slot) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: slot.label, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
              "select",
              {
                className: "ir-select",
                value: form.models[slot.key] ?? "",
                onChange: (e) => setForm({ ...form, models: { ...form.models, [slot.key]: e.target.value || null } }),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: "\uFF08\u672A\u914D\u7F6E\uFF09" }),
                  modelsOf(slot.key).map((m) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: m.id, children: m.name }, m.id))
                ]
              }
            ) }, slot.key))
          ] })
        ]
      }
    ),
    testSvc && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      Modal,
      {
        title: `\u6D4B\u8BD5\u670D\u52A1\uFF1A${testSvc.name}`,
        onClose: () => setTestSvc(null),
        footer: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn", onClick: () => setTestSvc(null), children: "\u5173\u95ED" }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "Query", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              className: "ir-input",
              value: testQuery,
              onChange: (e) => setTestQuery(e.target.value),
              placeholder: "\u8F93\u5165\u4E00\u53E5\u7528\u6237 query"
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u5BF9\u8BDD\u4E0A\u4E0B\u6587\uFF08\u6BCF\u884C\u4E00\u8F6E\uFF0C\u53EF\u9009\uFF0C\u4F9B\u5C425 \u4F7F\u7528\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("textarea", { className: "ir-textarea", value: testContext, onChange: (e) => setTestContext(e.target.value) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-toolbar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn primary", disabled: testing || !testQuery.trim(), onClick: () => {
              setTesting(true);
              setTestResult(null);
              run(async () => {
                try {
                  const d = await api.post(`/services/${testSvc.id}/predict`, {
                    query: testQuery,
                    context: testContext.split("\n").map((x) => x.trim()).filter(Boolean)
                  });
                  setTestResult(d);
                } finally {
                  setTesting(false);
                }
              });
            }, children: testing ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "ir-spinner" }),
              "\u8BC6\u522B\u4E2D\u2026"
            ] }) : "\u6267\u884C\u8BC6\u522B" }),
            testing && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "ir-muted", children: "\u6B63\u5728\u8DD1\u4E94\u5C42\u6D41\u6C34\u7EBF\uFF0C\u6A21\u578B\u8C03\u7528\u53EF\u80FD\u9700\u8981\u51E0\u79D2\uFF0C\u8BF7\u7A0D\u5019\u2026" })
          ] }),
          testResult && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ir-trace", children: [
              testResult.trace.map((t) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
                "span",
                {
                  className: `ir-badge ${t.hit ? "on" : t.detail.error ? "err" : t.enabled ? "off" : "off"}`,
                  title: JSON.stringify(t.detail),
                  children: [
                    t.layer,
                    t.hit ? " \u2713" : "",
                    " ",
                    t.latency_ms,
                    "ms"
                  ]
                },
                t.layer
              )),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "ir-muted", children: [
                "\u603B\u8017\u65F6 ",
                testResult.latency_ms,
                "ms"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: 14, margin: "6px 0" }, children: testResult.intent ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
              "\u547D\u4E2D\uFF1A",
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: testResult.intent.name }),
              "\uFF08",
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { children: testResult.intent.code }),
              "\uFF0C\u7F6E\u4FE1\u5EA6 ",
              testResult.confidence.toFixed(3),
              "\uFF0C\u5C42 ",
              testResult.matched_layer,
              "\uFF09"
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "ir-muted", children: [
              "\u672A\u547D\u4E2D\u4EFB\u4F55\u610F\u56FE",
              testResult.need_clarification ? "\uFF0C\u5EFA\u8BAE\u6F84\u6E05" : ""
            ] }) }),
            testResult.route && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { fontSize: 13, margin: "4px 0" }, children: [
              "\u8DEF\u7531\uFF1A",
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("code", { children: [
                testResult.route.type,
                testResult.route.target ? `:${testResult.route.target}` : ""
              ] }),
              testResult.route_result && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: testResult.route_result.ok ? "ir-ok" : "ir-error", children: [
                " ",
                testResult.route_result.ok ? "\u5DF2\u6267\u884C \u2713" : `\u6267\u884C\u5931\u8D25\uFF1A${testResult.route_result.error}`
              ] }),
              !testResult.route_result && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "ir-muted", children: "\uFF08\u672A\u81EA\u52A8\u6267\u884C\uFF0C\u4F5C\u4E3A\u5EFA\u8BAE\u8FD4\u56DE\uFF09" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("pre", { className: "ir-pre", children: JSON.stringify(testResult, null, 2) })
          ] })
        ]
      }
    ),
    logs && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      Modal,
      {
        title: `\u8C03\u7528\u65E5\u5FD7\uFF1A${logs.svc.name}`,
        onClose: () => setLogs(null),
        footer: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "ir-btn", onClick: () => setLogs(null), children: "\u5173\u95ED" }),
        children: [
          logs.rows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ir-muted", children: "\u6682\u65E0\u8C03\u7528\u8BB0\u5F55" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("table", { className: "ir-table", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("th", { children: "\u65F6\u95F4" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("th", { children: "Query" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("th", { children: "\u547D\u4E2D\u5C42" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("th", { children: "\u610F\u56FE" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("th", { children: "\u8017\u65F6" })
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("tbody", { children: logs.rows.map((row) => {
              const result = row.result;
              return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("tr", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("td", { className: "ir-muted", children: String(row.created_at).slice(0, 19).replace("T", " ") }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("td", { children: String(row.query) }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("td", { children: String(row.matched_layer ?? "\u2014") }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("td", { children: result.intent?.name ?? "\u2014" }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("td", { children: [
                  String(row.latency_ms),
                  "ms"
                ] })
              ] }, String(row.id));
            }) })
          ] })
        ]
      }
    )
  ] });
}

// src/client/VectorTab.tsx
var import_react6 = require("react");
var import_jsx_runtime6 = require("react/jsx-runtime");
function ScoreBar(props) {
  const pct = Math.max(0, Math.min(1, props.score)) * 100;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "ir-scorebar", title: String(props.score), children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: `ir-scorebar-fill ${props.pass ? "on" : "off"}`, style: { width: `${pct}%` } }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "ir-scorebar-num", children: props.score.toFixed(4) })
  ] });
}
function VectorTab() {
  const [scenarios, setScenarios] = (0, import_react6.useState)([]);
  const [models, setModels] = (0, import_react6.useState)([]);
  const [services, setServices] = (0, import_react6.useState)([]);
  const [scenarioId, setScenarioId] = (0, import_react6.useState)("");
  const [error, setError] = (0, import_react6.useState)("");
  const [notice, setNotice] = (0, import_react6.useState)("");
  const [query, setQuery] = (0, import_react6.useState)("");
  const [serviceId, setServiceId] = (0, import_react6.useState)("");
  const [modelId, setModelId] = (0, import_react6.useState)("");
  const [topK, setTopK] = (0, import_react6.useState)("");
  const [minScore, setMinScore] = (0, import_react6.useState)("");
  const [testing, setTesting] = (0, import_react6.useState)(false);
  const [result, setResult] = (0, import_react6.useState)(null);
  const [intents, setIntents] = (0, import_react6.useState)([]);
  const [intentFilter, setIntentFilter] = (0, import_react6.useState)("");
  const [chunks, setChunks] = (0, import_react6.useState)([]);
  const [chunksTotal, setChunksTotal] = (0, import_react6.useState)(0);
  const [page, setPage] = (0, import_react6.useState)(1);
  const size = 20;
  const [overview, setOverview] = (0, import_react6.useState)([]);
  const [rebuildFor, setRebuildFor] = (0, import_react6.useState)(null);
  const [rebuildModelId, setRebuildModelId] = (0, import_react6.useState)("");
  const run = (fn) => {
    setError("");
    setNotice("");
    fn().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  const loadOverview = () => api.get("/vector/overview").then((d) => setOverview(d.scenarios)).catch(() => {
  });
  const loadChunks = (sid, iid, p) => {
    if (!sid) {
      setChunks([]);
      setChunksTotal(0);
      return;
    }
    api.get(
      `/vector/chunks?scenario_id=${sid}${iid ? `&intent_id=${iid}` : ""}&page=${p}&size=${size}`
    ).then((d) => {
      setChunks(d.chunks);
      setChunksTotal(d.total);
    }).catch((e) => setError(e.message));
  };
  (0, import_react6.useEffect)(() => {
    run(async () => {
      const [s, m, sv] = await Promise.all([
        api.get("/scenarios"),
        api.get("/models?kind=embedding"),
        api.get("/services")
      ]);
      setScenarios(s.scenarios);
      setModels(m.models);
      setServices(sv.services);
      if (s.scenarios[0]) setScenarioId(s.scenarios[0].id);
      if (m.models[0]) setModelId(m.models[0].id);
    });
    loadOverview();
  }, []);
  (0, import_react6.useEffect)(() => {
    if (!scenarioId) {
      setIntents([]);
      return;
    }
    api.get(`/scenarios/${scenarioId}/intents`).then((d) => setIntents(d.intents)).catch(() => setIntents([]));
  }, [scenarioId]);
  (0, import_react6.useEffect)(() => {
    setPage(1);
    loadChunks(scenarioId, intentFilter, 1);
  }, [scenarioId, intentFilter]);
  (0, import_react6.useEffect)(() => {
    loadChunks(scenarioId, intentFilter, page);
  }, [page]);
  const scenarioServices = services.filter((sv) => sv.scenario_id === scenarioId);
  const doTest = () => run(async () => {
    if (!scenarioId || query.trim() === "") throw new Error("\u8BF7\u9009\u62E9\u573A\u666F\u5E76\u8F93\u5165\u6D4B\u8BD5\u95EE\u9898");
    setTesting(true);
    try {
      const d = await api.post("/vector/test", {
        scenario_id: scenarioId,
        query: query.trim(),
        service_id: serviceId || void 0,
        model_id: serviceId ? void 0 : modelId || void 0,
        top_k: topK.trim() === "" ? void 0 : Number(topK),
        min_score: minScore.trim() === "" ? void 0 : Number(minScore)
      });
      setResult(d);
    } finally {
      setTesting(false);
    }
  });
  const doRebuild = () => run(async () => {
    if (!rebuildFor || !rebuildModelId) return;
    const d = await api.post(
      `/scenarios/${rebuildFor.scenario_id}/embeddings/rebuild`,
      { model_id: rebuildModelId }
    );
    setNotice(`\u573A\u666F\u300C${rebuildFor.scenario_name}\u300D\u5DF2\u91CD\u5EFA ${d.embedded} \u6761\u5207\u7247`);
    setRebuildFor(null);
    loadOverview();
    loadChunks(scenarioId, intentFilter, page);
  });
  const deleteChunk = (c) => run(async () => {
    await api.del(`/vector/chunks?intent_id=${c.intent_id}&example=${encodeURIComponent(c.example)}`);
    setNotice("\u5DF2\u5220\u9664\u5207\u7247");
    loadChunks(scenarioId, intentFilter, page);
    loadOverview();
  });
  const totalPages = Math.max(1, Math.ceil(chunksTotal / size));
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
    error !== "" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ir-banner err", children: error }),
    notice !== "" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ir-banner ok", children: notice }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ir-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ir-card-title", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u53EC\u56DE\u6D4B\u8BD5" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ir-muted", style: { margin: "6px 0" }, children: "\u8F93\u5165\u4E00\u4E2A\u6D4B\u8BD5\u95EE\u9898\uFF0C\u6309\u6240\u9009\u670D\u52A1/\u6A21\u578B\u7684\u5C422 \u53C2\u6570\u6267\u884C\u771F\u5B9E\u5411\u91CF\u68C0\u7D22\uFF0C\u8FD4\u56DE\u6BCF\u6761\u5207\u7247\u7684\u53EC\u56DE\u5206\u6570\u4E0E\u610F\u56FE\u805A\u5408\u7ED3\u679C\uFF0C\u7528\u4E8E\u590D\u76D8\u53EC\u56DE\u4E0D\u51C6\u7684\u95EE\u9898\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ir-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { className: "ir-select", value: scenarioId, onChange: (e) => setScenarioId(e.target.value), children: [
          scenarios.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: "\uFF08\u8BF7\u5148\u521B\u5EFA\u573A\u666F\uFF09" }),
          scenarios.map((s) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: s.id, children: s.name }, s.id))
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "select",
          {
            className: "ir-select",
            value: serviceId,
            onChange: (e) => setServiceId(e.target.value),
            title: "\u9009\u62E9\u670D\u52A1\u65F6\u81EA\u52A8\u7EE7\u627F\u5176\u5411\u91CF\u6A21\u578B\u4E0E\u5C422 \u9608\u503C/TopK",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: "\uFF08\u4E0D\u53C2\u8003\u670D\u52A1\uFF0C\u624B\u52A8\u6307\u5B9A\u6A21\u578B\uFF09" }),
              scenarioServices.map((sv) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: sv.id, children: [
                "\u53C2\u8003\u670D\u52A1\uFF1A",
                sv.name
              ] }, sv.id))
            ]
          }
        ),
        serviceId === "" && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { className: "ir-select", value: modelId, onChange: (e) => setModelId(e.target.value), children: [
          models.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: "\uFF08\u8BF7\u5148\u5728\u6A21\u578B\u914D\u7F6E\u4E2D\u6DFB\u52A0\u5411\u91CF\u6A21\u578B\uFF09" }),
          models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: m.id, children: [
            m.name,
            "\uFF08",
            m.model,
            "\uFF09"
          ] }, m.id))
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            className: "ir-input",
            style: { width: 90 },
            placeholder: "TopK",
            value: topK,
            onChange: (e) => setTopK(e.target.value),
            title: "\u7559\u7A7A\u5219\u7528\u670D\u52A1\u5C422 \u914D\u7F6E\u6216\u9ED8\u8BA4 8"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            className: "ir-input",
            style: { width: 110 },
            placeholder: "\u9608\u503C minScore",
            value: minScore,
            onChange: (e) => setMinScore(e.target.value),
            title: "\u7559\u7A7A\u5219\u7528\u670D\u52A1\u5C422 \u914D\u7F6E\u6216\u9ED8\u8BA4 0.5"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ir-toolbar", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            className: "ir-input",
            style: { flex: 1 },
            placeholder: "\u8F93\u5165\u6D4B\u8BD5\u95EE\u9898\uFF0C\u5982\uFF1A\u5F53\u524DCPU\u5229\u7528\u7387\u6700\u9AD8\u768410\u53F0\u8BBE\u5907",
            value: query,
            onChange: (e) => setQuery(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") doTest();
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "ir-btn primary", disabled: testing || !scenarioId || query.trim() === "", onClick: doTest, children: testing ? "\u68C0\u7D22\u4E2D\u2026" : "\u5F00\u59CB\u53EC\u56DE" })
      ] }),
      result && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { marginTop: 10 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ir-muted", style: { marginBottom: 8 }, children: [
          "\u6A21\u578B ",
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: result.model.name }),
          "\uFF08",
          result.model.model,
          "\uFF09\uFF5C\u5411\u91CF\u7EF4\u5EA6 ",
          result.dims,
          "\uFF5C\u9608\u503C ",
          result.min_score,
          "\uFF5CTopK ",
          result.top_k,
          "\uFF5C\u8017\u65F6 ",
          result.latency_ms,
          "ms \uFF5C\u901A\u8FC7\u9608\u503C\u5E76\u8FDB\u5165\u5019\u9009\u7684\u610F\u56FE\uFF1A",
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { children: result.candidates.length === 0 ? "\uFF08\u65E0\uFF09" : result.candidates.map((c) => c.intent_name).join("\u3001") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ir-card-title", style: { fontSize: 13 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u610F\u56FE\u805A\u5408\uFF08\u5C422 \u5B9E\u9645\u8F93\u51FA\uFF1A\u6BCF\u610F\u56FE\u53D6\u6700\u4F18\u5207\u7247 \u2192 \u9608\u503C\u8FC7\u6EE4 \u2192 TopK \u622A\u65AD\uFF09" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ir-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { className: "ir-table", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u610F\u56FE" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u7F16\u7801" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u6700\u4F18\u5206\u6570" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u547D\u4E2D\u5207\u7247" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u5224\u5B9A" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tbody", { children: [
            result.intents_all.map((c) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: c.intent_name }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: c.intent_code }) }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ScoreBar, { score: c.score, pass: c.pass }) }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "ir-muted ir-desc-cell", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ClampedText, { text: c.best_example, lines: 1, threshold: 60 }) }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: c.pass ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "ir-badge on", children: "\u8FDB\u5165\u5019\u9009" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "ir-badge", children: "\u4F4E\u4E8E\u9608\u503C" }) })
            ] }, c.intent_code)),
            result.intents_all.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { colSpan: 5, className: "ir-muted", children: "\u8BE5\u573A\u666F\u4E0B\u6CA1\u6709\u4EFB\u4F55\u5411\u91CF\u5207\u7247\uFF0C\u8BF7\u5148\u5728\u4E0B\u65B9\u300C\u8986\u76D6\u7387\u6982\u89C8\u300D\u91CD\u5EFA\u5411\u91CF" }) })
          ] })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ir-card-title", style: { fontSize: 13, marginTop: 10 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u5207\u7247\u547D\u4E2D\u660E\u7EC6\uFF08\u539F\u59CB\u53EC\u56DE\uFF0C\u672A\u505A\u610F\u56FE\u805A\u5408\uFF09" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ir-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { className: "ir-table", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "#" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u610F\u56FE" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u5207\u7247\u6587\u672C" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u5206\u6570" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tbody", { children: [
            result.chunks.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "ir-muted", children: i + 1 }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: c.intent_name }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "ir-desc-cell", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ClampedText, { text: c.example, lines: 1, threshold: 60 }) }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ScoreBar, { score: c.score, pass: c.pass }) })
            ] }, i)),
            result.chunks.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { colSpan: 4, className: "ir-muted", children: "\u65E0\u5207\u7247\u547D\u4E2D" }) })
          ] })
        ] }) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ir-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ir-card-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
          "\u5411\u91CF\u5207\u7247\uFF08\u5171 ",
          chunksTotal,
          " \u6761\uFF09"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { className: "ir-select", value: intentFilter, onChange: (e) => setIntentFilter(e.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: "\u5168\u90E8\u610F\u56FE" }),
          intents.map((i) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: i.id, children: [
            i.name,
            "\uFF08",
            i.code,
            "\uFF09"
          ] }, i.id))
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ir-muted", style: { margin: "6px 0" }, children: "\u5207\u7247\u5373\u610F\u56FE\u793A\u4F8B\u6587\u672C\u5BF9\u5E94\u7684\u5411\u91CF\u8BB0\u5F55\uFF0C\u5C422 \u68C0\u7D22\u5C31\u662F\u5728\u8FD9\u4E9B\u5207\u7247\u4E0A\u505A\u4F59\u5F26\u76F8\u4F3C\u5EA6 TopK\u3002\u53D1\u73B0\u810F\u5207\u7247\uFF08\u9519\u6302\u610F\u56FE\u3001\u6587\u672C\u9519\u8BEF\uFF09\u53EF\u76F4\u63A5\u5220\u9664\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ir-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { className: "ir-table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u5207\u7247\u6587\u672C" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u610F\u56FE" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u7EF4\u5EA6" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u6784\u5EFA\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u6784\u5EFA\u65F6\u95F4" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u64CD\u4F5C" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tbody", { children: [
          chunks.map((c) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "ir-desc-cell", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ClampedText, { text: c.example, lines: 1, threshold: 60 }) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("td", { children: [
              c.intent_name,
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { className: "ir-muted", children: c.intent_code })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: c.dims }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: c.model_name ?? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "ir-muted", children: "\u672A\u77E5\uFF08\u65E7\u6570\u636E\uFF09" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "ir-muted", children: c.created_at ? new Date(c.created_at).toLocaleString() : "-" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "ir-link", onClick: () => deleteChunk(c), children: "\u5220\u9664" }) })
          ] }, `${c.intent_id}:${c.example}`)),
          chunks.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { colSpan: 6, className: "ir-muted", children: "\u6682\u65E0\u5207\u7247\uFF0C\u8BF7\u5728\u4E0B\u65B9\u6982\u89C8\u4E2D\u91CD\u5EFA\u5411\u91CF" }) })
        ] })
      ] }) }),
      chunksTotal > size && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ir-toolbar", style: { marginTop: 8, justifyContent: "flex-end" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "ir-btn", disabled: page <= 1, onClick: () => setPage(page - 1), children: "\u4E0A\u4E00\u9875" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "ir-muted", children: [
          page,
          " / ",
          totalPages
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "ir-btn", disabled: page >= totalPages, onClick: () => setPage(page + 1), children: "\u4E0B\u4E00\u9875" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ir-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ir-card-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u8986\u76D6\u7387\u6982\u89C8" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "ir-btn", onClick: loadOverview, children: "\u5237\u65B0" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ir-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { className: "ir-table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u573A\u666F" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u610F\u56FE\u6570" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u793A\u4F8B\u6570" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u5207\u7247\u6570" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u610F\u56FE\u8986\u76D6" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u5411\u91CF\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u6700\u8FD1\u91CD\u5EFA" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u64CD\u4F5C" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tbody", { children: [
          overview.map((o) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: o.scenario_name }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: o.intents }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: o.examples }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: o.chunks }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("td", { children: [
              o.intents === 0 ? "-" : `${o.embedded_intents}/${o.intents}`,
              o.intents > 0 && o.embedded_intents < o.intents && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "ir-badge err", children: "\u6709\u7F3A\u53E3" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: o.models.length > 0 ? o.models.join("\u3001") : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "ir-muted", children: "\u672A\u6784\u5EFA" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "ir-muted", children: o.last_built_at ? new Date(o.last_built_at).toLocaleString() : "-" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "ir-link", onClick: () => {
              setRebuildFor(o);
              setRebuildModelId(models[0]?.id ?? "");
            }, children: "\u91CD\u5EFA" }) })
          ] }, o.scenario_id)),
          overview.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { colSpan: 8, className: "ir-muted", children: "\u6682\u65E0\u573A\u666F" }) })
        ] })
      ] }) })
    ] }),
    rebuildFor && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      Modal,
      {
        title: `\u91CD\u5EFA\u5411\u91CF\uFF1A${rebuildFor.scenario_name}`,
        onClose: () => setRebuildFor(null),
        footer: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "ir-btn", onClick: () => setRebuildFor(null), children: "\u53D6\u6D88" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { className: "ir-btn primary", disabled: !rebuildModelId, onClick: doRebuild, children: "\u5F00\u59CB\u91CD\u5EFA" })
        ] }),
        children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: "\u9009\u62E9\u5411\u91CF\u6A21\u578B", hint: "\u91CD\u5EFA\u4F1A\u7528\u8BE5\u6A21\u578B\u5BF9\u8BE5\u573A\u666F\u5168\u90E8\u610F\u56FE\u793A\u4F8B\u91CD\u65B0\u8BA1\u7B97\u5411\u91CF\uFF1B\u7EF4\u5EA6\u53D8\u5316\u65F6\u65E7\u5207\u7247\u4F1A\u88AB\u8986\u76D6\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { className: "ir-select", value: rebuildModelId, onChange: (e) => setRebuildModelId(e.target.value), children: [
          models.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: "\uFF08\u8BF7\u5148\u5728\u6A21\u578B\u914D\u7F6E\u4E2D\u6DFB\u52A0\u5411\u91CF\u6A21\u578B\uFF09" }),
          models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("option", { value: m.id, children: [
            m.name,
            "\uFF08",
            m.model,
            "\uFF09"
          ] }, m.id))
        ] }) })
      }
    )
  ] });
}

// src/client/App.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function App({ t }) {
  const [tab, setTab] = (0, import_react7.useState)("intents");
  const [health, setHealth] = (0, import_react7.useState)(null);
  const refreshHealth = (0, import_react7.useCallback)(() => {
    api.get("/health").then(setHealth).catch(() => setHealth({ ok: false, connected: false, error: "\u540E\u7AEF\u63A5\u53E3\u4E0D\u53EF\u8FBE" }));
  }, []);
  (0, import_react7.useEffect)(refreshHealth, [refreshHealth]);
  const disconnected = health !== null && !health.connected;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ir-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("header", { className: "ir-page-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ir-page-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { className: "ir-page-title", children: t("title") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "ir-page-sub", children: t("intro") })
      ] }),
      health !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: `ir-badge ${health.connected ? "running" : "err"}`, title: health.error, children: health.connected ? "\u25CF \u6570\u636E\u5E93\u5DF2\u8FDE\u63A5" : "\u25CF \u6570\u636E\u5E93\u672A\u8FDE\u63A5" })
    ] }),
    disconnected && tab !== "connection" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ir-banner err", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
        "PostgreSQL \u672A\u8FDE\u63A5",
        health?.error ? `\uFF1A${health.error}` : "",
        "\u3002\u573A\u666F\u3001\u610F\u56FE\u3001\u670D\u52A1\u4E0E\u6A21\u578B\u6570\u636E\u90FD\u4FDD\u5B58\u5728\u6570\u636E\u5E93\u4E2D\uFF0C\u5B8C\u6210\u914D\u7F6E\u540E\u81EA\u52A8\u6062\u590D\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { className: "ir-btn", onClick: () => setTab("connection"), children: "\u53BB\u914D\u7F6E" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("nav", { className: "ir-tabs", children: ["intents", "services", "vector", "models", "connection"].map((k) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { className: `ir-tab ${tab === k ? "active" : ""}`, onClick: () => setTab(k), children: t(k === "intents" ? "tabIntents" : k === "services" ? "tabServices" : k === "vector" ? "tabVector" : k === "models" ? "tabModels" : "tabConnection") }, k)) }),
    tab === "intents" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(IntentsTab, {}),
    tab === "services" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ServicesTab, {}),
    tab === "vector" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(VectorTab, {}),
    tab === "models" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ModelsTab, {}),
    tab === "connection" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ConnectionTab, { onChanged: refreshHealth })
  ] });
}

// src/client/PanelIcon.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function PanelIcon({ size }) {
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("circle", { cx: "5", cy: "12", r: "2.2" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("circle", { cx: "19", cy: "5.5", r: "2.2" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("circle", { cx: "19", cy: "12", r: "2.2" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("circle", { cx: "19", cy: "18.5", r: "2.2" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M7.2 12h4.6" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M11.8 12 16.4 6.2" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M11.8 12h4.4" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M11.8 12l4.6 5.8" })
      ]
    }
  );
}

// src/client/locales.ts
var zh = {
  nav: "\u610F\u56FE\u8BC6\u522B",
  panel: "\u610F\u56FE\u8BC6\u522B",
  title: "\u610F\u56FE\u8BC6\u522B",
  intro: "\u4E94\u5C42\u610F\u56FE\u8BC6\u522B\u6D41\u6C34\u7EBF\uFF1A\u89C4\u5219\u786C\u8FC7\u6EE4 \u2192 \u5411\u91CF\u68C0\u7D22 \u2192 Jev \u6982\u7387\u7CBE\u5224 \u2192 \u8F7B\u91CF\u5FAE\u8C03 \u2192 LLM \u7ED3\u6784\u5316\u515C\u5E95\u3002",
  tabIntents: "\u610F\u56FE\u7BA1\u7406",
  tabServices: "\u670D\u52A1\u7BA1\u7406",
  tabVector: "\u5411\u91CF\u68C0\u7D22",
  tabModels: "\u6A21\u578B\u914D\u7F6E",
  tabConnection: "\u6570\u636E\u5E93"
};
var en = {
  nav: "Intent Recognition",
  panel: "Intent Recognition",
  title: "Intent Recognition",
  intro: "Five-layer intent pipeline: rule filter \u2192 vector retrieval \u2192 Jev scoring \u2192 fine-tuned arbitration \u2192 LLM structured fallback.",
  tabIntents: "Intents",
  tabServices: "Services",
  tabVector: "Vector Lab",
  tabModels: "Models",
  tabConnection: "Database"
};

// src/client/styles.ts
var CSS = `
/* Page scaffold: own padding box (also protects the title from being clipped
   by the host container), dsh-market-style header + segmented tabs. The page
   scrolls internally \u2014 the host panel area does not grow with content. */
.ir-page { box-sizing: border-box; width: 100%; max-width: 1120px; margin: 0 auto;
  padding: 26px 32px 56px; display: flex; flex-direction: column; gap: 18px;
  height: 100%; max-height: 100%; overflow-y: auto;
  color: var(--dsw-color-text-primary, #222); }
.ir-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ir-page-heading { min-width: 0; }
.ir-page-title { margin: 0; font-size: 22px; font-weight: 650; line-height: 1.4; letter-spacing: 0.2px;
  overflow: visible; text-overflow: clip; }
.ir-page-sub { margin: 6px 0 0; color: var(--dsw-color-text-tertiary, #888); font-size: 13px;
  line-height: 1.7; max-width: 760px; }
.ir-tabs { display: inline-flex; gap: 2px; padding: 3px; align-self: flex-start;
  border: 1px solid var(--dsw-color-border, #e2e2e2); border-radius: 10px;
  background: var(--dsw-color-bg-spotlight, #f5f6f8); }
.ir-tab { padding: 6px 18px; border: none; background: none; cursor: pointer; font-size: 13px;
  border-radius: 8px; color: var(--dsw-color-text-secondary, #666); }
.ir-tab:hover { color: var(--dsw-color-text-primary, #222); }
.ir-tab.active { background: var(--dsw-color-bg-container, #fff); color: var(--dsw-color-text-primary, #222);
  font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.ir-banner { display: flex; align-items: center; gap: 12px; padding: 10px 14px; font-size: 13px;
  border: 1px solid #ffe58f; background: #fffbe6; color: #ad6800; border-radius: 10px; }
.ir-banner.err { border-color: #ffccc7; background: #fff2f0; color: #cf1322; }
.ir-banner.ok { border-color: #b7eb8f; background: #f6ffed; color: #389e0d; }
.ir-banner .ir-btn { margin-left: auto; flex: none; }
.ir-kv { display: grid; grid-template-columns: 120px 1fr; gap: 6px 14px; font-size: 13px; margin: 10px 0 0; }
.ir-kv dt { color: var(--dsw-color-text-tertiary, #999); }
.ir-kv dd { margin: 0; word-break: break-all; }
.ir-layout { display: flex; gap: 16px; align-items: flex-start; }
.ir-side { width: 264px; flex: none; display: flex; flex-direction: column; gap: 8px; }
.ir-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.ir-card { border: 1px solid var(--dsw-color-border, #e2e2e2); border-radius: 12px; padding: 12px 14px;
  background: var(--dsw-color-bg-container, #fff); }
.ir-card.pad { padding: 16px 18px; }
.ir-card.selected { border-color: var(--dsw-color-primary, #4d6bfe); box-shadow: 0 0 0 1px var(--dsw-color-primary, #4d6bfe) inset; }
.ir-card-title { font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ir-muted { color: var(--dsw-color-text-tertiary, #999); font-size: 12px; }
.ir-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ir-btn { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--dsw-color-border, #d0d0d0);
  background: var(--dsw-color-bg-container, #fff); cursor: pointer; font-size: 13px; color: inherit; }
.ir-btn:hover { border-color: var(--dsw-color-primary, #4d6bfe); }
.ir-btn.primary { background: var(--dsw-color-primary, #4d6bfe); border-color: transparent; color: #fff; }
.ir-btn.danger { color: #d4380d; }
.ir-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ir-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ir-table-wrap { overflow-x: auto; }
.ir-table td.ir-desc-cell { max-width: 380px; word-break: break-all; }
.ir-clamped .ir-link { margin-left: 4px; }
.ir-desc-clamp { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
.ir-link { border: none; background: none; padding: 0 2px; cursor: pointer; font-size: 12px;
  color: var(--dsw-color-primary, #4d6bfe); }
.ir-card .ir-card-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; }
.ir-table th, .ir-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--dsw-color-border, #eee); vertical-align: top; }
.ir-table th { color: var(--dsw-color-text-tertiary, #999); font-weight: 500; white-space: nowrap; }
.ir-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.ir-field label { font-size: 12px; color: var(--dsw-color-text-secondary, #666); }
.ir-input, .ir-select, .ir-textarea { padding: 6px 10px; border-radius: 6px; font-size: 13px; color: inherit;
  border: 1px solid var(--dsw-color-border, #d0d0d0); background: var(--dsw-color-bg-container, #fff); font-family: inherit; }
.ir-textarea { min-height: 72px; resize: vertical; }
.ir-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; z-index: 1000;
  align-items: flex-start; justify-content: center; padding-top: 8vh; }
.ir-modal { background: var(--dsw-color-bg-elevated, #fff); border-radius: 12px; padding: 20px; width: 620px;
  max-width: 92vw; max-height: 80vh; overflow: auto; color: var(--dsw-color-text-primary, #222); }
.ir-modal h3 { margin: 0 0 14px; font-size: 16px; }
.ir-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.ir-badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; }
.ir-badge.running { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
.ir-badge.stopped { background: #fafafa; color: #999; border: 1px solid #d9d9d9; }
.ir-badge.on { background: #e6f4ff; color: #0958d9; border: 1px solid #91caff; }
.ir-badge.off { background: #fafafa; color: #bbb; border: 1px solid #e0e0e0; }
.ir-badge.err { background: #fff2f0; color: #cf1322; border: 1px solid #ffccc7; }
.ir-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.ir-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.ir-layers { display: flex; flex-direction: column; gap: 8px; }
.ir-layer { display: flex; gap: 12px; align-items: center; padding: 10px 12px;
  border: 1px solid var(--dsw-color-border, #e2e2e2); border-radius: 8px; flex-wrap: wrap; }
.ir-layer .name { font-weight: 600; font-size: 13px; width: 190px; flex: none; }
.ir-layer .params { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; }
.ir-layer .params input { width: 70px; padding: 4px 8px; border-radius: 6px;
  border: 1px solid var(--dsw-color-border, #d0d0d0); background: transparent; color: inherit; }
.ir-pre { background: var(--dsw-color-bg-spotlight, #f6f6f6); border-radius: 8px; padding: 10px;
  font-size: 12px; overflow: auto; max-height: 320px; white-space: pre-wrap; word-break: break-all; }
.ir-error { color: #cf1322; font-size: 12px; }
.ir-ok { color: #389e0d; font-size: 12px; }
.ir-trace { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
/* score bar\uFF08\u5411\u91CF\u53EC\u56DE\u5206\u6570\u53EF\u89C6\u5316\uFF09 */
.ir-scorebar { position: relative; display: inline-block; width: 140px; height: 16px; background: var(--dsw-color-fill-2, #f0f1f5); border-radius: 8px; overflow: hidden; vertical-align: middle; }
.ir-scorebar-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 8px; }
.ir-scorebar-fill.on { background: var(--dsw-color-success, #34a853); }
.ir-scorebar-fill.off { background: var(--dsw-color-warning, #f9ab00); }
.ir-scorebar-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--dsw-color-text-1, #1f2329); }
/* loading spinner\uFF08\u6D4B\u8BD5\u670D\u52A1\u300C\u8BC6\u522B\u4E2D\u300D\u7B49\u6309\u94AE\u52A0\u8F7D\u6001\uFF09 */
.ir-spinner { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: -2px;
  border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
  animation: ir-spin 0.7s linear infinite; }
@keyframes ir-spin { to { transform: rotate(360deg); } }
`;
function injectStyles(id) {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = id;
  tag.dataset.pluginCss = id;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

// src/client/index.ts
var inject = ["slots", "locale"];
var NS = "settings.intent-recognition";
var PANEL_ID = "intent-recognition";
function apply(ctx) {
  injectStyles("dsh-intent-recognition");
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.locale.register(NS, { zh, en }));
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: "intent-recognition",
        order: 30,
        label: () => t("nav"),
        locale: NS,
        inject: () => ({ t })
      },
      App
    )
  );
  ctx.slots.inject(
    "main",
    () => ctx.slots.register(
      {
        name: "main",
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ t })
      },
      App
    )
  );
  ctx.slots.inject(
    "sidebar.panellist",
    () => ctx.slots.register(
      {
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: 20,
        label: () => t("panel"),
        locale: NS
      },
      PanelIcon
    )
  );
}
return module.exports;}});
//# sourceMappingURL=client.js.map
