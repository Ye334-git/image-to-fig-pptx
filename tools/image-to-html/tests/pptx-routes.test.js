const test = require("node:test");
const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");

const {
  buildDeckConfig,
  createPptxRoutes,
  extractZipInto,
  isInsideDir,
  normalizeAspect,
  sanitizeFilename
} = require("../src/server/routes/pptx-routes");
const { createHtmlExportZip } = require("../src/server/routes/export-routes");

const READY = {
  browserAvailable: true,
  powerPointAvailable: true,
  pptxToolInstalled: true,
  pptxConversionAvailable: true
};

function exportPayload(overrides = {}) {
  return {
    screen: { name: "演示稿", width: 3040, height: 1472 },
    files: [
      { name: "index.html", text: '<!doctype html><link rel="stylesheet" href="./styles.css"><div class="screen">hi</div>' },
      { name: "styles.css", text: ".screen{width:3040px;height:1472px}" },
      { name: "script.js", text: "" }
    ],
    ...overrides
  };
}

async function makeWorkRoot(t) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "i2p-route-test-"));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  return dir;
}

function makeResponders() {
  const state = { json: null, binary: null };
  return {
    state,
    sendJson: (response, status, body) => { state.json = { status, body }; },
    sendBinary: (response, status, bytes, headers) => { state.binary = { status, bytes, headers }; }
  };
}

test("normalizeAspect accepts aliases and rejects unknown modes", () => {
  assert.equal(normalizeAspect(undefined), "16:9");
  assert.equal(normalizeAspect("16:9"), "16:9");
  assert.equal(normalizeAspect("16x9"), "16:9");
  assert.equal(normalizeAspect("html"), "html");
  assert.equal(normalizeAspect("original"), "html");
  assert.equal(normalizeAspect("16：9"), "16:9");
  assert.throws(() => normalizeAspect("21:9"), /不支持的画布比例/);
});

test("isInsideDir blocks traversal", () => {
  assert.equal(isInsideDir("/a/b", "/a/b/c.png"), true);
  assert.equal(isInsideDir("/a/b", "/a/b/../evil.png"), false);
  assert.equal(isInsideDir("/a/b", "/a/bb/evil.png"), false);
  assert.equal(isInsideDir("/a/b", "/a/b"), false);
});

test("sanitizeFilename keeps a usable stem and always ends in .pptx", () => {
  assert.equal(sanitizeFilename("3.1 项目创新性"), "3-1-项目创新性.pptx");
  assert.equal(sanitizeFilename(""), "image-to-pptx.pptx");
  assert.equal(sanitizeFilename("///"), "image-to-pptx.pptx");
  assert.ok(sanitizeFilename("x".repeat(200)).length <= 85);
});

test("deck config pins the viewport to the canvas size", () => {
  // Regression guard: without an explicit viewport, .screen is measured after
  // the exported fit-script has scaled it, so a 3040px canvas would come out wrong.
  const config = buildDeckConfig({
    jobDir: "/jobs/abc",
    aspect: "16:9",
    slides: [{ html: "/jobs/abc/input/index.html", selector: ".screen", viewport: { width: 3040, height: 1472 } }]
  });
  assert.equal(config.output, path.join("/jobs/abc", "deck.pptx"));
  assert.equal(config.aspect, "16:9");
  assert.equal(config.overwrite, true);
  assert.equal(config.slides[0].viewport.width, 3040);
  assert.equal(config.slides[0].viewport.height, 1472);
  assert.equal(config.renderDir, path.join("/jobs/abc", "preview"));
});

test("extractZipInto writes the package and refuses traversal", async (t) => {
  const root = await makeWorkRoot(t);
  const bytes = await createHtmlExportZip(exportPayload());
  const target = path.join(root, "input");
  await fsp.mkdir(target, { recursive: true });
  await extractZipInto(bytes, target);

  assert.match(await fsp.readFile(path.join(target, "index.html"), "utf8"), /class="screen"/);
  assert.ok((await fsp.stat(path.join(target, "styles.css"))).isFile());

  const evil = new JSZip();
  evil.file("../escape.txt", "nope");
  const evilBytes = await evil.generateAsync({ type: "nodebuffer" });
  await assert.rejects(() => extractZipInto(evilBytes, target), /非法导出路径/);
});

test("pptx route converts, keeps the job, and serves previews", async (t) => {
  const workRoot = await makeWorkRoot(t);
  const responders = makeResponders();
  const seen = {};
  const handler = createPptxRoutes({
    readJson: async () => exportPayload({ aspect: "16:9" }),
    sendJson: responders.sendJson,
    sendBinary: responders.sendBinary,
    workRoot,
    resolveCapabilities: () => READY,
    converter: async (configPath) => {
      const config = JSON.parse(await fsp.readFile(configPath, "utf8"));
      seen.config = config;
      await fsp.mkdir(config.renderDir, { recursive: true });
      await fsp.writeFile(config.output, Buffer.from("PK-fake-pptx"));
      await fsp.writeFile(config.output + ".report.json", JSON.stringify({
        powerpoint: { slides: [{ slide: 1, shapes: 3, textObjects: 2, pictureObjects: 1 }] }
      }));
      await fsp.writeFile(path.join(config.renderDir, "slide-001.png"), Buffer.from("png"));
      return { stdout: "", stderr: "" };
    }
  });

  assert.equal(await handler({ method: "POST", url: "/api/exports/pptx" }, {}), true);
  assert.equal(responders.state.binary.status, 200);
  assert.equal(responders.state.binary.bytes.toString(), "PK-fake-pptx");
  assert.match(responders.state.binary.headers["content-type"], /presentationml\.presentation/);
  const jobId = responders.state.binary.headers["x-pptx-job-id"];
  assert.ok(jobId);
  assert.equal(responders.state.binary.headers["x-pptx-slide-count"], "1");
  assert.equal(seen.config.slides[0].viewport.width, 3040);

  assert.equal(await handler({ method: "GET", url: `/api/pptx-jobs/${jobId}` }, {}), true);
  assert.equal(responders.state.json.status, 200);
  assert.equal(responders.state.json.body.slideCount, 1);
  assert.equal(responders.state.json.body.previews.length, 1);
  assert.match(responders.state.json.body.previews[0].url, /^\/api\/v1\/pptx-jobs\//);

  assert.equal(await handler({ method: "GET", url: `/api/pptx-jobs/${jobId}/preview/slide-001.png` }, {}), true);
  assert.equal(responders.state.binary.headers["content-type"], "image/png");
});

test("pptx route reports missing dependencies as 503 instead of crashing", async (t) => {
  const workRoot = await makeWorkRoot(t);
  const responders = makeResponders();
  const handler = createPptxRoutes({
    readJson: async () => exportPayload(),
    sendJson: responders.sendJson,
    sendBinary: responders.sendBinary,
    workRoot,
    resolveCapabilities: () => ({ ...READY, powerPointAvailable: false, pptxConversionAvailable: false }),
    converter: async () => { throw new Error("should not run"); }
  });
  await assert.rejects(
    () => handler({ method: "POST", url: "/api/exports/pptx" }, {}),
    (error) => error.statusCode === 503 && /PowerPoint/.test(error.message)
  );
});

test("pptx route surfaces converter failures without leaking job paths", async (t) => {
  const workRoot = await makeWorkRoot(t);
  const responders = makeResponders();
  const handler = createPptxRoutes({
    readJson: async () => exportPayload(),
    sendJson: responders.sendJson,
    sendBinary: responders.sendBinary,
    workRoot,
    resolveCapabilities: () => READY,
    converter: async () => {
      throw Object.assign(new Error("PPTX 转换失败：HTML asset preflight failed"), { statusCode: 502 });
    }
  });
  await assert.rejects(
    () => handler({ method: "POST", url: "/api/exports/pptx" }, {}),
    (error) => error.statusCode === 502 && /asset preflight/.test(error.message) && !error.message.includes(workRoot)
  );
});

test("pptx route rejects a payload without canvas dimensions", async (t) => {
  const workRoot = await makeWorkRoot(t);
  const responders = makeResponders();
  const handler = createPptxRoutes({
    readJson: async () => exportPayload({ screen: { name: "x" } }),
    sendJson: responders.sendJson,
    sendBinary: responders.sendBinary,
    workRoot,
    resolveCapabilities: () => READY,
    converter: async () => ({})
  });
  await assert.rejects(() => handler({ method: "POST", url: "/api/exports/pptx" }, {}), /画布尺寸/);
});

test("pptx route ignores unrelated requests", async (t) => {
  const workRoot = await makeWorkRoot(t);
  const handler = createPptxRoutes({
    readJson: async () => exportPayload(),
    sendJson: () => {},
    sendBinary: () => {},
    workRoot,
    resolveCapabilities: () => READY,
    converter: async () => ({})
  });
  assert.equal(await handler({ method: "GET", url: "/api/health" }, {}), false);
  assert.equal(await handler({ method: "GET", url: "/api/pptx-jobs/does-not-exist" }, {}), true);
});
