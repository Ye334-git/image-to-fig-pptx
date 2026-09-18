const path = require("node:path");
const JSZip = require("jszip");

function createExportRoutes({ readJson, exportFigManifest, sendBinary }) {
  return async function handleExportRoutes(request, response) {
    if (request.method === "POST" && request.url === "/api/exports/html") {
      const payload = await readJson(request, 150 * 1024 * 1024);
      const bytes = await createHtmlExportZip(payload);
      const filename = createFilename(payload?.screen?.name, ".zip");
      sendBinary(response, 200, bytes, {
        "content-type": "application/zip",
        "content-disposition": createAttachmentDisposition(filename)
      });
      return true;
    }

    if (request.method === "POST" && request.url === "/api/exports/fig") {
      const payload = await readJson(request, 150 * 1024 * 1024);
      if (
        !payload?.manifest
        || !Array.isArray(payload.manifest.nodes)
        || !payload.manifest.screen
        || !String(payload.manifest.version || "").startsWith("editable-design-")
      ) {
        throw badRequest("只允许导出 AI 图层重建后的 Editable Manifest");
      }
      const bytes = await exportFigManifest({ kind: "editable", manifest: payload.manifest });
      const filename = createFilename(payload.manifest?.screen?.name, ".fig");
      sendBinary(response, 200, bytes, {
        "content-type": "application/octet-stream",
        "content-disposition": createAttachmentDisposition(filename)
      });
      return true;
    }

    return false;
  };
}

async function createHtmlExportZip(payload = {}) {
  const files = Array.isArray(payload.files) ? payload.files : [];
  const required = new Set(["index.html", "styles.css", "script.js"]);
  const zip = new JSZip();
  for (const file of files) {
    const name = normalizeArchivePath(file?.name);
    if (!name || name === "manifest.json") continue;
    let data = file?.dataBase64
      ? Buffer.from(String(file.dataBase64), "base64")
      : String(file?.text || "");
    if (name === "index.html") {
      const html = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      if (/asset:/i.test(html)) throw badRequest("HTML 导出仍包含未解析的 asset: 引用");
      data = sanitizeExportHtml(html);
    } else if (name === "styles.css") {
      const css = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      data = sanitizeExportCss(css);
    } else if (name === "script.js") {
      data = buildSafeExportScript(payload.screen);
    }
    zip.file(name, data);
    required.delete(name);
  }
  if (required.size) {
    throw badRequest(`HTML 导出缺少文件：${[...required].join(", ")}`);
  }
  zip.file("manifest.json", JSON.stringify({
    schema: "image-to-html.export.v1",
    createdAt: new Date().toISOString(),
    screen: payload.screen || {},
    files: files.map((file) => normalizeArchivePath(file?.name)).filter(Boolean)
  }, null, 2));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function sanitizeExportHtml(html) {
  return String(html || "")
    .replace(/<(?:iframe|object|embed|applet|portal|frame|frameset|base|form)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|applet|portal|frame|frameset|form)\s*>/gi, "")
    .replace(/<(?:iframe|object|embed|applet|portal|frame|frameset|base|form)\b[^>]*\/?>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, (tag) => (
      /\bsrc\s*=\s*(["'])\.\/script\.js\1/i.test(tag)
        ? '<script src="./script.js"></script>'
        : ""
    ))
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:src|href|xlink:href|srcset|action|formaction|poster)\s*=\s*(["'])(.*?)\1/gi, (attribute, quote, value) => {
      const normalized = String(value || "").trim();
      if (
        normalized.startsWith("#")
        || normalized === "./styles.css"
        || normalized === "./script.js"
        || normalized.startsWith("./assets/")
        || normalized.startsWith("assets/")
      ) return attribute;
      return "";
    })
    .replace(/javascript\s*:/gi, "");
}

function sanitizeExportCss(css) {
  return String(css || "")
    .replace(/@import\s+[^;]+;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/(?:behavior|-moz-binding)\s*:[^;]+;?/gi, "")
    .replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (_match, _quote, value) => {
      const normalized = String(value || "").trim();
      return normalized.startsWith("./assets/") || normalized.startsWith("assets/") || normalized.startsWith("#")
        ? `url("${normalized.replace(/"/g, "%22")}")`
        : "none";
    });
}

function buildSafeExportScript(screen = {}) {
  const width = Math.max(1, Math.round(Number(screen.width) || 1));
  const height = Math.max(1, Math.round(Number(screen.height) || 1));
  return `(() => {
  const shell = document.querySelector(".fit-shell");
  const box = document.querySelector(".fit-box");
  const screen = document.querySelector(".screen");
  if (!shell || !box || !screen) return;
  const fit = () => {
    const scale = Math.min(1, shell.getBoundingClientRect().width / ${width});
    box.style.width = (${width} * scale) + "px";
    box.style.height = (${height} * scale) + "px";
    screen.style.setProperty("transform", "scale(" + scale + ")", "important");
    screen.style.setProperty("transform-origin", "top left", "important");
  };
  new ResizeObserver(fit).observe(shell);
  window.addEventListener("resize", fit);
  fit();
})();`;
}

function normalizeArchivePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return "";
  const safe = path.posix.normalize(normalized);
  if (safe === ".." || safe.startsWith("../") || path.posix.isAbsolute(safe)) {
    throw badRequest(`非法导出路径：${value}`);
  }
  return safe;
}

function createFilename(value, extension) {
  const stem = Array.from(String(value || "image-to-html")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, ""))
    .slice(0, 80)
    .join("");
  return `${stem || "image-to-html"}${extension}`;
}

function createAttachmentDisposition(filename) {
  const extension = path.extname(filename);
  const stem = filename.slice(0, -extension.length);
  const fallbackStem = stem.normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const fallback = `${fallbackStem || "image-to-html"}${extension}`;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

module.exports = {
  createAttachmentDisposition,
  createExportRoutes,
  createHtmlExportZip,
  normalizeArchivePath,
  sanitizeExportCss,
  sanitizeExportHtml
};
