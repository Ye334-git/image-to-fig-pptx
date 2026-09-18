# image-to-pptx — 需求确认书（阶段 1）

日期：2026-09-18
状态：已由用户确认（Q0–Q7 全部拍板；Q6/Q7 由用户授权自行决定）

---

## 1. 背景

项目 `260917pic2ppt` 下已有两个可独立运行的工具：

| 工具 | 路径 | 能力 | 缺口 |
| --- | --- | --- | --- |
| image-to-html | `tools/image-to-html/` | 图片 → AI 拆图 → 人工调切图 → HTML/CSS 重建 → HTML ZIP / .fig 导出 | 不产出 PPTX |
| html-to-pptx | `tools/html-to-pptx/` | HTML → 浏览器计算样式 → dom-to-pptx 原生对象 → PowerPoint 合并 → 逐页 PNG 预览 | 需要人工下载 ZIP、解压、手动传参 |

两者之间靠人工搬运。本工作流把这条缝补上。

上游来源：`image-to-html` 改编自 [50kg/image-to-slice](https://github.com/50kg/image-to-slice) 1.1.2（MIT，★537）。继续沿用 MIT 许可证。

---

## 2. 产品定位

**一句话**：一条本地、轻量、人工可控的「图片 → 可编辑 PPTX / 可编辑 .fig」流水线，质量由人把关，成本由内部用户自配 key 决定。

**差异化（用户自述）**：

1. 人工可编辑的切图资源 —— 允许对切图资产编辑、生图，人为控制生成质量。
2. 更轻量化 —— 不依赖 codex 或其他 agent 工具。
3. 成本自控 —— 内部用户自行配置不同的 key。

**明确不是**：不是「AI 一键出 PPT」的 agent skill。

---

## 3. 竞品调研结论（2026-09-18）

### 3.1 直接同类（图片 → 可编辑 PPTX）—— 拥挤

| 项目 | ★ | 形态 | 备注 |
| --- | --- | --- | --- |
| [ningzimu/image-to-editable-ppt-skill](https://github.com/ningzimu/image-to-editable-ppt-skill) | 2.6k | Codex skill | 赛道头部，MIT，2026-09-16 更新 |
| [laihenyi/NBLM2PPTX](https://github.com/laihenyi/NBLM2PPTX) | 345 | Python | PDF → 背景图 + 文字层 |
| [JuniverseCoder/MinerU2PPT](https://github.com/JuniverseCoder/MinerU2PPT) | 195 | Python GUI | MinerU 版面解析 |
| [knight6669/knight-imagetopptx-skill](https://github.com/knight6669/knight-imagetopptx-skill) | 122 | Codex skill | 语义复刻协议 |
| [DSY-Xueai/image2editable](https://github.com/DSY-Xueai/image2editable) | 45 | Python | SAM2 + GroundingDINO |
| [CodingFeng101/slide-alchemy](https://github.com/CodingFeng101/slide-alchemy) | 42 | Codex skill | 干净底图 + 生成资产 |
| [JadeLiu-tech/px-image2pptx](https://github.com/JadeLiu-tech/px-image2pptx) | 39 | Python | PaddleOCR + LAMA inpaint，带浏览器编辑器 |

### 3.2 HTML/DOM → 可编辑 PPTX —— 已商品化

[atharva9167j/dom-to-pptx](https://github.com/atharva9167j/dom-to-pptx)（★360，MIT，2026-09-14）即头部，**本项目已在用**。另有 [Hasasasa/html-to-editable-pptx](https://github.com/Hasasasa/html-to-editable-pptx)（67）、[joker-duzhong/html-to-pptx](https://github.com/joker-duzhong/html-to-pptx)（16）等。

### 3.3 结论

**终点重复，路线未重复。**

- **已被商品化，不作为创新点**：图片→可编辑 PPTX 这个终点；OCR 取字与字号还原；LAMA 类 inpaint；文本/形状/图片对象化装配；HTML/DOM→原生 PPTX；PowerPoint COM 合页与渲染自检。
- **全链路无人做全**：把「人工校准切图编辑器」与「结构化 PPTX」串成一条**本地**流水线，且中间产物是**离线自包含 HTML/CSS**。现有竞品共同模式是「一次跑完、无人工检查点、无 HTML 交付物」。
- **两个隔壁项目**：`px-image2pptx` 有浏览器编辑器但是 OCR+inpaint 路线、无切片资产管理；`image-to-slice` 有完整切图编辑器但止步 HTML/.fig。**中间那条缝就是本项目的全部价值所在。**

> 星数经 shields.io 徽章接口独立复核（api.github.com 调研期间触发限流）。竞品的定性描述（如 ningzimu 的自述成本）未逐条独立复核。

---

## 4. 决策记录

| # | 决策 | 结论 | 来源 |
| --- | --- | --- | --- |
| Q0 | 动机与定位 | 做，定位为「可控 / 可复现 / 人在环」的工程化管线 | 用户 |
| Q1 | 交付形态 | **单页 Web GUI**。可由 agent 启动并打开，也可手动跑快捷方式。内部编排对用户不可见 → 用最稳妥方式 | 用户 |
| Q2 | 人工流程 | 配 key → 送图 → 一键切图 → 人工调切图 → 一键出 HTML 预览（**或**直接出 .fig）→ 转 PPTX → 验收 | 用户 |
| Q3 | 无 PowerPoint | 只禁用「转 PPTX」，其余功能照常 | 用户 |
| Q4 | Key 策略 | 识图/理解 key + 生图 key，参考 image-to-slice 的设置。**无任何 key 则禁止第一步切图** | 用户 |
| Q5 | .fig 导出 | 保留，但项目**不依赖 Figma 运行** —— 用户手动导入 Figma 做后续调整 | 用户 |
| Q6 | 测试基线 | **补测试**（用户授权自行决定） | 我方决定 |
| Q7 | 版本控制 | **先 git init**（用户授权自行决定） | 我方决定 |
| D1 | .fig 导出 | **采用 image-to-slice 原版能力**：解封切图 `.fig`（平面层级：frame + 锁定底图 + 每切图一节点）。**放弃自研语义分组**（原 B 方案作废） | 用户 |
| D2 | 比例 | 默认缩放到 **16:9**，可选「按 HTML 原比例」（`--aspect 16:9\|html` 已内置） | 用户 |
| D3 | 多页 | **支持**。每张图一个工作区，最终合并为一个 deck | 我方决定 |
| D4 | 用户不碰 HTML | HTML 是内部中间产物与交付物，不是用户编辑对象 | 用户 |
| D5 | 产品壳 | `tools/image-to-pptx/` 薄启动器；引擎留在 `image-to-html`，**不复制 UI 代码库** | 我方决定 |

---

## 5. 已验证的代码事实

以下均为读源码得到，非推测。

1. **HTML→PPTX 不需要任何 API key。** `html-to-pptx` 三步全本地：本机 Chrome/Edge（puppeteer）预检 → `dom-to-pptx` 本地库转对象 → PowerPoint COM 合并渲染。零网络请求、零模型调用。
2. **切图 .fig 导出代码完好，且渲染栈与上游逐字节一致**。SHA256 比对结果：

   | 模块 | 上游 vs 本工具 |
   | --- | --- |
   | `plugin/screen-importer.js`（含 `createUiAssetScreen`） | **完全相同** |
   | `ui/state/fig-export-mode.js`（含 `sliceLabel: "下载切图 .fig"`） | **完全相同** |
   | `plugin/asset-node.js`、`plugin/paint.js`、`ui/services/web-to-figma-utils.js` | **完全相同** |
   | `fig-export/export-fig.js` | 逻辑相同，仅默认名 `"Image To Slice"` → `"Image To HTML"` |
   | `fig-export/figma-api-adapter.js` | **仅 1 行差异**：默认 `file_name` 字符串 |

   被关闭的只有三处：
   - `src/ui/api/fig-export-client.js:6` — 新增 guard `if (kind !== "editable") throw`
   - `src/server/routes/export-routes.js` — 只接受 `editable-design-*` manifest
   - `src/ui/ui.template.html:40` — `#placeSource` 按钮所在容器被加了 `hidden` 属性

   `app.js:6897 downloadSliceFig()` 函数本身完好。**恢复上游能力 ≈ 删 2 处 guard + 去掉 1 个 `hidden`，约 20 行，零移植风险。**
3. ~~**切图数据不含语义分组。**~~ **（作废，仅存档）** `slice-detection/result-parser.js` 每资产返回 `{name, kind, bbox, confidence, containsEmbeddedText, reason}`，`kind` 取自 8 值枚举。`semanticGroupId`/`semanticGroupName` 只存在于 DOM 捕获路径（`app.js:7116`）。这是放弃 B 方案的原因。
4. ~~**Path B 的实现桥梁已存在**~~ **（作废，仅存档）** `editable-layer-spec.js:18 createFastAuthoritativeAssetNode()`。若将来重启 B 方案可复用。
5. **目标 manifest 校验极宽松**：`validateEditableDesignManifest` 只要求 `screen.width/height` 为有限数、`nodes` 为数组。
6. **分组渲染已实现**：`src/plugin/screen-importer.js:142-166 createEditableDesignScreen` 按 `semanticGroupId` 真调 `figmaApi.group()`，`nodes.length < 2` 时跳过。
7. **服务端路由是硬编码顺序表**（`server.js:226-252`），无法从外部扩展 → 必须改 `image-to-html` 本体加路由。
8. **已知缺陷（需在集成时处理）**：导出的 `script.js` 按视口宽度给 `.screen` 设 `transform: scale()`，而 `html-to-pptx` 用 `getBoundingClientRect()` 量画布。画布宽于视口时（如 3040px vs 1920px）会测到缩放后尺寸，画布算错。
9. **image-to-html 每个工作区只处理一张主图**（README 明述）。
10. **html-to-pptx 零测试文件**，`npm test` 为空跑；且**无 LICENSE 文件**。

---

## 6. 明确不做

- 不做 AI agent skill，不依赖 codex / Claude Code / Cursor 等外部 agent 运行时。
- 不复制 `image-to-html` 的 UI 代码库（避免维护两套 381 KB 的 `app.js`）。
- 不让用户编辑 HTML。
- 不依赖 Figma 运行时（只产出可手动导入的 .fig）。
- 不做纯 JS 合并 PPTX（无 PowerPoint 时直接禁用该功能）。
- 不在本轮改动上游 `image-to-slice/`（含 Figma 插件）。
- 不承诺生成式（大纲造 PPT）能力 —— 只做「已有图片 → 可编辑对象」。
- **不自研「带语义分组的 .fig」**（原 B 方案）。只恢复 image-to-slice 原版的平面切图 `.fig`。
- 不改动 `.fig` 渲染栈（与上游逐字节一致，保持不动以维持可对比性）。
