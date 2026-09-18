# HTML → Editable PPTX Pipeline

将一组按顺序排列的 HTML 页面转换成一个可编辑的 PowerPoint 文件。转换阶段使用浏览器的 DOM 和计算样式，不依赖整页截图；最终阶段才使用 Microsoft PowerPoint 渲染 PNG 预览，供视觉校验和后续微调。

## 环境

- Windows
- Node.js 20.19 或更高版本
- Microsoft PowerPoint
- Google Chrome 或 Microsoft Edge

## 安装

**在本工具所在的目录下**执行（源码仓库里是 `tools/html-to-pptx`；发行包里是 `converter/`，依赖已内置，无需安装）：

```powershell
$env:PUPPETEER_SKIP_DOWNLOAD='true'
npm install
```

工具会优先使用系统安装的 Chrome，其次使用 Edge，不需要额外下载 Chromium。

## 使用配置文件

复制并修改 `examples/deck.example.json`：

```powershell
npm run convert -- --config examples/deck.example.json
```

配置结构：

```json
{
  "output": "../../deliverables/deck.pptx",
  "selector": ".screen",
  "aspect": "html",
  "render": true,
  "slides": [
    { "html": "../../htmls/slide-01/index.html" },
    { "html": "../../htmls/slide-02/index.html" }
  ]
}
```

每一页可以单独覆盖 `selector` 或指定 `viewport`：

```json
{
  "html": "../../htmls/slide-02/index.html",
  "selector": ".slide-root",
  "viewport": { "width": 3040, "height": 1472 }
}
```

通常不需要手动指定 viewport 或 PPT 页面尺寸。工具会在 Chrome 中读取页面容器的实际尺寸。

`aspect` 提供四种模式：

- `html`：以第一页 HTML 的宽高比创建统一 PPT 页面。
- `16:9`：使用 13.333333 × 7.5 英寸横屏页面。
- `4:3`：使用 10 × 7.5 英寸横屏页面。
- `3:4`：使用 7.5 × 10 英寸竖屏页面。

所有固定比例模式都采用 `contain`：HTML 内容等比例缩小并居中，空余区域形成页边，不拉伸、不裁切。需要其他自定义比例时，可以改用 `slide.widthIn` 和 `slide.heightIn`；自定义尺寸不能与非 `html` 的 `aspect` 同时设置。

## 直接传入 HTML

```powershell
npm run convert -- `
  --input "..\..\htmls\1.png-html\index.html" `
  --input "..\..\htmls\2.png-html (1)\index.html" `
  --output "..\..\deliverables\deck.pptx"
```

指定 16:9：

```powershell
npm run convert -- --config examples\deck.example.json --aspect 16:9
```

指定横版 4:3：

```powershell
npm run convert -- --config examples\deck.example.json --aspect 4:3
```

指定竖版 3:4：

```powershell
npm run convert -- --config examples\deck.example.json --aspect 3:4
```

目录路径也可以作为 `--input`，工具会自动读取其中的 `index.html`。

## 输出

一次成功运行会生成：

- 最终 `.pptx` 文件
- `<文件名>.pptx.preview/`：PowerPoint 导出的逐页 PNG
- `<文件名>.pptx.report.json`：资源预检、PPTX 结构和对象数量报告

## 工作阶段

1. 在 Chrome 中加载所有 HTML，等待字体和图片完成。
2. 检查页面容器尺寸、损坏图片和失败资源请求。
3. 使用 `dom-to-pptx` 将每个 DOM 页面转为单页 PPTX。
4. 使用 Microsoft PowerPoint 合并页面，保留原生对象。
5. 检查最终 PPTX 包结构和页数。
6. 最后由 PowerPoint 渲染所有页面，进入视觉校验阶段。

视觉校验只放在流程末尾。转换阶段不根据截图反向重建 HTML，也不会把整页压平为图片。

## HTML 输入约定

- 每个页面应有一个明确的根容器，默认选择器是 `.screen`。
- 根容器应具有确定的宽高。
- 图片必须通过 `<img src="...">` 或页面实际使用的 CSS 资源引用；仅把文件放进 `assets/` 不会自动进入 PPT。
- 优先使用真实 `<img>`、普通文本节点和稳定的 CSS 布局。
- 复杂伪元素、滤镜、`clip-path` 和浏览器专有特效可能需要在最终视觉校验后微调。
- 多页可以拥有不同的 HTML 画布尺寸，但最终 PPT 使用统一页面尺寸，并保持每页内部的相对布局。

## 安全行为

- 默认拒绝覆盖已有 PPTX 和预览目录。
- 需要覆盖时显式传入 `--overwrite`。
- 中间文件默认放在工具目录的 `.work/`，成功后删除；使用 `--keep-work` 可以保留。
