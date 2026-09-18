const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");

const { createHtmlExportZip } = require("./export-routes");
const {
  describePptxUnavailable,
  resolvePptxCliEntry,
  resolvePptxRuntimeCapabilities
} = require("../services/pptx-runtime");

const PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_RETAINED_JOBS = 5;
const ASPECT_ALIASES = new Map([
  ["html", "html"], ["source", "html"], ["original", "html"],
  ["16:9", "16:9"], ["16x9", "16:9"], ["wide", "16:9"],
  ["4:3", "4:3"], ["4x3", "4:3"], ["standard", "4:3"],
  ["3:4", "3:4"], ["3x4", "3:4"], ["portrait", "3:4"]
]);

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function serviceUnavailable(message) {
  return Object.assign(new Error(message), { statusCode: 503 });
}

function normalizeAspect(value) {
  const normalized = String(value ?? "16:9").trim().toLowerCase().replaceAll("：", ":");
  const aspect = ASPECT_ALIASES.get(normalized);
  if (!aspect) throw badRequest(`不支持的画布比例：${value}。可用：16:9、4:3、3:4、html`);
  return aspect;
}

function isInsideDir(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function createJobId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function sanitizeFilename(value, fallback = "image-to-pptx") {
  const stem = Array.from(String(value || fallback)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, ""))
    .slice(0, 80)
    .join("");
  return `${stem || fallback}.pptx`;
}

/**
 * The deck manifest handed to html-to-pptx.
 *
 * The viewport is pinned to the canvas size on purpose: the exported script.js
 * scales .screen to the viewport with a CSS transform, and html-to-pptx measures
 * the canvas with getBoundingClientRect(). Without an explicit viewport a canvas
 * wider than the default 1920px viewport would be measured after scaling and the
 * PPT page size would come out wrong.
 */
function buildDeckConfig({ jobDir, slides, aspect }) {
  return {
    output: path.join(jobDir, "deck.pptx"),
    selector: ".screen",
    aspect,
    render: true,
    renderDir: path.join(jobDir, "preview"),
    workDir: path.join(jobDir, "work"),
    overwrite: true,
    slides
  };
}

function buildSlideEntry({ htmlPath, width, height }) {
  return { html: htmlPath, selector: ".screen", viewport: { width, height } };
}

async function extractZipInto(zipBytes, targetDir) {
  const zip = await JSZip.loadAsync(zipBytes);
  for (const [name, entry] of Object.entries(zip.files)) {
    const target = path.join(targetDir, name);
    if (!isInsideDir(targetDir, target)) throw badRequest(`非法导出路径：${name}`);
    if (entry.dir) {
      await fsp.mkdir(target, { recursive: true });
      continue;
    }
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, await entry.async("nodebuffer"));
  }
  return zip;
}

function runConverter(configPath, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const cliEntry = options.cliEntry || resolvePptxCliEntry();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntry, "--config", configPath], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(Object.assign(new Error("PPTX 转换超时，已中止"), { statusCode: 504 }));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(Object.assign(new Error(`无法启动 PPTX 转换器：${error.message}`), { statusCode: 500 }));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      // Surface the tail of stderr: it carries the actionable PowerPoint /
      // asset-preflight message. Never leak the internal job path.
      const detail = String(stderr || stdout).trim().split(/\r?\n/).slice(-4).join(" ");
      reject(Object.assign(
        new Error(`PPTX 转换失败${detail ? `：${detail}` : `（退出码 ${code}）`}`),
        { statusCode: 502 }
      ));
    });
  });
}

function createPptxRoutes({
  readJson,
  sendJson,
  sendBinary,
  browserAvailable = false,
  workRoot = path.join(os.tmpdir(), "image-to-pptx-jobs"),
  logger = console,
  converter = runConverter,
  resolveCapabilities = () => resolvePptxRuntimeCapabilities({ browserAvailable })
}) {
  const jobs = new Map();
  let conversionQueue = Promise.resolve();

  function enqueue(task) {
    const run = conversionQueue.then(task, task);
    conversionQueue = run.then(() => {}, () => {});
    return run;
  }

  function rememberJob(job) {
    jobs.set(job.id, job);
    while (jobs.size > MAX_RETAINED_JOBS) {
      const oldestId = jobs.keys().next().value;
      if (oldestId === job.id) break;
      const stale = jobs.get(oldestId);
      jobs.delete(oldestId);
      fsp.rm(stale.dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function runConversion(payload) {
    const capabilities = resolveCapabilities();
    if (!capabilities.pptxConversionAvailable) {
      throw serviceUnavailable(`无法转换 PPTX：${describePptxUnavailable(capabilities)}`);
    }

    const width = Math.round(Number(payload?.screen?.width));
    const height = Math.round(Number(payload?.screen?.height));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      throw badRequest("缺少有效的画布尺寸 screen.width / screen.height");
    }
    const aspect = normalizeAspect(payload?.aspect);

    const id = createJobId();
    const jobDir = path.join(workRoot, id);
    const inputDir = path.join(jobDir, "input");
    await fsp.mkdir(inputDir, { recursive: true });

    const zipBytes = await createHtmlExportZip(payload);
    await extractZipInto(zipBytes, inputDir);

    const configPath = path.join(jobDir, "deck.json");
    const config = buildDeckConfig({
      jobDir,
      aspect,
      slides: [buildSlideEntry({ htmlPath: path.join(inputDir, "index.html"), width, height })]
    });
    await fsp.writeFile(configPath, JSON.stringify(config, null, 2));

    await enqueue(() => converter(configPath, { cliEntry: resolvePptxCliEntry() }));

    const pptxPath = config.output;
    const bytes = await fsp.readFile(pptxPath);
    let report = null;
    try {
      report = JSON.parse(await fsp.readFile(`${pptxPath}.report.json`, "utf8"));
    } catch {
      report = null;
    }

    const previewDir = config.renderDir;
    let previewFiles = [];
    try {
      previewFiles = (await fsp.readdir(previewDir)).filter((name) => /\.png$/i.test(name)).sort();
    } catch {
      previewFiles = [];
    }

    const job = {
      id,
      dir: jobDir,
      previewDir,
      filename: sanitizeFilename(payload?.screen?.name),
      slideCount: Array.isArray(report?.powerpoint?.slides) ? report.powerpoint.slides.length : 0,
      aspect,
      createdAt: new Date().toISOString(),
      report,
      previewFiles
    };
    rememberJob(job);
    return { job, bytes };
  }

  return async function handlePptxRoutes(request, response) {
    if (request.method === "POST" && request.url === "/api/exports/pptx") {
      const payload = await readJson(request, 150 * 1024 * 1024);
      const { job, bytes } = await runConversion(payload);
      sendBinary(response, 200, bytes, {
        "content-type": PPTX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="${encodeURIComponent(job.filename)}"; filename*=UTF-8''${encodeURIComponent(job.filename)}`,
        "content-length": String(bytes.length),
        "x-pptx-job-id": job.id,
        "x-pptx-slide-count": String(job.slideCount)
      });
      return true;
    }

    const jobMatch = request.method === "GET" && request.url.match(/^\/api\/pptx-jobs\/([A-Za-z0-9-]+)$/);
    if (jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) {
        sendJson(response, 404, { error: "PPTX 任务不存在或已过期" });
        return true;
      }
      sendJson(response, 200, {
        ok: true,
        id: job.id,
        filename: job.filename,
        aspect: job.aspect,
        slideCount: job.slideCount,
        createdAt: job.createdAt,
        report: job.report,
        previews: job.previewFiles.map((name) => ({
          name,
          url: `/api/v1/pptx-jobs/${job.id}/preview/${encodeURIComponent(name)}`
        }))
      });
      return true;
    }

    const previewMatch = request.method === "GET"
      && request.url.match(/^\/api\/pptx-jobs\/([A-Za-z0-9-]+)\/preview\/([A-Za-z0-9._-]+)$/);
    if (previewMatch) {
      const job = jobs.get(previewMatch[1]);
      const name = previewMatch[2];
      if (!job || !/\.png$/i.test(name)) {
        sendJson(response, 404, { error: "预览不存在" });
        return true;
      }
      const target = path.join(job.previewDir, name);
      if (!isInsideDir(job.previewDir, target)) {
        sendJson(response, 400, { error: "非法预览路径" });
        return true;
      }
      let bytes;
      try {
        bytes = await fsp.readFile(target);
      } catch {
        sendJson(response, 404, { error: "预览不存在" });
        return true;
      }
      sendBinary(response, 200, bytes, { "content-type": "image/png", "cache-control": "no-store" });
      return true;
    }

    return false;
  };
}

module.exports = {
  MAX_RETAINED_JOBS,
  PPTX_CONTENT_TYPE,
  buildDeckConfig,
  buildSlideEntry,
  createJobId,
  createPptxRoutes,
  extractZipInto,
  isInsideDir,
  normalizeAspect,
  runConverter,
  sanitizeFilename
};
