# image-to-pptx — 验收表（阶段 5）

日期：2026-09-18
验收环境：Windows，Node v24.21.0，Microsoft PowerPoint 已安装，Google Chrome 已安装，**未配置任何模型 API Key**

---

## 总体结论

**可以交付。** T0–T7 全部完成；`image-to-html` 266 项测试、`html-to-pptx` 6 项测试、`tools/image-to-pptx` 启动器 5 项单测 + 4 项真实 E2E 断言全部通过。

在**无 AI Key** 的环境下已跑通「HTML → 可编辑 PPTX」全链路，并真实产出三页合并演示文稿。

有两项**本环境无法验证**，需要你用自己的 key 与 Figma 补验（见文末）。

---

## 需求验收表

| # | 需求 | 验收标准 | 实现位置 | 测试证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| F1 | 产品壳与启动器 | 双击 `start.cmd` 或 `npm start` 能打开 UI | `tools/image-to-pptx/bin/image-to-pptx.cjs`、`start.cmd` | `tests/args.test.js`（5 项）；实测 `/api/v1/health` 返回 ok、`/` 返回 200 且 877,917 字节 | 已实现且有运行证据 |
| F2 | Key 前置门禁 | 无任何可用 key 时禁止切图 | `server.js` 的 `buildHealthCapabilities` / `isTaskConfigured`；`src/ui/app.js` 的 `updateImageToCodeButtonState` | 实测 health `visionConfigured:false`；`tests/server-smoke.test.js` 断言切图接口返回 400 且提示「图片理解」 | 已实现且有运行证据 |
| F3 | 一键切图 | 配 key 后能出切图 | 既有 `/api/v1/design/plan-background-decomposition` | 门禁路径有测试；**真实 AI 调用未验证** | 部分实现（门禁已验证，AI 调用待你的 key 验证） |
| F4 | 人工调整切图 | 移动/缩放/圆角/隐藏/删除/抠图/补图/SVG 不回归 | 既有画布逻辑（本轮未改动） | 266 项既有测试全绿；`npm run test:browser` 载入 `1.png` 出结果卡且无控制台错误 | 已实现且有运行证据 |
| F5a | HTML 预览与导出 | 出 `index.html` + `assets/` | 既有 `reconstruct-h5` + `/api/v1/exports/html` | E2E 用真实 `htmls/1.png-html` 走完整导出与消毒路径 | 已实现且有运行证据 |
| F5b | 切图 `.fig` 导出 | 从切图直接下载 `.fig` | `src/ui/api/fig-export-client.js`、`src/server/routes/export-routes.js`、`ui.template.html` | `tests/fig-export-slice-import.test.js` 解码真实 `.fig`，校验 frame、锁定底图、坐标、圆角、exportSettings、隐藏资产跳过；`tests/export-routes.test.js` 与 `tests/ui-fig-export-client.test.js`；浏览器验证入口可见且文案为「下载切图 .fig」 | 已实现且有运行证据（Figma 侧导入效果未验证） |
| F6 | 一键 HTML→PPTX | 点一次得到 pptx + 预览 + report | `src/server/routes/pptx-routes.js`、`src/ui/app.js` 的 `exportEditablePptx` | 真实 E2E：`htmls/1.png-html` → 3.93 MB pptx，**153 个对象（66 文本框 / 16 图片）**；`tests/pptx-routes.test.js` 10 余项 | 已实现且有运行证据 |
| F7 | 比例选择 | 默认 16:9，可选按 HTML 原比例 | `pptxAspect` 选择器 → `normalizeAspect` → `--aspect` | E2E：`aspect:html` 时 3040×1472 画布 → 13.333×6.456 英寸，比例与源一致；`normalizeAspect` 别名与拒绝有单测 | 已实现且有运行证据 |
| F8 | PowerPoint 检测与降级 | 无 PowerPoint 只禁用转 PPTX | `src/server/services/pptx-runtime.js`、`buildHealthCapabilities` | `tests/pptx-runtime.test.js`：浏览器 / PowerPoint / 工具三者逐项缺失都使 `pptxConversionAvailable` 为 false，且检测不抛异常；`pptx-routes` 返回 503 带具体原因 | 已实现且有运行证据 |
| F9 | 多页合并 | 3 张图 → 3 页 pptx，页序正确 | `pptx-routes.js` 的 `resolveSlidePayloads`、`src/ui/app.js` 的 `pptxDeckQueue` | 真实 E2E：三个既有 fixture 合并为 **19.28 MB、3 页**，每页对象数 153/69/150，页序 1→2→3，`droppedSlides:0`；掉页另有专门单测 | 已实现且有运行证据 |
| F10 | 验收产物齐全 | pptx + 逐页 PNG + 结构报告 | `runConversion` 返回值 + `GET /api/v1/pptx-jobs/:id` | E2E 断言三件套存在、预览为 200 PNG 且大于 1 KB、report 含 PowerPoint 结构与对象数 | 已实现且有运行证据 |

---

## 关键实测数据

| 场景 | 输入 | 结果 |
| --- | --- | --- |
| 单页真实 fixture | `htmls/1.png-html` 1747×900 | 3.93 MB pptx，153 对象（66 文本 / 16 图片） |
| 三页合并 | `1.png-html` + `2.png-html (1)` + `3.png-html (1)` | 19.28 MB pptx，3 页，对象数 153 / 69 / 150，页序保持 |
| 宽画布回归（缺陷 #6） | 合成 3040×1472 | 13.333×6.456 英寸；画布未被 CSS `transform: scale()` 污染 |

---

## 与原交付物的对比

`deliverables/260917pic2ppt-html-native-editable-final-v2.pptx` 的既有报告记录第 1 页为 150 个对象（71 文本框 / 51 图片对象）。

本次单页实测为 153 个对象（66 文本 / 16 图片）。对象总数同级，差异来自图片合并策略：既有交付物把较多装饰性元素保留为独立图片对象；本次运行测得的 `.screen` 宽度为 1747 而非 1748，DOM 映射结果随之略有不同。两者均为原生可编辑对象，不是整页截图。

---

## 本环境无法验证的项目（需你补验）

| 项 | 原因 | 建议验证方式 |
| --- | --- | --- |
| **真实 AI 切图与 HTML 重建** | 无模型 API Key | 在「设置模型」里配置图片理解与图片生成模型，跑一次完整流程：切图 → 人工调整 → AI 图层 → 转 PPTX |
| **`.fig` 在 Figma 中的实际导入效果** | 未安装 / 未使用 Figma | 下载切图 `.fig`，导入 Figma，核对底图锁定、切图位置、圆角与显隐 |
| **无 PowerPoint 机器上的降级表现** | 本机已装 PowerPoint | 单元测试已覆盖 capability 判定与 503 分支；如需端到端确认，可在无 Office 的机器打开 UI，确认「转 PPTX」为禁用并给出具体原因 |

---

## 测试命令汇总

```powershell
cd tools\image-to-html ; npm test                # 266 项
cd tools\html-to-pptx  ; npm test                # 6 项（本次新增，此前为 0）
cd tools\image-to-pptx ; npm test                # 5 项启动器单测 + 4 项真实 E2E 断言
cd tools\image-to-html ; npm run test:browser    # 需先启动服务
```

E2E 会自动跳过：找不到 fixture，或 `pptxConversionAvailable` 为 false 时不会失败，而是报告跳过原因。
