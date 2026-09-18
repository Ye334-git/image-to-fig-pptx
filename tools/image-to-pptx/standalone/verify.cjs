#!/usr/bin/env node
/**
 * 自检脚本：验证这个包在本机能否完整运行。
 *
 * 不写入你的 data 目录，也不需要任何 API Key —— 它只验证「HTML → 可编辑 PPTX」
 * 这条本地链路（本机浏览器 + 本地 DOM 转换库 + Microsoft PowerPoint）。
 *
 * 用法：node verify.cjs
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { missingParts, CONVERTER_DIR, ENGINE_ENTRY } = require("./bin/image-to-fig-pptx.cjs");

const ROOT = __dirname;
const EXAMPLE_DIR = path.join(ROOT, "examples", "demo-slide");

function fail(message) {
  process.stderr.write("\n✖ 自检失败：" + message + "\n");
  process.exitCode = 1;
}

function collectFiles(dir, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? prefix + "/" + entry.name : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) { files.push(...collectFiles(abs, rel)); continue; }
    if (/\.(html|css|js)$/i.test(entry.name)) {
      files.push({ name: rel, text: fs.readFileSync(abs, "utf8") });
    } else {
      files.push({ name: rel, dataBase64: fs.readFileSync(abs).toString("base64") });
    }
  }
  return files;
}

function readCanvas(css) {
  const w = css.match(/--board-width:\s*(\d+)/);
  const h = css.match(/--board-height:\s*(\d+)/);
  return w && h ? { width: Number(w[1]), height: Number(h[1]) } : null;
}

async function main() {
  process.stdout.write("image-to-fig-pptx 自检\n");
  process.stdout.write("=====================\n\n");

  const missing = missingParts();
  if (missing.length) {
    fail("安装包不完整：\n  - " + missing.join("\n  - "));
    return;
  }
  process.stdout.write("✔ 包结构完整（engine / converter / 预构建界面 / 依赖）\n");
  process.stdout.write("✔ 转换器位置：" + CONVERTER_DIR + "\n");

  if (!fs.existsSync(path.join(EXAMPLE_DIR, "styles.css"))) {
    fail("示例页面缺失：" + EXAMPLE_DIR);
    return;
  }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "i2f-verify-"));
  process.env.HOST = "127.0.0.1";
  process.env.PORT = "0";
  process.env.IMAGE_TO_HTML_DATA_DIR = dataDir;
  process.env.IMAGE_TO_FIG_PPTX_CONVERTER_DIR = CONVERTER_DIR;

  const engine = require(ENGINE_ENTRY);
  try {
    await engine.startServer();
    const baseUrl = "http://127.0.0.1:" + engine.server.address().port + "/api/v1";
    process.stdout.write("✔ 服务已启动\n");

    const health = await (await fetch(baseUrl + "/health")).json();
    const caps = health.capabilities;
    process.stdout.write("  Node          : " + process.version + "\n");
    process.stdout.write("  浏览器        : " + (caps.browserAvailable ? "可用" : "未找到 Chrome/Edge") + "\n");
    process.stdout.write("  PowerPoint    : " + (caps.powerPointAvailable ? "可用" : "未安装") + "\n");
    process.stdout.write("  PPTX 转换     : " + (caps.pptxConversionAvailable ? "可用" : "不可用 - " + caps.pptxUnavailableReason) + "\n");

    if (!caps.pptxConversionAvailable) {
      process.stdout.write("\n！切图、调整、HTML 与 .fig 导出仍然可用，只有「转 PPTX」被禁用。\n");
      process.stdout.write("  原因：" + caps.pptxUnavailableReason + "\n");
      return;
    }

    const css = fs.readFileSync(path.join(EXAMPLE_DIR, "styles.css"), "utf8");
    const screen = readCanvas(css);
    if (!screen) { fail("示例 styles.css 缺少画布尺寸声明"); return; }

    process.stdout.write("\n正在用示例页面生成 PPTX（真实调用本机 PowerPoint，约 10-30 秒）…\n");
    const response = await fetch(baseUrl + "/exports/pptx", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        screen: { name: "verify", ...screen },
        aspect: "16:9",
        files: collectFiles(EXAMPLE_DIR)
      })
    });
    if (!response.ok) {
      fail("转换失败：HTTP " + response.status + " " + (await response.text()).slice(0, 400));
      return;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const isZip = bytes.subarray(0, 2).toString() === "PK";
    const hasSlide = bytes.includes(Buffer.from("ppt/slides/slide1.xml"));
    if (!isZip || !hasSlide) { fail("返回的内容不是有效的 PPTX"); return; }

    const jobId = response.headers.get("x-pptx-job-id");
    const job = await (await fetch(baseUrl + "/pptx-jobs/" + jobId)).json();
    const slide = job.report.powerpoint.slides[0];

    process.stdout.write("\n✔ 自检通过\n");
    process.stdout.write("  PPTX 大小     : " + (bytes.length / 1024).toFixed(0) + " KB\n");
    process.stdout.write("  对象数        : " + slide.shapes + "（文本框 " + slide.textObjects + " / 图片 " + slide.pictureObjects + "）\n");
    process.stdout.write("  预览图        : " + job.previews.length + " 张\n");
    process.stdout.write("\n现在可以双击 start.cmd 开始使用了。\n");
  } finally {
    await engine.shutdownServer();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  fail(error.stack || error.message || String(error));
});
