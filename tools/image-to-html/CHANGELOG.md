# Changelog

## 0.1.0 - 2026-09-18

- 从 `image-to-slice` 1.1.2 提取为独立 Node.js 包和本地 Web 编辑器。
- 保留图片输入/生成、模型设置、AI 拆图、手工切图编辑、扣背景、补图、SVG、HTML/CSS 重建、历史记录与恢复。
- 新增同源 `/api/v1`、`image-to-html` 启动入口和独立 `.image-to-html-data/`。
- 新增服务端 HTML ZIP 与 Editable Manifest `.fig` 导出；移除公开的切图 `.fig`、切图包和 Figma Frame 反向导出入口。
- 新增保守的 SVG 推荐策略、转换警告和原图还原路径。
- 使用系统 Chrome/Edge 作为可选高保真 DOM 捕获运行时。
- 新增跨平台单元、API、导出、`.fig` 和服务冒烟测试。
