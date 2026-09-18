# image-to-fig-pptx

**图片 → 一键切图 → 人工调整切图 → HTML / .fig → 可编辑 PPTX**

一个自包含的本地 Web GUI 工作流。产物是 PowerPoint **原生对象**（真实文本框、图片、图形），不是整页截图。

**依赖已经全部打包在内，解压即用**：不需要 `npm install`，不需要构建，不依赖任何外部 agent 工具。

---

## 快速开始

1. 双击 **`start.cmd`**
2. 浏览器自动打开 `http://127.0.0.1:18789`
3. 在左下角「设置模型」里配置两个模型（见下方「首次配置」）
4. 载入图片 → 一键切图 → 人工调整 → 生成 HTML 预览（或下载切图 `.fig`）→ 转 PPTX

命令行方式：

```
node bin/image-to-fig-pptx.cjs --port 18789 --no-open
```

可用参数：`--host`、`--port`、`--data-dir`、`--no-open`、`--help`。

## 先自检一下（推荐）

```
node verify.cjs
```

它会检查包是否完整、本机是否具备运行条件，并且**真实生成一个 PPTX** 来确认链路通畅。不需要任何 API Key，也不写入你的数据目录。

---

## 环境要求

| 依赖 | 用途 | 缺失后果 |
| --- | --- | --- |
| **Windows x64** | 原生依赖（sharp、vectorizer）与 PowerPoint 自动化 | 无法运行 |
| **Node.js ≥ 20.19** | 运行时 | 无法启动 |
| **Google Chrome 或 Microsoft Edge** | HTML 预检与 DOM 读取 | 禁用「转 PPTX」 |
| **Microsoft PowerPoint** | 多页合并与逐页预览渲染 | 禁用「转 PPTX」 |
| 模型 API Key | 切图、HTML 重建 | 禁用切图与 HTML 重建 |

缺失 Chrome / PowerPoint / Key 时**只会禁用对应功能**，其余照常可用，并在界面上说明原因。

> **平台说明**：包内的 `sharp`、`@neplex/vectorizer` 是 Windows x64 原生模块，因此这个包**只能在 Windows x64 上运行**。这与「转 PPTX 依赖 Windows + PowerPoint」是一致的。

---

## 首次配置

在界面左下角「设置模型」中新建 API 配置，需要两类：

| 用途 | 说明 |
| --- | --- |
| **图片理解**（vision） | 识图拆图、识别文字与布局。切图的第一步必须有它 |
| **图片生成**（generation / inpaint） | 补图、重绘、抠背景 |

每项填写 Base URL、模型 ID、API Key。**Key 由你自己提供，成本自控。**

关于成本：**「HTML → PPTX」这一步完全不需要 Key**，它全程在本机完成（本机浏览器 + 本地 DOM 转换库 + PowerPoint），不发起网络请求、不调用模型。

---

## 工作流

1. 载入图片（本地图片 / 文生图 / 图生图）
2. **一键切图** —— AI 识别背景、覆盖层与需要保留的位图资产
3. **人工调整切图** —— 框选、移动、缩放、圆角、隐藏、删除；对单个资产抠背景、局部补图、重绘或转 SVG
4. 选一条出口：
   - **AI 图层导入 → 生成 HTML 预览**，可下载离线自包含 HTML ZIP
   - **下载切图 .fig** —— 直接从切图产出 `.fig`，手动导入 Figma 继续调整（本工具不依赖 Figma 运行）
5. **转 PPTX** —— 选择比例（默认缩放到 16:9，或按 HTML 原设定比例 / 4:3 / 3:4），一键得到 `.pptx`、逐页 PNG 预览与结构报告
6. 验收

**多页**：每页在自己的工作区完成 HTML 后点「加入队列」，全部完成后点「生成合并 PPTX」，得到一个多页演示文稿。

---

## 目录结构

```
image-to-fig-pptx/
├── start.cmd                    双击启动
├── verify.cjs                   自检脚本
├── bin/image-to-fig-pptx.cjs    启动器
├── engine/                      切图 / HTML 引擎（含预构建界面与依赖）
│   ├── server.js
│   ├── src/ui/                  界面源码
│   ├── dist/ui.html             预构建界面（已随包提供）
│   └── node_modules/            引擎依赖
├── converter/                   HTML → PPTX 转换器（含依赖）
│   ├── bin/html-to-pptx.mjs
│   └── node_modules/
├── examples/demo-slide/         自检用示例页面
└── data/                        模型配置与工作区记录（首次运行后生成）
```

整个文件夹可以复制/移动到任意位置，路径变化不影响运行。

---

## 修改界面

界面源码在 `engine/src/ui/`，但服务实际加载的是**预构建**的 `engine/dist/ui.html`。改完源码必须重建：

```
cd engine
node scripts/build-ui-html.js
```

否则浏览器里看到的仍是旧界面。

重建需要 `engine/node_modules` 存在（已随包提供），不需要联网。

---

## 常见问题

**启动报「安装包不完整」**
说明 bin 之外的内容没复制全。请重新解压完整包，不要只复制 `bin` 目录。

**「转 PPTX」是灰的**
把鼠标停在按钮上看提示，会写明具体缺什么（未找到 Chrome/Edge、未安装 PowerPoint 等）。也可以运行 `node verify.cjs` 看详细诊断。

**切图按钮是灰的 / 提示先配置模型**
第一步切图需要「图片理解」模型。到「设置模型」里配置并测试通过即可。

**端口被占用**
```
node bin/image-to-fig-pptx.cjs --port 18800
```

**想换数据目录**（默认在本包 `data/`）
```
node bin/image-to-fig-pptx.cjs --data-dir D:\\my-data
```

---

## 来源与许可证

切图与 HTML 重建能力改编自 [50kg/image-to-slice](https://github.com/50kg/image-to-slice) 1.1.2（MIT，作者 liu chao），许可证见 `engine/LICENSE`。
HTML → PPTX 转换使用 [dom-to-pptx](https://github.com/atharva9167j/dom-to-pptx)（MIT）。
本项目沿用 MIT。
