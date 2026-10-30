# dsh-intent-recognition

[English](README.md) | 中文

DeepSeek Harness（DSH）意图识别插件：五层流水线路由架构 + 场景/意图管理 Web 界面 + PostgreSQL/pgvector 存储 + 可分发 API 服务 + DSH 生态路由（工具 / 工作流 / 子智能体 / Cordis 服务）。

```
用户 Query
   │
   ▼
┌─ 层1 规则硬过滤 ───────────── 问候 / 退出 / 指令 / 关键词强匹配（词库+正则+黑名单+白名单）
│      │ 未命中
├─ 层2 向量检索 ─────────────── pgvector 余弦相似度，把意图库压缩为 Top5–Top10 候选
│      │
├─ 层3 Jev 概率精判 ─────────── 高置信直接路由 → 中置信 → 层4；低置信 → 层5
│      │
├─ 层4 轻量微调模型 ─────────── BERT / 小参数 LLM，仲裁高相似意图与边界 case
│      │
└─ 层5 LLM 结构化兜底 ───────── 多意图叠加 / 跨轮上下文 / 槽位抽取 / 未知 Query，JSON 结构化输出
```

**每一层都可在服务配置中单独关闭**，关闭的层会被流水线直接跳过。

## 定位：控制面 + 数据面

本插件在 DSH 中分两层发挥作用：

- **控制面（管理 UI）**：左侧边栏「意图识别」面板（与「插件」入口同级，可在侧边栏 More 菜单中固定/取消固定），同时保留 设置 → 意图识别 分区，两处渲染同一管理界面，用于维护意图库、配置模型、创建/运行服务。只是工具，不参与对话。
- **数据面（被消费的服务）**：真正和 DSH 对话链路对接的部分。运行中的服务通过下面三种方式被消费：

| 消费方式 | 说明 | 适用 |
| --- | --- | --- |
| **Agent 工具**（推荐） | 每个运行中的服务自动注册一个工具 `intent_recognize_<服务名>`，DSH 主 Agent 可直接调用；高置信命中时工具内直接执行路由 | 用户和 DSH 对话，意图服务做分发 |
| **Cordis 服务** | `ctx.intentRecognition.predict(service, query, context)`，供其他插件程序化调用 | 下游插件自己集成 |
| **HTTP API** | `POST /dsh-intent-recognition/api/v1/predict`（Bearer 服务 API Key） | 外部系统 |

## 功能

- **意图管理**：按场景创建意图类别（名称/编码/描述/示例/关键词/黑白名单/路由配置），Excel 导入（合并/覆盖）与导出，一键重建示例向量。
- **服务管理**：按场景创建 API 服务，五层独立开关与参数（阈值/TopK 等），服务可 **运行 / 停止 / 删除 / 复制**；每个服务独立 API Key；内置在线测试台与调用日志。
- **向量检索实验室**：层2 复盘专用页签——召回测试（输入问题看每条切片命中分数与意图聚合结果，可参照服务的阈值/TopK）、切片浏览（示例文本/维度/构建模型/时间，可删脏切片）、覆盖率概览（各场景意图/示例/切片数量与缺口，就地重建）。
- **路由执行**：意图可配置路由（无 / DSH 工作流 / 子智能体 / Cordis 服务），服务级 `route_mode` 控制自动执行或仅建议。
- **模型配置**：向量模型、Jev 模型、轻量微调模型、LLM 全部页面化配置（OpenAI 兼容接口或自定义 http JSON 接口），支持连通性测试。
- **存储**：PostgreSQL + pgvector（向量与业务数据同库）。
- **Agent 集成**：运行中的服务自动注册/注销 `intent_recognize_<slug>` 工具；可选向系统提示词注入当前可用意图服务清单。

## 安装

前置：Node.js ≥ 20，已安装 DSH（`npm i -g @deepseek-ai/dsh`）。

```sh
# 1. 启动 PostgreSQL + pgvector（或复用你已有的实例）
docker compose up -d

# 2. 安装插件（发布到 npm 后）
dsh plugin --profile web add dsh-intent-recognition

# 或从本地目录 / tarball 安装
dsh plugin --profile web add ./dsh-intent-recognition
dsh plugin --profile web add ./dsh-intent-recognition-0.3.3.tgz

# 3. 重启 dsh web（桌面版：重启应用或刷新页面 Ctrl+R）
#    —— 客户端 bundle 只在页面启动时按启动图加载，安装后必须刷新才会出现
# 4. 点击左侧边栏「意图识别」图标打开管理面板（或 设置 → 意图识别）
# 5. 首次使用：打开「数据库」页签，填入 PostgreSQL 地址/账号/密码，
#    「测试连接」通过后「测试并保存」即完成接入（即时生效，无需重启）
```

> **数据库配置时机**：选在**安装完成后、首次打开页面时**配置，而不是安装时。原因：连接串不可能存进数据库自身；安装插件时不应要求用户先备好 YAML 与数据库实例。页面配置持久化到用户配置目录（见下），补丁里的 `databaseUrl` 仅作兜底。数据库未连接时插件照常加载，侧边栏面板可打开，仅数据接口返回 503 并在页面顶部给出引导横幅。

> **桌面版注意**：安装/升级本插件后，如果侧边栏没有出现「意图识别」入口，先刷新页面（Ctrl+R 或重启应用）。这是 DSH 的启动图机制决定的：页面只在启动时加载一次插件客户端清单，官方插件管理页在安装后也会弹出「刷新」提示。刷新后入口仍缺失时，再检查 设置 → 意图识别 分区是否存在——两者同源，都不存在说明客户端未加载，请在插件详情页确认组件「运行中」。

> 侧边栏入口通过 DSH 的 `sidebar.panellist` + `main` 面板插槽注册，与官方「插件」「计划任务」入口同一机制：点击图标在主区域打开完整管理页；不想显示时，在侧边栏 More 菜单里取消固定即可（外壳内建能力，无需插件配置）。

本包声明了 `dsh.bundle.patch`，`dsh plugin add` 会自动把它挂进 profile 的 bundle 层栈，无需手工编辑 `cordis.patch.yml`。

## 数据库连接（页面化配置）

「意图识别 → 数据库」页签提供完整的连接管理：表单（主机/端口/库名/账号/密码/SSL）或直接粘贴连接串，支持**测试连接**（同时探测 pgvector 扩展是否可用）、**测试并保存**（持久化 + 连接池热切换，全程无需重启插件或桌面端）、**清除页面配置**（回退到补丁连接串）。

- **生效优先级**：页面保存的配置 > `cordis.patch.yml` 的 `databaseUrl` > 内置默认值。
- **持久化位置**：`%APPDATA%/dsh-intent-recognition/connection.json`（Windows）、`~/Library/Application Support/dsh-intent-recognition/connection.json`（macOS）、`~/.config/dsh-intent-recognition/connection.json`（Linux）；可用环境变量 `DSH_INTENT_RECOGNITION_CONFIG` 覆盖。文件权限 0600，页面回显时密码脱敏为 `***`（PUT 时提交 `***` 表示沿用已保存密码）。
- **容错**：数据库不可达不会阻塞插件加载；除 `/health` 与 `/connection*` 外的管理接口统一返回 503，页面顶部出现引导横幅。连接断开后在「数据库」页修正并保存即可恢复。
- **pgvector**：`autoMigrate` 开启时，保存成功后会自动 `CREATE EXTENSION IF NOT EXISTS vector` 并建表；测试连接会提前提示目标实例是否安装了 pgvector。
- **数据库维护（v0.6.0 新增）**：连接配置下方提供**检查数据库 / 创建数据库 / 删除数据库**。检查用于确认连接串指向的库是否已存在；创建会一次性完成**建库 + 安装 pgvector 扩展 + 初始化全部 ir_* 表**；删除是高危操作，弹窗会红色警示并要求**完整输入数据库名二次确认**（系统库 `postgres`/`template0`/`template1` 不允许删除）。维护操作使用同一组凭据连接到该实例的 `postgres` 维护库执行，因此当前业务库不存在时也能创建它。

## 插件配置（cordis.patch.yml）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `databaseUrl` | `postgres://postgres:postgres@127.0.0.1:5432/dsh_intent` | 兜底连接串（页面配置优先于它），库内需可用 pgvector（`CREATE EXTENSION vector`，插件自动执行） |
| `embeddingDim` | `1024` | 向量维度，必须与实际使用的向量模型一致；修改后需重建向量 |
| `autoMigrate` | `true` | 加载时自动建表/建索引（HNSW 余弦索引，pgvector ≥ 0.5） |
| `adminToken` | `''` | 管理 API 的 Bearer 令牌；为空时仅受 DSH loopback 保护 |
| `registerTool` | `true` | 是否向 Agent 注册每服务一个的 `intent_recognize_<slug>` 工具 |
| `contributePrompt` | `true` | 是否向系统提示词注入可用意图服务清单（帮助 Agent 发现工具） |

## 意图路由（Route）

每个意图可配置一条路由，命中后告诉系统「接下来去哪」：

| 路由类型 | 配置项 | 说明 |
| --- | --- | --- |
| `none` | — | 只返回识别结果，不跳转 |
| `workflow` | 路由目标（流程名）+ 工作流脚本 | 在 DSH 工作流引擎中启动一次运行，脚本内可自由编排（调用子智能体、工具、其他插件服务） |
| `subagent` | 路由目标 = **Agent Preset id** | 以指定预设唤起一个子智能体处理该 query（`provider: spawn`，结果回传调用方） |
| `service` | 路由目标 = `服务名.方法名` | 调用宿主中另一个 Cordis 服务的方法（其他插件提供的能力） |

### 执行策略（route_mode）

在服务编辑页选择：

- **auto（默认）**：确定性命中（层1 / 层3 / 层4）由工具**直接执行路由**，保证低延迟、低成本的确定性路径真正落地；层5（LLM 兜底）命中时只返回路由建议，由主 Agent 决定是否执行。
- **suggest**：永不自动执行，只把路由信息返回给调用方（Agent 或 HTTP 客户端）。

识别结果中的 `route` 字段携带路由配置；若被执行，结果中额外出现 `route_result`（`ok / value / error`）。

### 工作流脚本使用说明

路由类型选 `workflow` 时，在意图编辑弹窗中直接编写工作流脚本（页面内有可折叠的完整说明）。脚本收到如下入参：

| 变量 | 内容 |
| --- | --- |
| `args.query` | 用户原始输入 |
| `args.intent` | 命中的意图编码（如 `query_balance`） |
| `args.confidence` | 置信度（0–1） |
| `args.matched_layer` | 命中层（`l1`–`l5`） |
| `args.slots` | 层5 抽取的槽位（对象） |
| `args.context` | 调用方传入的上下文数组 |
| `agent(prompt)` | 在脚本内唤起子智能体 |
| `meta` | 运行元信息（`meta.name` = 路由目标） |

示例（脚本体，按意图分支编排两个子智能体）：

```js
const intent = args.intent;
if (intent === 'query_balance') {
  return await agent(`用户想查询余额。原话：${args.query}，请查询并回答。`);
}
if (intent === 'transfer') {
  const amount = args.slots?.amount ?? '未知金额';
  return await agent(`用户想转账 ${amount}。原话：${args.query}，请引导确认后执行。`);
}
return `未能处理的意图：${intent}`;
```

工作流运行以 `meta.name = <路由目标>`（清洗为 kebab-case）记录，可在 DSH 的运行面板中查看。

### 下游能力如何接入 DSH

整个系统以 DSH 为骨架，意图路由和下游智能体/工作流都以插件形式接入：

1. **工作流**：脚本写在意图的路由配置里，随意图库一起导入导出（Excel 的「工作流脚本」列），无需额外安装。需要复用能力时在脚本里调 `agent()` 或通过 route type `service` 调其他插件。
2. **子智能体**：下游能力以 **Agent Preset** 插件（参考 `@deepseek-ai/dsh-agent-preset`）形式安装，preset id 填进意图的「路由目标」。
3. **Cordis 服务**：下游插件在 `apply` 中 `ctx.reflect.provide('xxxService', ...)`，意图路由目标填 `xxxService.methodName`，参数按 `(result, exec)` 传入（`result` 含 query/intent/confidence/slots）。

## 在对话窗口中使用（Agent 工具）

服务进入「运行中」后，插件会自动向 DSH 注册一个对话工具 `intent_recognize_<slug>`（slug 取自服务名称，服务停止时自动注销）。之后在任意会话里正常提问即可——主 Agent 会按需调用该工具完成意图识别并按路由配置分发到工作流 / 子智能体 / Cordis 服务；也可以显式指示，例如「用 intent_recognize_bank_router 判断一下：我要转账」。

服务列表的每个服务卡片上会显示「对话工具已注册 / 未注册」徽标；若注册失败（例如与既有工具重名），徽标下方会展示具体原因。注册状态随服务启停实时同步。

> 注意：`注册为对话工具` 是插件配置项（`registerTool`，默认开启）。工具需要 DSH 提供 `tools` 服务（web/桌面版默认具备）。

## 向量检索实验室（层2 复盘）

「向量检索」页签解决「向量召回不准时无处排查」的问题，三个区块：

1. **召回测试**：选择场景后输入任意测试问题，复刻引擎层2 的真实检索逻辑（同一 `searchSimilar` + 每意图取最优切片 + minScore 过滤 + TopK 截断）。可选择「参考服务」自动继承其向量模型与层2 阈值/TopK，也可手动指定模型并临时调整阈值。结果分两张表：
   - **意图聚合**：层2 实际会输出的候选集（哪些意图进入后续层、各自最优分数、命中切片）；
   - **切片命中明细**：原始召回的每条切片及分数——召回不准时直接看到是哪个示例切片得分异常。
2. **切片浏览**：查看场景下全部向量切片（示例文本、所属意图、向量维度、构建模型、构建时间），支持按意图过滤与分页；发现错挂/脏切片可直接删除。
3. **覆盖率概览**：每个场景的意图数/示例数/切片数、意图覆盖缺口、构建所用模型与最近重建时间，并可就地选择模型触发重建。

向量切片会记录构建它的模型（`model_id` 溯源）；切换向量模型或修改示例后建议重建，否则新旧切片维度/语义空间不一致。

## 模型配置说明（设置 → 意图识别 → 模型配置）

| 类型 | 用途 | 接口样式 |
| --- | --- | --- |
| 向量模型 | 层2 检索 | `openai`（自动拼 `/v1/embeddings`）或 `http`（POST `{model, texts}` → `{embeddings}`） |
| Jev 模型 | 层3 概率精判 | `http`（POST `{text, candidates}` → `{scores:[{code,score}]}`；配置了 systemone 扩展配置时 POST `{model, state, questions}` → `{answers:{code:score}}`）或 `openai`（提示词约束输出 JSON） |
| 微调模型 | 层4 仲裁 | `http`（POST `{text, candidates}` → `{label, confidence}`）或 `openai` |
| LLM | 层5 兜底 | `openai`（`/v1/chat/completions`，JSON mode 结构化输出） |

扩展配置（extra JSON）支持：`timeout_ms`、`temperature`、`headers`、`embeddings_path`、`chat_path`、`prompt`（自定义层5 系统提示词）。

### Jev 扩展配置自动生成（systemone 报文）

Jev 模型编辑弹窗内置两种「扩展配置自动生成」，选择一个已配置好意图的场景后按需点击：

- **AI 自动生成扩展配置**：调用已配置的 LLM 生成（需先在模型配置中添加 LLM；未配置或调用失败会直接报错，可改用规则模板）。意图描述全文（含定义/归入信号/排除规则/边界区分与示例）会完整透传给大模型，提示词要求忠实保留归入/排除规则、不得臆造。
- **规则模板生成**：不依赖 LLM 的确定性模板，把每个意图的描述全文嵌入 `instructions`。

两者都**一次生成三种判定方式**（`modes.score` / `modes.choice` / `modes.noul`）。v0.6.0 起每种方式**只有一个名为 `intent_recognition` 的问题**，一次调用完成全部候选意图的判定：

| 模式 | type | criteria | 应答 | 折算分数 |
| --- | --- | --- | --- | --- |
| score 评分 | `score` | 各意图判定描述字符串数组，另含 `intent_order`（意图编码顺序，与 criteria 一一对应） | 分数数组（按 `intent_order` 顺序）或 `{编码: 分数}` 对象 | 数组按 `intent_order` 映射到意图，取 0~1 数值 |
| choice 单选 | `choice` | `{意图名: 判定描述}` 对象 | 一个意图名 | 选中的意图=1，其余=0 |
| noul 是非 | `noul` | 无（`map` 把“是”/“否”映射到两个意图编码） | “是”/“否” | 按 `map` 映射：命中=1，另一=0 |

> **noul 仅二分类场景生成**：场景意图个数不等于 2 时不生成 `modes.noul`（是/否无法覆盖多意图）；服务层3 判定方式请勿选择 noul。

**运行时启用哪种模式由服务决定**：服务编辑页层3 的「判定方式」下拉（score/choice/noul，默认 score）保存后，层3 即按 `modes.<方式>` 组报文；旧版扩展配置（每个意图一个问题的 `modes`，或顶层单个 `questions`）继续兼容，按每意图问题集逐意图调用。

层3 的两个置信阈值决定命中走向：**最高分 ≥ 高置信阈值** → 直接命中（跳过层4/层5）；**位于 [中置信阈值, 高置信阈值)** → 压缩候选交层4 仲裁；**低于中置信阈值** → 交层5 兜底。生成结果只是草稿，填入扩展配置框后请审核再保存。

配置了该扩展配置的 Jev 模型（`api_style=http`）在层3 判定时会改用 systemone 报文：

```
POST {base_url}
{ "model": "<模型名>", "state": "<用户输入文本>", "questions": { "intent_recognition": <modes.判定方式 的问题> } }
→ { "answers": { "intent_recognition": [0.9, 0.1] | "查询余额" | "是" } }
```

score 应答可以是与 `intent_order` 等长的数组、`{scores|values|results: [...]}` 包裹或 `{编码: 分数}` 对象；choice 应答是意图名（兼容「」引号、编码、大小写与包含匹配）；noul 应答是“是”/“否”（按问题 `map` 映射）。三种模式的应答也兼容对象形式：`{choice: "意图名", confidence: 1, probabilities: {意图名: 概率}}`——有 `probabilities` 概率表时直接按概率折算，否则取 `choice`/`answer`/`value` 等标签字段匹配。旧版每意图问题集的应答 `{"answers": {"<意图编码>": ...}}` 继续兼容：取值可以是数值、布尔、`"是"/"否"/"true"` 文本或 `{score|probability|confidence}` 对象。

### 层2 检索透明度

服务的层2 配置中，「置信度阈值（最低相似度）」（`minScore`）就是切片筛选阈值——召回切片分数低于它的不会进入候选。测试服务的 trace 里，层2 现在会带 `minScore` / `topK` / `chunks`（每条原始召回切片的分数与是否过阈）/ `candidates`（聚合过滤后的结果），“召回了但没被采用”可直接定位是阈值过滤还是聚合截断；层3 trace 带 `mode`（判定方式）。

## 对外 API

服务启动后即可调用：

```sh
curl -X POST http://127.0.0.1:3080/dsh-intent-recognition/api/v1/predict \
  -H "Authorization: Bearer ir_xxxx" \
  -H "Content-Type: application/json" \
  -d '{"query": "帮我查一下卡里还有多少钱", "context": []}'
```

返回：

```json
{
  "intent": { "code": "query_balance", "name": "查询余额" },
  "confidence": 0.93,
  "matched_layer": "l3",
  "route": { "type": "workflow", "target": "balance-flow", "script": "..." },
  "trace": [ { "layer": "l1", "hit": false, "...": "..." } ],
  "latency_ms": 41
}
```

管理 API（供 Web UI 使用，受 `adminToken` 保护）：
`GET/POST /scenarios`、`PUT/DELETE /scenarios/:id`、`GET/POST /scenarios/:id/intents`、`PUT/DELETE /intents/:id`、`GET /scenarios/:id/intents/export`、`POST /scenarios/:id/intents/import`、`POST /scenarios/:id/embeddings/rebuild`、`GET/POST /models`、`PUT/DELETE /models/:id`、`POST /models/:id/test`、`GET/POST /services`、`POST /services/:id/start|stop|copy`、`POST /services/:id/predict`、`GET /services/:id/logs`。

### 其他插件程序化调用

```ts
// 在其他 dsh 插件的 apply(ctx) 中
const ir = ctx.get('intentRecognition');
if (ir) {
  const result = await ir.predict('bank-router', '帮我查余额', []);
  // result.route / result.matched_layer / result.confidence ...
}
```

## Excel 模板

首行表头：`名称 | 编码 | 描述 | 示例 | 关键词 | 黑名单 | 白名单 | 路由类型 | 路由目标 | 工作流脚本`。示例列内多值用换行分隔，其余用「、」分隔；路由类型取值 `none / workflow / subagent / service`（留空时若填了路由目标或脚本则自动推断为 `workflow`）。导出文件即为模板。

## 开发

```sh
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm build       # 产出 lib/index.js + lib/client.js（esbuild）
node test/smoke.mjs           # 端到端流水线（需要本地 PostgreSQL+pgvector，见 test/README.md）
node test/cordis-load.mjs     # 真实 Cordis 宿主集成（工具注册/路由分发/提示词注入）
node test/connection.mjs      # 数据库不可达时的离线启动与 503 守卫（无需数据库）
node test/client-contract.mjs # 客户端 bundle 槽位注册契约（无需浏览器）
```

源码布局：`src/index.ts`（宿主入口/Cordis 集成）、`src/pipeline/engine.ts`（五层引擎）、`src/dispatcher.ts`（路由分发：workflow/subagent/service）、`src/service-tools.ts`（每服务工具注册）、`src/routes.ts`（REST API）、`src/db.ts`（PostgreSQL/pgvector，支持连接池热切换）、`src/connection.ts`（页面化连接管理）、`src/models.ts`（模型调用）、`src/excel.ts`（导入导出）、`src/client/`（React 管理页，`settings.section` + `main` + `sidebar.panellist` 插槽）。

## License

MIT
