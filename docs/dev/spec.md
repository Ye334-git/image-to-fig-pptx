# image-to-pptx — 开发 Spec（阶段 2）

日期：2026-09-18
状态：已定稿（用户确认「定稿并直接完成这个项目」）
上游依据：`docs/dev/requirements.md`（阶段 1 需求确认书）

---

## 1. 题目目标

把 `tools/image-to-html`（切图编辑器）与 `tools/html-to-pptx`（HTML→PPTX）封装成一个名为 **image-to-pptx** 的单一本地 Web GUI 工作流。

用户路径：配好 key → 送入图片 → 一键切图 → 人工调切图 → 一键出 HTML 预览（或直接出切图 `.fig`）→ 转 PPTX → 验收。

全程**不依赖任何外部 agent 运行时**（codex / Claude Code / Cursor），key 由用户自配，成本自控。

---

## 2. 已知信息

### 输入
1..N 张幻灯片图片（PNG/JPG），或由内置文生图/图生图产生。

### 输出
- `deck.pptx` — PowerPoint 原生可编辑对象（真实文本框 / 图片 / 图形）
- `deck.pptx.preview/slide-NNN.png` — 逐页预览，供人工验收
- `deck.pptx.report.json` — 结构校验、对象数、视觉校验标记
- 可选 `slide/index.html` + `styles.css` + `assets/`（离线自包含 HTML）
- 可选 `slice.fig`（平面层级，手动导入 Figma）

### 已验证事实（来源：`requirements.md` 第 5 节，均为读源码所得）
1. **HTML→PPTX 不需要任何 API key** —— puppeteer 本机浏览器 + `dom-to-pptx` 本地库 + PowerPoint COM，零网络、零模型调用。
2. **切图 `.fig` 渲染栈与上游逐字节一致**，只被 2 处 guard + 1 个 `hidden` 关闭。
3. 服务端路由是**硬编码顺序表**（`server.js:226-252`），无法从外部扩展 → 必须改 `image-to-html` 本体。
4. `image-to-html` 每个工作区只处理**一张**主图。
5. `html-to-pptx` **零测试文件**、**无 LICENSE**。
6. 已知缺陷：导出的 `script.js` 按视口宽度给 `.screen` 设 `transform: scale()`，而 `html-to-pptx` 用 `getBoundingClientRect()` 量画布 → 画布宽于视口时尺寸算错。

### 运行与测试方式
- `tools/image-to-html/` → `npm test`（`node --test`，20 个测试文件）、`npm run build`（重建 `dist/ui.html`）
- `tools/html-to-pptx/` → `npm run convert`
- Node ≥ 20.19；Windows + Microsoft PowerPoint + Chrome/Edge

---

## 3. 需求拆解

| # | 功能点 | 要做什么 | 影响哪里 | 完成判据 |
| --- | --- | --- | --- | --- |
| F1 | 产品壳与启动器 | `tools/image-to-pptx/` 薄包 + `start.cmd`，起服务并打开浏览器 | 新建包 | 双击快捷方式能打开 UI |
| F2 | Key 前置门禁 | 无任何可用 key 时禁用「一键切图」并说明原因 | 服务端校验 + UI 禁用 | 无 key 时按钮禁用且有提示 |
| F3 | 一键切图 | 复用现有 `/api/v1/design/plan-background-decomposition`，接 F2 门禁 | 现有流程 | 配 key 后能出切图 |
| F4 | 人工调切图 | 复用现有画布编辑（移动/缩放/圆角/隐藏/删除/抠图/补图/SVG） | 现有流程 | 功能不回归 |
| F5a | HTML 预览与导出 | 复用现有 `reconstruct-h5` + `/api/v1/exports/html` | 现有流程 | 出 `index.html` + `assets/` |
| F5b | 切图 `.fig` 导出 | 解封上游原版能力（平面层级） | 客户端 guard、服务端 manifest 校验、模板 `hidden` | 从切图直接下载 `.fig`，导入 Figma 后资产与锁定底图位置正确 |
| F6 | 一键 HTML→PPTX | 新增 `POST /api/v1/exports/pptx`，复用 ZIP 组装 → 落盘 → 子进程调 `html-to-pptx` | 新增路由 + UI 控件 | 点一次得到 pptx + 预览 + report |
| F7 | 比例选择 | 默认 16:9，可选按 HTML 原比例 | UI 选项 → `--aspect` | 两种模式都能出片 |
| F8 | PowerPoint 检测与降级 | `/api/v1/health` 暴露 capability，UI 据此禁用 F6 | 服务端 + UI | 无 PowerPoint 时仅禁用 F6，其余照常 |
| F9 | 多页 | 每图一工作区，合并为一个 deck | 编排 | 3 张图 → 3 页 pptx |
| F10 | 验收产物 | pptx + preview + report 三件套齐全 | 已有输出 | 三件套存在且 report 结构校验通过 |

---

## 4. 实现思路

### 4.1 架构决定：引擎不动，在 `image-to-html` 本体加路由

理由：`server.js:226-252` 是硬编码顺序表。外挂方案要么改它、要么加扩展点，后者多一层间接。两个工具都归本项目，直接加最稳妥，且只需一处改动点。

```
浏览器（现有 UI，新增 2 个控件）
   │ 点「转 PPTX」→ 复用浏览器已拼好的 files[]
   ▼
POST /api/v1/exports/pptx              ← 新增路由
   │ ① createHtmlExportZip(payload)     复用现有 ZIP 组装 + HTML/CSS 消毒
   │ ② 解压到 .work/<job>/              独立 job 目录，互不干扰
   │ ③ 显式传 viewport = 画布尺寸        ← 修缺陷 #6
   │ ④ spawn 子进程调用 ../html-to-pptx/bin/html-to-pptx.mjs
   ▼
deck.pptx + .preview/ + .report.json → 回传下载
```

**不引入 npm 依赖耦合**：按**路径**子进程调用 `html-to-pptx`，与它自己调用 `dom-to-pptx` 的既有做法一致（`bin/html-to-pptx.mjs:310`）。

### 4.2 F5b 的实现路径（解封，非新开发）

SHA256 比对已证明渲染栈与上游逐字节一致，因此只做三处最小改动：

1. `src/ui/api/fig-export-client.js` —— 移除 `if (kind !== "editable") throw`，恢复 slice 分支，fallback 文件名对齐上游 `image-slices.fig`。
2. `src/server/routes/export-routes.js` —— 放开 manifest 校验，接受 `kind: "slice"` 的切图 manifest。
3. `src/ui/ui.template.html` —— 去掉 `#placeSource` 所在容器的 `hidden`。

`app.js:6897 downloadSliceFig()` 与 `exportFigManifest({kind:"slice"})` → `createUiAssetScreen()` 均已存在，直接复用。

### 4.3 产品壳

`tools/image-to-pptx/` 只放启动器、快捷方式、README、端到端测试。**不复制 UI 代码库**（避免维护两套 381 KB 的 `app.js`）。

### 4.4 数据结构

不新增数据库。沿用 `image-to-html` 工作区草稿（`image-to-html.workspace.v1`）作为唯一中间状态。多页由一个 project 清单串起 N 个工作区。

---

## 5. 测试与验收

### 测试命令
- `tools/image-to-html/` → `npm test`
- `tools/image-to-pptx/` → `npm test`（新建）

### 关键测试场景

| 场景 | 类型 | 归属 |
| --- | --- | --- |
| slice manifest → `.fig` 字节流，节点数/坐标/exportSettings 正确 | 纯函数单测 | T2 |
| 服务端接受 slice manifest，拒绝非法 manifest | 路由测试 | T2 |
| 无 key → 切图接口拒绝 | 门禁测试 | T3 |
| PowerPoint 缺失 → capability 为 false，路由返回明确错误而非崩溃 | 降级测试 | T3 |
| `POST /api/v1/exports/pptx` 合法 payload → 落盘 → 调用转换 → 回传 | 路由集成（转换用桩） | T4 |
| 画布宽于视口时 viewport 正确传递 | 回归测试 | T4 |
| 多页合并页数正确 | 集成测试 | T6 |
| 端到端：现有 `htmls/1.png-html` fixture → pptx → 校验包结构（**不需要 key**） | E2E | T7 |

### 验收标准
F1–F10 逐条可演示；端到端冒烟在**无 AI key** 环境下通过；现有 7 个交付物不回归（对比 report 对象数量级）。

---

## 6. 不做什么

见 `requirements.md` 第 6 节。要点：

- 不做 AI agent skill，不依赖外部 agent 运行时
- 不复制 `image-to-html` 的 UI 代码库
- 不让用户编辑 HTML
- 不依赖 Figma 运行时
- 不做纯 JS 合并 PPTX（无 PowerPoint 直接禁用）
- **不自研「带语义分组的 `.fig`」**（原 B 方案已作废）
- **不改动 `.fig` 渲染栈**（保持与上游逐字节一致）
- 不在本轮改动上游 `image-to-slice/`
- 不做生成式（大纲造 PPT）

---

## 7. 风险点

| 风险 | 说明 | 应对 |
| --- | --- | --- |
| 改 `app.js`（381 KB 单文件） | 加 UI 控件要动它 + `ui.template.html` + `styles.css`，再 `npm run build:ui` 重建 888 KB 的 `dist/ui.html` | 改动限定在加控件与接线；T0 先 `git init` 保回滚 |
| 画布尺寸缺陷 #6 | 画布宽于视口时 PPTX 页面尺寸算错 | 集成时显式传 `viewport`；用宽画布 fixture 专测 |
| ZIP 消毒影响转换 | `createHtmlExportZip` 会重写 `script.js` 并按白名单过滤 `url()` | 端到端冒烟覆盖；必要时为 PPTX 路径放宽 |
| PowerPoint COM 不可控 | 无头/锁屏/已开 PowerPoint 时可能失败 | 检测 + 明确错误信息 + 超时 |
| 现有交付物回归 | 已有 7 个 pptx 交付物 | E2E 对现有 `htmls/` 出片并与既有 report 对比 |
| 跨进程调用路径 | `html-to-pptx` 需在 `tools/` 同级目录 | 启动器与路由均按 `__dirname` 解析，不依赖 cwd |
