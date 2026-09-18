# image-to-pptx — Ticket 清单（阶段 3）

状态：pending / in_progress / completed
拆分思路：先固化基线（T0）→ 产品壳（T1）→ 两个独立小改动（T2 解封 .fig、T3 门禁与检测）→ 核心新增（T4 PPTX 路由）→ UI 接线（T5）→ 多页（T6）→ 端到端收口（T7）。
最大风险点：**T4**（跨进程调用 + 画布尺寸缺陷 + ZIP 消毒交互）。

| # | Ticket | 状态 |
| --- | --- | --- |
| T0 | 基线固化与版本控制 | pending |
| T1 | 产品壳与启动器 | pending |
| T2 | 解封切图 .fig 导出 | pending |
| T3 | Key 门禁与 PowerPoint 检测 | pending |
| T4 | PPTX 导出路由 | pending |
| T5 | PPTX UI 控件与比例选择 | pending |
| T6 | 多页合并 | pending |
| T7 | 端到端冒烟与文档 | pending |

---

## Ticket T0：基线固化与版本控制

**目标**
建立可回滚的版本控制基线，并记录两侧工具改造前的测试基线。

**背景**
spec 风险表首条：要改 `server.js` 与 381 KB 的 `app.js`，没有回滚点不安全。用户已授权 git init（Q7）。

**修改范围**
新增 `.git`；可能微调 `.gitignore`。不改任何源码。

**任务**
1. `git init`，确认 `git` 可用。
2. 校验 `.gitignore` 覆盖 `node_modules/`、`.image-to-html-data/`、`.work/`、`test-results/`、`*.log`。
3. 首次提交当前状态。
4. 运行 `tools/image-to-html` 的 `npm test` 并记录结果；运行 `tools/html-to-pptx` 的 `npm test` 并记录（预期为空跑）。

**验收标准**
`git log` 有一次提交；`git status` 干净；两侧测试基线结果已记录。

**测试要求**
不新增测试；只记录既有基线。

**依赖**
无。

**不包含**
不做任何源码修改。

---

## Ticket T1：产品壳与启动器

**目标**
新增 `tools/image-to-pptx/` 薄包，能用快捷方式启动整个 Web GUI。

**背景**
spec 4.3：产品壳只放启动器、快捷方式、README，不复制 UI 代码库。

**修改范围**
新建 `tools/image-to-pptx/`。不改 `image-to-html` 源码。

**任务**
1. `package.json`（name `@pic2ppt/image-to-pptx`、bin、scripts）。
2. `bin/image-to-pptx.cjs`：按 `__dirname` 解析同级 `../image-to-html`，调用其 `startServer`，支持 `--port`/`--host`/`--data-dir`/`--no-open`。
3. `start.cmd`：双击启动并打开浏览器。
4. `README.md`：用法、两个 key 的说明、无 PowerPoint 时的行为。

**验收标准**
在 `tools/image-to-pptx` 下执行启动命令，能打开 UI；`--help` 有输出。

**测试要求**
新增启动参数解析的单测（不实际起服务）。

**依赖**
T0。

**不包含**
不在这里实现 PPTX 路由。

---

## Ticket T2：解封切图 .fig 导出

**目标**
恢复上游 image-to-slice 原版的切图 `.fig` 下载能力（平面层级）。

**背景**
spec 4.2。渲染栈与上游逐字节一致，只被 2 处 guard + 1 个 `hidden` 关闭。

**修改范围**
`src/ui/api/fig-export-client.js`、`src/server/routes/export-routes.js`、`src/ui/ui.template.html`；重建 `dist/ui.html`。

**任务**
1. 移除 `fig-export-client.js` 中 `kind !== "editable"` 的 guard，恢复 slice 分支与 fallback 文件名。
2. 放开 `export-routes.js` 的 manifest 校验，接受 `kind: "slice"`。
3. 去掉 `ui.template.html` 中 `#placeSource` 容器的 `hidden`。
4. 确认 `app.js` 中 `#placeSource` 点击 → `downloadSliceFig()` 接线完好。

**验收标准**
从切图可直接下载 `.fig`；导入 Figma 后底图与各切图位置、圆角、显隐正确。

**测试要求**
新增：slice manifest → `.fig` 字节流的纯函数单测（节点数、坐标、exportSettings）；服务端接受合法 slice manifest、拒绝非法 manifest 的路由测试。

**依赖**
T0。

**不包含**
不自研语义分组；不改动 `.fig` 渲染栈。

---

## Ticket T3：Key 门禁与 PowerPoint 检测

**目标**
无 key 不允许切图；无 PowerPoint 只禁用转 PPTX。

**背景**
用户 Q3/Q4。

**修改范围**
`server.js`（health capabilities 与切图前校验）、`src/ui/app.js`（按钮禁用与提示）、`src/ui/ui.template.html`。

**任务**
1. `/api/v1/health` 增加 capabilities：`visionConfigured`、`generationConfigured`、`powerPointAvailable`、`browserAvailable`。
2. PowerPoint 检测：查 `POWERPNT.EXE`（App Paths / Program Files），失败不抛异常。
3. 切图接口在无 vision key 时返回明确错误（非 500）。
4. UI 根据 capabilities 禁用「一键切图」与「转 PPTX」并给出原因。

**验收标准**
无 key 时切图按钮禁用且有说明；无 PowerPoint 时仅转 PPTX 禁用。

**测试要求**
新增：无 key → 切图接口拒绝；PowerPoint 缺失 → capability 为 false 且不抛异常。

**依赖**
T1。

**不包含**
不做 key 的加密存储（沿用现有 `.image-to-html-data/model-config.json`）。

---

## Ticket T4：PPTX 导出路由

**目标**
新增 `POST /api/v1/exports/pptx`，把浏览器已拼好的 HTML 文件集转成 PPTX 并回传。

**背景**
spec 4.1。这是本项目的核心新增，也是最大风险点。

**修改范围**
新增 `src/server/routes/pptx-routes.js`（或并入 export-routes）、`server.js` 注册、必要的服务模块。

**任务**
1. 复用 `createHtmlExportZip(payload)` 得到 ZIP。
2. 解压到独立 job 目录 `.work/<jobId>/`。
3. 解析同级 `../html-to-pptx` 路径，spawn `bin/html-to-pptx.mjs`，传 `--input`、`--output`、`--aspect`、**显式 viewport（修缺陷 #6）**、`--overwrite`。
4. 返回 pptx 字节流；失败时返回可读错误（含 stderr 摘要），不泄漏内部路径。
5. 清理 job 目录（保留可调试开关）。

**验收标准**
给定合法 payload 能产出可打开的 `.pptx`；无 PowerPoint 时返回明确错误而非崩溃。

**测试要求**
新增：路由集成测试（转换用桩）；画布宽于视口时 viewport 正确传递的回归测试；失败路径返回可读错误。

**依赖**
T1。

**不包含**
不在服务端做 DOM 解析或 HTML 组装（复用浏览器已拼好的 files）。

---

## Ticket T5：PPTX UI 控件与比例选择

**目标**
在 HTML 预览面板加「转 PPTX」按钮与比例选择。

**背景**
用户 Q2：默认 16:9，可选按 HTML 原比例。

**修改范围**
`src/ui/app.js`、`src/ui/ui.template.html`、`src/ui/styles.css`；重建 `dist/ui.html`。

**任务**
1. 加按钮与比例选择（默认 16:9 / 按 HTML 原比例）。
2. 点击后调用 `/api/v1/exports/pptx`，带进度与错误提示。
3. 用既有 `files` 组装结果作为请求体（与 HTML 导出同源）。
4. 按 capabilities 禁用。

**验收标准**
点一次得到下载的 pptx；两种比例都能出片。

**测试要求**
新增：请求体组装与比例参数映射的单测。

**依赖**
T4。

**不包含**
不改动既有切图逻辑。

---

## Ticket T6：多页合并

**目标**
支持多张图各出一页，合并为一个 deck。

**背景**
用户已确认支持多页（D3）。`image-to-html` 每工作区只处理一张主图。

**修改范围**
编排层（服务端 job 管理 + UI 多页列表）。

**任务**
1. 维护 project 内 N 页的有序集合。
2. 逐页产出 HTML 目录后一次性传给 `html-to-pptx`（多 `--input`）。
3. 页序可调整；单页失败不静默丢页。

**验收标准**
3 张图 → 3 页 pptx，页序与 report.json 一致。

**测试要求**
新增：多页合并页数与页序的集成测试。

**依赖**
T4。

**不包含**
不做跨页母版/主题统一。

---

## Ticket T7：端到端冒烟与文档

**目标**
在无 AI key 环境下跑通全链路并补齐文档。

**背景**
spec 第 5 节验收标准。

**修改范围**
`tools/image-to-pptx/tests/`、README、`docs/dev/acceptance.md`。

**任务**
1. E2E：用现有 `htmls/1.png-html` 作 fixture → 出 pptx → 校验 PPTX 包结构与对象数。
2. 对比既有 `deliverables/*.report.json` 的对象数量级，确认无回归。
3. 补 `html-to-pptx` 的 LICENSE 与最小测试。
4. 写验收表 `docs/dev/acceptance.md`。

**验收标准**
`npm test` 全绿；F1–F10 逐条可演示。

**测试要求**
即本 ticket 的产出。

**依赖**
T2、T6。

**不包含**
不做性能基准。
