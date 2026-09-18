# Changelog

## 2026-09-18（image-to-pptx 工作流）

- 新增 `tools/image-to-pptx/`：把切图编辑器与 HTML→PPTX 管线封装成单一本地 Web GUI 工作流，含快捷方式、启动器与端到端测试。
- 恢复上游 image-to-slice 原版的切图 `.fig` 下载能力（此前被两道 guard 与一个 `hidden` 关闭，渲染栈与上游逐字节一致）。
- 新增 Key 门禁与运行环境检测：`/api/v1/health` 报告识图/生图是否配置、是否有浏览器与 PowerPoint、能否转换 PPTX；无 key 禁止切图，无 PowerPoint 仅禁用转 PPTX。
- 新增 `POST /api/v1/exports/pptx`：复用 HTML 导出的消毒打包结果，落盘后以子进程调用 `html-to-pptx`，返回可编辑 PPTX；并提供 `GET /api/v1/pptx-jobs/:id` 与逐页 PNG 预览端点。
- 修复画布尺寸缺陷：导出脚本会按视口宽度缩放 `.screen`，转换时现显式固定 viewport，宽画布不再被算错。
- 新增多页合并：每页在其工作区完成后加入队列，一次性合并为一个 deck，并报告 `requestedSlides`/`droppedSlides`，掉页不会被静默吞掉。
- 新增 PPTX 导出 UI：比例选择（默认 16:9，可选原比例/4:3/3:4）、单页导出、合并队列与逐页预览。
- 测试：`image-to-html` 231 → 266 项；`html-to-pptx` 0 → 6 项并补 MIT LICENSE；`tools/image-to-pptx` 新增 5 项启动器单测与 4 项真实 E2E 断言。

## 2026-09-18

- 新增独立 `tools/image-to-html/` 本地 Web 编辑器：同源 `/api/v1`、独立模型与工作区数据、AI/手工拆图、扣背景/补图、SVG 建议与重建、HTML ZIP 和 Editable `.fig` 导出。
- 新工具不依赖 `image-to-slice` 运行时，不提供 Figma 插件、切图 `.fig`、原始切图包或 Figma Frame 反向导出，并补齐单元/API/导出测试和 MIT 来源说明。
- HTML→PPTX 工具新增 `html`、`16:9`、`4:3` 和 `3:4` 画布模式；固定比例下对 HTML 内容执行等比例缩小和居中，不拉伸、不裁切。
- 新增可复用的 `tools/html-to-pptx/` 命令行工具，将资源预检、DOM 转换、多页合并、结构校验和最终 PowerPoint 视觉预览封装为固定流程。
- 新增 JSON 配置文件示例和 HTML 输入约定，明确视觉校验位于转换流程末尾。

## 2026-09-17

- 使用新增的 `2.png-html (1)` 和 `3.png-html (1)` 重新生成第 2、3 页，补齐各自切图资源并与第 1 页合并为最终三页 PPTX。
- 使用 `dom-to-pptx` 将三份 HTML 的 DOM/CSS 转换为 PowerPoint 原生文字、图形和图片对象，并通过 PowerPoint 合并为三页可编辑演示文稿。
- 新增基于 HTML DOM 坐标与计算样式的可编辑 PPTX，文字、HTML 图片和 SVG 均为独立幻灯片对象。
- 将 `htmls/` 下的三份横屏 HTML 按原始画布渲染并合并为单个三页 PPTX，保持各页图片与文字的相对位置。

- 排查 API 测试失败：直连 api.openai.com 出现 UND_ERR_CONNECT_TIMEOUT，系统代理连接同样超时。
- 启动脚本读取 Windows 系统代理，使用 undici 代理适配，并保留本机请求直连；模型请求网络异常显示具体错误码。

- 部署 Image To Slice 1.1.2（上游提交 `402c205`），安装锁定依赖并构建。
- 添加 Windows 后台启动脚本和独立网页入口，仅监听 127.0.0.1。
- 保留现有三张 PNG，补充本地使用说明。
- 构建、语法检查、HTTP 健康检查和 Edge 页面加载验证通过；记录上游测试失败与可选 Chromium 未安装状态。
