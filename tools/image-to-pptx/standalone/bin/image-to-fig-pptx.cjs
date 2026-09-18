#!/usr/bin/env node
/**
 * image-to-fig-pptx —— 自包含发行版启动器。
 *
 * 打包布局（本包）：
 *   <root>/bin/image-to-fig-pptx.cjs   <- 本文件
 *   <root>/engine/                     <- 切图 / HTML 引擎（含预构建 UI 与依赖）
 *   <root>/converter/                  <- HTML -> PPTX 转换器（含依赖）
 *   <root>/data/                       <- 模型配置、工作区记录（运行时生成）
 *
 * 引擎与转换器都以相对路径解析，因此整个文件夹可以被复制/解压到任意位置直接运行。
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const ENGINE_DIR = path.join(ROOT, "engine");
const ENGINE_ENTRY = path.join(ENGINE_DIR, "server.js");
const CONVERTER_DIR = path.join(ROOT, "converter");
const CONVERTER_ENTRY = path.join(CONVERTER_DIR, "bin", "html-to-pptx.mjs");
const UI_HTML = path.join(ENGINE_DIR, "dist", "ui.html");
const DEFAULT_DATA_DIR = path.join(ROOT, "data");

function parseArguments(args) {
  const options = {
    host: "127.0.0.1",
    port: 18789,
    dataDir: DEFAULT_DATA_DIR,
    noOpen: false,
    help: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--no-open") { options.noOpen = true; continue; }
    if (argument === "--help" || argument === "-h") { options.help = true; continue; }
    const [name, inlineValue] = argument.split("=", 2);
    if (!["--host", "--port", "--data-dir"].includes(name)) {
      throw new Error(`未知参数：${argument}`);
    }
    const value = inlineValue ?? args[++index];
    if (!value) throw new Error(`${name} 缺少值`);
    if (name === "--host") options.host = value;
    if (name === "--data-dir") options.dataDir = path.resolve(value);
    if (name === "--port") {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`无效端口：${value}`);
      options.port = port;
    }
  }
  return options;
}

function missingParts() {
  const checks = [
    ["engine/server.js", ENGINE_ENTRY],
    ["engine/dist/ui.html（界面未构建）", UI_HTML],
    ["engine/node_modules（依赖缺失）", path.join(ENGINE_DIR, "node_modules")],
    ["converter/bin/html-to-pptx.mjs", CONVERTER_ENTRY],
    ["converter/node_modules（依赖缺失）", path.join(CONVERTER_DIR, "node_modules")]
  ];
  return checks.filter(([, target]) => !fs.existsSync(target)).map(([label]) => label);
}

function printHelp() {
  process.stdout.write([
    "image-to-fig-pptx",
    "",
    "图片 → 一键切图 → 人工调整 → HTML / .fig → 可编辑 PPTX",
    "",
    "Usage: image-to-fig-pptx [options]",
    "",
    "  --host <host>       监听地址，默认 127.0.0.1",
    "  --port <port>       监听端口，默认 18789",
    "  --data-dir <path>   模型配置与工作区目录，默认 <本目录>/data",
    "  --no-open           不自动打开浏览器",
    "  -h, --help          显示帮助",
    ""
  ].join("\n"));
}

function formatHost(host) {
  return host.includes(":") ? `[${host}]` : host;
}

/**
 * Windows consoles default to a legacy codepage, which turns UTF-8 Chinese into
 * mojibake. Switch the console to UTF-8 here rather than in start.cmd: running
 * `chcp 65001` inside a batch file makes cmd.exe mis-parse the lines after it.
 */
function enableUtf8Console() {
  if (process.platform !== "win32") return;
  if (!process.stdout.isTTY) return;
  try {
    spawnSync("chcp.com", ["65001"], { stdio: "ignore" });
  } catch {
    // Best effort: a wrong codepage only affects how text looks, not behaviour.
  }
}

function openBrowser(url) {
  const command = process.platform === "win32"
    ? { executable: "cmd.exe", args: ["/c", "start", "", url] }
    : process.platform === "darwin"
      ? { executable: "open", args: [url] }
      : { executable: "xdg-open", args: [url] };
  const child = spawn(command.executable, command.args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {});
  child.unref();
}

function start() {
  const options = parseArguments(process.argv.slice(2));
  enableUtf8Console();
  if (options.help) { printHelp(); return; }

  const missing = missingParts();
  if (missing.length) {
    process.stderr.write("启动失败：安装包不完整，缺少以下内容：\n");
    for (const item of missing) process.stderr.write(`  - ${item}\n`);
    process.stderr.write("请重新解压/下载完整包（不要只复制 bin 目录）。\n");
    process.exitCode = 1;
    return;
  }

  const url = `http://${formatHost(options.host)}:${options.port}`;
  process.stdout.write(`image-to-fig-pptx 启动中… ${url}\n`);
  process.stdout.write(`数据目录：${options.dataDir}\n`);

  // Must be set before the engine module loads: it reads them at require time.
  process.env.HOST = options.host;
  process.env.PORT = String(options.port);
  process.env.IMAGE_TO_HTML_DATA_DIR = options.dataDir;
  process.env.IMAGE_TO_FIG_PPTX_CONVERTER_DIR = CONVERTER_DIR;

  const engine = require(ENGINE_ENTRY);
  engine.startServer();
  if (!options.noOpen) {
    engine.ready.then(() => openBrowser(url));
  }
}

if (require.main === module) {
  start();
}

module.exports = {
  CONVERTER_DIR,
  CONVERTER_ENTRY,
  DEFAULT_DATA_DIR,
  ENGINE_DIR,
  ENGINE_ENTRY,
  ROOT,
  UI_HTML,
  enableUtf8Console,
  formatHost,
  missingParts,
  parseArguments,
  printHelp
};
