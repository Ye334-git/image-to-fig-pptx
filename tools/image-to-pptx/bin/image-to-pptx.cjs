#!/usr/bin/env node

/**
 * image-to-pptx launcher.
 *
 * This is a thin product shell. The slicing/HTML engine lives in ../image-to-html
 * and is started in-process; the HTML -> PPTX conversion lives in ../html-to-pptx
 * and is invoked by the engine as a child process.
 *
 * No npm dependency on either sibling is needed: Node resolves the engine's own
 * requires from its own directory (tools/image-to-html/node_modules).
 */

const path = require("node:path");
const { spawn } = require("node:child_process");

const ENGINE_DIR = path.resolve(__dirname, "..", "..", "image-to-html");
const ENGINE_ENTRY = path.join(ENGINE_DIR, "server.js");
// Keep the engine's own data directory by default so existing model keys and
// slicing history carry over unchanged.
const DEFAULT_DATA_DIR = path.join(ENGINE_DIR, ".image-to-html-data");

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
    if (argument === "--no-open") {
      options.noOpen = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
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
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`无效端口：${value}`);
      }
      options.port = port;
    }
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "image-to-pptx",
    "",
    "本机 Web GUI：图片 → 一键切图 → 人工调整 → HTML/.fig → 可编辑 PPTX",
    "",
    "Usage: image-to-pptx [options]",
    "",
    "  --host <host>       监听地址，默认 127.0.0.1",
    "  --port <port>       监听端口，默认 18789",
    "  --data-dir <path>   模型配置与工作区目录，默认沿用 image-to-html 的数据目录",
    "  --no-open           不自动打开浏览器",
    "  -h, --help          显示帮助",
    ""
  ].join("\n"));
}

function formatHost(host) {
  return host.includes(":") ? `[${host}]` : host;
}

function openBrowser(url) {
  const command = process.platform === "win32"
    ? { executable: "cmd.exe", args: ["/c", "start", "", url] }
    : process.platform === "darwin"
      ? { executable: "open", args: [url] }
      : { executable: "xdg-open", args: [url] };
  const child = spawn(command.executable, command.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.on("error", () => {});
  child.unref();
}

function start() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  // Must be set before the engine module is loaded: it reads them at require time.
  process.env.HOST = options.host;
  process.env.PORT = String(options.port);
  process.env.IMAGE_TO_HTML_DATA_DIR = options.dataDir;

  const engine = require(ENGINE_ENTRY);
  engine.startServer();
  if (!options.noOpen) {
    engine.ready.then(() => openBrowser(`http://${formatHost(options.host)}:${options.port}`));
  }
}

if (require.main === module) {
  start();
}

module.exports = { ENGINE_DIR, ENGINE_ENTRY, DEFAULT_DATA_DIR, formatHost, parseArguments, printHelp };
