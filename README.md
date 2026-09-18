# 0917 pic2ppt — 图片到可编辑文档工作流

上游：https://github.com/50kg/image-to-slice

部署版本：1.1.2，提交 `402c20542f73e41f2393b6dfe3a5096c8c1a9521`。
源码位于 `image-to-slice/`，通过源码归档引入，不包含嵌套 Git 仓库。原有 `1.png`、`2.png`、`3.png` 保留。

## 启动与使用

双击 `start.cmd`，然后打开 http://127.0.0.1:18788 。后台服务仅监听本机，重启电脑后需重新启动。

启动脚本优先使用 HTTPS_PROXY，否则读取 Windows 已启用的系统 HTTP 代理。修改代理后需重启 API 服务才能生效。本机请求绕过代理。若模型测试出现连接超时，请确认代理节点可以访问所填 API 地址。

- 前端：`http://127.0.0.1:18788`
- API 健康检查：`http://127.0.0.1:18787/health`
- 日志：本目录的 `api.log`、`api.error.log`、`ui.log`、`ui.error.log`。
- 页面左下角“设置”中填写自己的 Base URL、模型 ID 和 API Key，再测试并保存。图片理解与图片生成/修补分别配置。
- 点击“本地图片”载入本目录的 PNG。
- 此上游项目输出切图、HTML/CSS 和 Figma 文件，不直接导出 PPTX。

Figma Desktop 用户可导入 `image-to-slice/manifest.json` 作为开发插件。

## 独立 Image→HTML 工具

`tools/image-to-html/` 是基于上游能力整理出的独立本地 Web 编辑器，默认在 `http://127.0.0.1:18789` 同时提供 UI 和 `/api/v1`。它保留图片生成、AI/手工拆图、扣背景、补图、SVG、HTML/CSS 图层重建、工作区历史、HTML ZIP 和可编辑 `.fig` 输出，但不依赖 `image-to-slice` 运行时，也不包含 Figma 插件、切图 `.fig`、原始切图包和 Figma Frame 反向导出。详见 `tools/image-to-html/README.md`。

## PPTX 导出

可复用的 HTML→可编辑 PPTX 工具位于 `tools/html-to-pptx/`。它支持多 HTML 顺序转换、统一页面尺寸、PowerPoint 合并、结构检查和最终逐页 PNG 视觉校验。详细用法见 `tools/html-to-pptx/README.md`。

`deliverables/260917pic2ppt-html-native-editable-final-v2.pptx` 是最终的原生对象版本。第 1 页来自 `1.png-html`，第 2、3 页分别来自新增的 `2.png-html (1)` 与 `3.png-html (1)`；使用 `dom-to-pptx` 读取浏览器计算后的 DOM/CSS，将文字、打包图片、背景、边框和定位图形映射为 PowerPoint 对象，再合并为三页演示文稿。

`deliverables/260917pic2ppt-html-dom-editable-final.pptx` 将 `htmls/` 下的三份横屏 HTML 合并为一个三页演示文稿。页面采用统一的 1748×900 自定义横屏画布，按 DOM 坐标生成独立文本框、图片和 SVG 图层；CSS 背景与装饰保留为底层视觉层。第二页因原始宽高比不同而上下留白，内容不裁切。

`deliverables/260917pic2ppt-html-slides.pptx` 是早期的整页图片版本，仅作为视觉对照保留。

## image-to-pptx 工作流

`tools/image-to-pptx/` 是本项目的主入口：把上面两个工具封装成一条本地 Web GUI 工作流。

双击 `tools/image-to-pptx/start.cmd`（或在 `tools/image-to-pptx` 下运行 `npm start`），浏览器打开 `http://127.0.0.1:18789`。

流程：**配 key → 送入图片 → 一键切图 → 人工调整切图 → 生成 HTML 预览（或直接下载切图 `.fig`）→ 转 PPTX → 验收**。

要点：

- 平台、切片编辑、HTML 重建与 `.fig` 导出由 `tools/image-to-html/` 提供，GUI 与 `/api/v1` 同源。
- HTML→PPTX 由 `tools/html-to-pptx/` 提供，由引擎按路径以子进程调用，**不需要任何 API Key**（本机浏览器 + 本地 DOM→PPTX + Microsoft PowerPoint）。
- 只有切图与 HTML 重建需要模型 key，用使用者自己配置的 key，成本自控。
- 未配置任何可用 key 时无法进行第一步切图；缺少 PowerPoint 或浏览器时只禁用「转 PPTX」。
- 多页：每页在自己的工作区完成后「加入队列」，再一次性合并为一个 PPTX。
- 数据目录沿用 `tools/image-to-html/.image-to-html-data/`，与既有配置和切图记录共用。

详见 `tools/image-to-pptx/README.md`，设计与验收见 `docs/dev/`。

## 依赖与构建

需要 Node.js >=20.19.0，本次使用 v22.18.0。在 `image-to-slice` 目录运行：

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run build
npm.cmd test
```

模型配置和历史保存在上游目录内的 `.local-provider-config.json`、`.image-to-slice-history/`，已由上游 `.gitignore` 排除。

独立工具在 `tools/image-to-html/` 下运行 `npm install`、`npm start`；其模型配置与工作区记录默认保存在自身 `.image-to-html-data/`，不会与上游目录互相污染。

## 部署验证

- 构建及 JavaScript 语法检查通过；API `/health` 返回 `{"ok":true}`，网页返回 HTTP 200。
- 使用本机 Edge 无头浏览器确认页面显示，未发现页面 JavaScript 错误。
- 上游测试 600 项：590 通过、10 失败。其中 6 项缺少 Playwright Chromium；3 项是 Windows 路径/权限断言差异；1 项是上游 `getExpandedSampleRect` 未导出。详细结果见 `image-to-slice/test-results.log`。
- Chromium 下载未完成并已停止；普通网页可用。需要高保真捕获时，重新执行 `npx.cmd playwright install chromium`。
- 尚未填写模型 API 配置，未验证实际 AI 请求。
