# image-to-pptx

本机 Web GUI 工作流：**图片 → 一键切图 → 人工调整切图 → HTML / .fig → 可编辑 PPTX**。

产物是 PowerPoint **原生对象**（真实文本框、图片、图形），不是整页截图。

## 启动

双击 `start.cmd`，或：

```powershell
cd tools\image-to-pptx
npm start
```

默认打开 `http://127.0.0.1:18789`。

命令行参数：

```
--host <host>       监听地址，默认 127.0.0.1
--port <port>       监听端口，默认 18789
--data-dir <path>   模型配置与工作区目录
--no-open           不自动打开浏览器
-h, --help          显示帮助
```

## 工作流

1. 在「设置」里配置 **图片理解模型**（识图/理解）与 **图片生成模型**（生图/补图），各填 Base URL、模型 ID、API Key。
2. 载入图片（本地图片 / 文生图 / 图生图）。
3. **一键切图** —— AI 识别背景、覆盖层与需要保留的位图资产。
4. **人工调整切图** —— 框选、移动、缩放、圆角、隐藏、删除；对单个资产抠背景、局部补图、重绘或转 SVG。
5. 选一条出口：
   - **AI 图层导入 → 生成 HTML 预览**，可下载离线 HTML ZIP；
   - **下载切图 .fig** —— 直接从切图资产产出 `.fig`，手动导入 Figma 继续调整（本工具不依赖 Figma 运行）。
6. **转 PPTX** —— 选择画布比例（默认缩放到 16:9，或按 HTML 原设定比例），一键得到 `.pptx`、逐页 PNG 预览与结构报告。
7. 验收 PPTX。

## Key 与成本

- 只有**切图**和**HTML 重建**需要模型 key，用你自己配置的 key，成本自控。
- **没有配置任何可用 key 时，无法进行第一步切图。**
- **HTML → PPTX 不需要任何 key**：转换全程在本机完成（本机 Chrome/Edge 渲染 + 本地 DOM→PPTX 库 + Microsoft PowerPoint 合并），不发起网络请求、不调用模型。

## 环境要求

| 依赖 | 用途 | 缺失时 |
| --- | --- | --- |
| Node.js ≥ 20.19 | 运行 | 无法启动 |
| 模型 API Key | 切图、HTML 重建 | 禁用切图与 HTML 重建 |
| Google Chrome 或 Microsoft Edge | HTML 预检与 DOM 读取 | 禁用转 PPTX |
| Microsoft PowerPoint（Windows） | 多页合并与逐页预览渲染 | 禁用转 PPTX |

缺失 PowerPoint 或浏览器时，**只有「转 PPTX」被禁用**，切图、调整、HTML 与 `.fig` 导出照常可用。

## 与两个引擎的关系

本项目自身只是产品壳与启动器，实际能力来自两个同级引擎：

| 组件 | 位置 | 职责 |
| --- | --- | --- |
| 切图 / HTML 引擎 | `../image-to-html` | 拆图、画布编辑、抠图补图、SVG、HTML/CSS 重建、`.fig` 导出；同时提供 Web GUI 与 `/api/v1` |
| HTML → PPTX 引擎 | `../html-to-pptx` | 浏览器计算样式 → 原生对象 → PowerPoint 合并与逐页渲染 |

启动器以**进程内**方式加载切图引擎；HTML→PPTX 由该引擎以**子进程**方式按路径调用。两者都不作为 npm 依赖引入，因此不需要在三个目录之间重复安装依赖。

## 数据位置

模型配置、API Key、工作区草稿默认保存在 `../image-to-html/.image-to-html-data/`，与既有记录共用，不会因为从 `image-to-html` 切换到 `image-to-pptx` 而丢失。

## 来源与许可证

切图与 HTML 重建能力改编自 [50kg/image-to-slice](https://github.com/50kg/image-to-slice) 1.1.2（MIT），见 `../image-to-html/LICENSE`。本项目沿用 MIT。
