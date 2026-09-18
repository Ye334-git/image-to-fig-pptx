const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const TOOLS_DIR = path.resolve(__dirname, "..", "..");
const ENGINE_DIR = path.join(TOOLS_DIR, "image-to-html");
const PROJECT_DIR = path.resolve(TOOLS_DIR, "..");
const FIXTURE_DIR = path.join(PROJECT_DIR, "htmls", "1.png-html");

/**
 * End-to-end: real HTML slide packages go through the running server and come
 * back as real .pptx files built by the browser + dom-to-pptx + Microsoft
 * PowerPoint. No AI key is involved anywhere in this path.
 */

function readCanvasSize(cssText) {
  const width = cssText.match(/--board-width:\s*(\d+)/);
  const height = cssText.match(/--board-height:\s*(\d+)/);
  return width && height ? { width: Number(width[1]), height: Number(height[1]) } : null;
}

function collectExportFiles(dir, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? prefix + "/" + entry.name : entry.name;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectExportFiles(absolute, relative));
      continue;
    }
    if (/\.(html|css|js)$/i.test(entry.name)) {
      files.push({ name: relative, text: fs.readFileSync(absolute, "utf8") });
      continue;
    }
    files.push({ name: relative, dataBase64: fs.readFileSync(absolute).toString("base64") });
  }
  return files;
}

function hasZipEntry(bytes, entryName) {
  // Zip central-directory names are stored uncompressed, so a byte search is a
  // dependency-free structural check.
  return bytes.includes(Buffer.from(entryName, "utf8"));
}

async function convert(baseUrl, payload) {
  const response = await fetch(baseUrl + "/exports/pptx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    assert.fail("conversion failed: " + response.status + " " + (await response.text()).slice(0, 700));
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const jobId = response.headers.get("x-pptx-job-id");
  const job = await (await fetch(baseUrl + "/pptx-jobs/" + jobId)).json();
  return { bytes, job, slideCount: Number(response.headers.get("x-pptx-slide-count")) };
}

function assertValidPptx(bytes) {
  assert.equal(bytes.subarray(0, 2).toString(), "PK");
  assert.ok(hasZipEntry(bytes, "[Content_Types].xml"), "pptx must contain [Content_Types].xml");
  assert.ok(hasZipEntry(bytes, "ppt/presentation.xml"), "pptx must contain ppt/presentation.xml");
  assert.ok(hasZipEntry(bytes, "ppt/slides/slide1.xml"), "pptx must contain slide1.xml");
}

const WIDE_CANVAS = { width: 3040, height: 1472 };

function wideCanvasPayload() {
  return {
    screen: { name: "wide-canvas", ...WIDE_CANVAS },
    aspect: "html",
    files: [
      {
        name: "index.html",
        text: '<!doctype html>\n<html><head><meta charset="UTF-8"><link rel="stylesheet" href="./styles.css"></head>'
          + '<body><div class="fit-shell"><div class="fit-box"><main class="screen">'
          + "<h1>宽画布回归</h1><p>用于验证画布尺寸不被 scale 变换污染。</p>"
          + "</main></div></div></body></html>"
      },
      {
        name: "styles.css",
        text: ".screen{width:" + WIDE_CANVAS.width + "px;height:" + WIDE_CANVAS.height + "px;background:#fff;}"
          + "h1{font-size:120px;margin:80px;}"
      },
      { name: "script.js", text: "" }
    ]
  };
}

test("HTML slides convert to editable PPTX end to end", { timeout: 900000 }, async (t) => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), "i2p-e2e-data-"));
  process.env.HOST = "127.0.0.1";
  process.env.PORT = "0";
  process.env.IMAGE_TO_HTML_DATA_DIR = dataDir;

  const app = require(path.join(ENGINE_DIR, "server.js"));
  t.after(async () => {
    await app.shutdownServer();
    await fsp.rm(dataDir, { recursive: true, force: true });
  });
  await app.startServer();
  const baseUrl = "http://127.0.0.1:" + app.server.address().port + "/api/v1";

  const health = await (await fetch(baseUrl + "/health")).json();
  if (!health.capabilities.pptxConversionAvailable) {
    t.skip("PPTX conversion unavailable: " + health.capabilities.pptxUnavailableReason);
    return;
  }

  await t.test("a real fixture deck yields native text and picture objects", async () => {
    if (!fs.existsSync(FIXTURE_DIR)) {
      t.skip("fixture htmls/1.png-html not present");
      return;
    }
    const css = fs.readFileSync(path.join(FIXTURE_DIR, "styles.css"), "utf8");
    const screen = readCanvasSize(css);
    assert.ok(screen, "fixture styles.css must declare --board-width/--board-height");

    const { bytes, job, slideCount } = await convert(baseUrl, {
      screen: { name: "e2e-slide", ...screen },
      aspect: "16:9",
      files: collectExportFiles(FIXTURE_DIR)
    });

    assertValidPptx(bytes);
    assert.equal(slideCount, 1);

    const powerpoint = job.report.powerpoint;
    assert.equal(powerpoint.slideCount, 1);
    assert.equal(powerpoint.renderedBy, "Microsoft PowerPoint");
    const slide = powerpoint.slides[0];
    // The whole point of the pipeline: real objects, not one flattened screenshot.
    assert.ok(slide.textObjects > 0, "expected native text boxes");
    assert.ok(slide.pictureObjects > 0, "expected picture objects");
    assert.ok(slide.shapes > slide.textObjects, "expected structural shapes beyond text");

    assert.ok(job.previews.length >= 1, "expected at least one rendered preview");
    const preview = await fetch(baseUrl + job.previews[0].url.replace("/api/v1", ""));
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("content-type"), "image/png");
    assert.ok((await preview.arrayBuffer()).byteLength > 1000);

    console.log("    fixture " + screen.width + "x" + screen.height + " -> "
      + bytes.length + " bytes, " + slide.shapes + " shapes ("
      + slide.textObjects + " text, " + slide.pictureObjects + " pictures)");
  });

  await t.test("a canvas wider than the viewport keeps its true size", async () => {
    // Regression guard for the fit-script trap: the exported script.js scales
    // .screen to the viewport, so without a pinned viewport this canvas would be
    // measured as ~1920 wide instead of 3040.
    const { bytes, job } = await convert(baseUrl, wideCanvasPayload());
    assertValidPptx(bytes);

    const preflight = job.report.htmlPreflight[0];
    assert.equal(preflight.width, WIDE_CANVAS.width, "canvas width must not be scaled by the fit script");
    assert.equal(preflight.height, WIDE_CANVAS.height, "canvas height must not be scaled by the fit script");
    assert.equal(job.report.canvasMode, "html");

    const size = job.report.slideSizeIn;
    const expected = WIDE_CANVAS.width / WIDE_CANVAS.height;
    assert.ok(Math.abs((size.width / size.height) - expected) < 0.01,
      "PPT page ratio must match the canvas ratio");

    console.log("    wide canvas " + WIDE_CANVAS.width + "x" + WIDE_CANVAS.height
      + " -> " + size.width.toFixed(3) + "x" + size.height.toFixed(3) + " in");
  });
});
