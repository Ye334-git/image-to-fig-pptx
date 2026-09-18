#!/usr/bin/env node

const path = require("node:path");
const { spawn } = require("node:child_process");

const options = parseArguments(process.argv.slice(2));
process.env.HOST = options.host;
process.env.PORT = String(options.port);
process.env.IMAGE_TO_HTML_DATA_DIR = path.resolve(options.dataDir);

const app = require("../server");
app.startServer();

if (!options.noOpen) {
  app.ready.then(() => openBrowser(`http://${formatHost(options.host)}:${options.port}`));
}

function parseArguments(args) {
  const defaults = {
    host: "127.0.0.1",
    port: 18789,
    dataDir: path.join(__dirname, "..", ".image-to-html-data"),
    noOpen: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--no-open") {
      defaults.noOpen = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      printHelp();
      process.exit(0);
    }
    const [name, inlineValue] = argument.split("=", 2);
    if (!["--host", "--port", "--data-dir"].includes(name)) {
      throw new Error(`未知参数：${argument}`);
    }
    const value = inlineValue ?? args[++index];
    if (!value) throw new Error(`${name} 缺少值`);
    if (name === "--host") defaults.host = value;
    if (name === "--data-dir") defaults.dataDir = value;
    if (name === "--port") {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`无效端口：${value}`);
      }
      defaults.port = port;
    }
  }
  return defaults;
}

function printHelp() {
  console.log([
    "Usage: image-to-html [options]",
    "",
    "  --host <host>       监听地址，默认 127.0.0.1",
    "  --port <port>       监听端口，默认 18789",
    "  --data-dir <path>   本地配置与工作区目录",
    "  --no-open           不自动打开浏览器",
    "  -h, --help          显示帮助"
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

module.exports = { parseArguments };
