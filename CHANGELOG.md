# Changelog

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
