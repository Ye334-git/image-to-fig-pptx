# image-to-html

独立的本地 Web 编辑器：将单张图片拆成可调整资产，重建为 HTML/CSS，并导出离线 HTML ZIP 或可编辑设计稿 `.fig`。它源自项目内的 `image-to-slice` 1.1.2（MIT），源码已复制和整理到本包，运行时不依赖原项目。

## 启动

需要 Node.js 20.19 或更高版本。

```powershell
npm install
npm start
```

默认启动 `http://127.0.0.1:18789` 并打开浏览器。命令入口也可直接使用：

```powershell
npx image-to-html --port 18789 --host 127.0.0.1 --data-dir .\.image-to-html-data --no-open
```

支持 `--port`、`--host`、`--data-dir`、`--no-open`。Web UI 与 `/api/v1` 始终同源。模型配置、API Key、工作区记录和缩略图默认写入 `.image-to-html-data/`，不会读取或迁移 `image-to-slice` 的配置。

## 工作流

1. 选择文生图、图生图或本地图片。
2. 在设置中配置并测试 OpenAI 兼容模型；`vision` 单独路由，`generation` 与 `inpaint` 使用同一图片模型配置。
3. 使用 AI 拆图和背景补齐，或在画布中框选、移动、缩放、多选、调整圆角、隐藏及删除切图。
4. 对单个资产执行本地/AI 扣背景、局部补图、图片重生成或 SVG 处理。
5. 打开“AI 图层导入”生成并检查 HTML/CSS；可选使用系统 Chrome/Edge 做高保真捕获。
6. 下载 HTML ZIP 或从当前 HTML 捕获结果下载可编辑 `.fig`。

工作区采用 `image-to-html.workspace.v1`，自动保存时会移除进行中的请求、AbortController 和临时进度状态。第一版每个工作区只处理一张主图。

## SVG 行为

AI 拆图不会自动把资产换成 SVG，只给出建议：

- 无内嵌文字的图标、Logo 和简单装饰：建议本地描摹，顺序为 VTracer → ImageTracer。
- 复杂插画：可尝试 AI SVG，同时提示重绘失真风险。
- 流程图、复杂图表或含文字资产：建议保留 PNG，或通过 AI 图层/HTML 重建；普通描摹不会得到可编辑文字。

本地 VTracer 超过 900 条路径时拒绝采用，浏览器 ImageTracer 超过 700 条路径时拒绝采用；AI SVG 需通过脚本、外链、`viewBox`、可编辑图形与最多 220 个图形节点的校验。SVG 成功生成不代表视觉准确，文字、连线与拓扑必须人工确认。所有转换都由用户明确触发，原 PNG 和还原状态会保留。

## API 与输出

主要端点：

- `/api/v1/model-configs`、`/api/v1/task-routing`
- `/api/v1/workspace-draft`、`/api/v1/workspace-drafts`
- `/api/v1/images/generate`、`/api/v1/images/edit`
- `/api/v1/assets/generate-transparent`、`ai-redraw`、`redraw-svg`、`vectorize`
- `/api/v1/design/plan-background-decomposition`、`reconstruct-h5`、`capture-figma`
- `POST /api/v1/exports/html`
- `POST /api/v1/exports/fig`

HTML ZIP 固定包含 `index.html`、`styles.css`、`script.js`、`assets/` 和 `manifest.json`；manifest schema 为 `image-to-html.export.v1`。`.fig` 端点只接受 HTML 捕获生成的 Editable Manifest，不接受切图 manifest。

AI 返回的 HTML 会移除脚本、事件属性、外部资源、危险 URL 和未知图片；切图只能通过可信资产 ID 注入。普通 DOM 捕获不需要浏览器依赖，高保真捕获使用系统 Chrome/Edge；找不到兼容浏览器时仅该模式不可用。

## 验证

```powershell
npm test
npm run build
npm run check
```

测试覆盖拆图解析、坐标、透明状态、补图候选、SVG 推荐/还原、安全清洗、工作区序列化、模型路由、进度取消、Mask 回退、ZIP、`.fig` 编解码及同进程 UI/API 冒烟检查。

## 来源与许可证

核心拆图、DOM 捕获、`.fig` 编码和 UI 逻辑改编自 [50kg/image-to-slice](https://github.com/50kg/image-to-slice)，部署基线为 1.1.2 / `402c20542f73e41f2393b6dfe3a5096c8c1a9521`。继续使用上游 MIT 许可证，见 `LICENSE`。
