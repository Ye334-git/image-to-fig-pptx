const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { normalizeAspect } = require("../src/server/routes/pptx-routes");

const UI_DIR = path.join(__dirname, "..", "src", "ui");
const DIST_UI = path.join(__dirname, "..", "dist", "ui.html");

function readSource(name) {
  return fs.readFileSync(path.join(UI_DIR, name), "utf8");
}

test("the preview panel exposes the PPTX aspect selector and convert button", () => {
  const template = readSource("ui.template.html");
  assert.match(template, /id="htmlPreviewPptx"/);
  assert.match(template, /id="pptxAspect"/);
  assert.match(template, /id="htmlPreviewPptxResult"/);

  const options = [...template.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(options, ["16:9", "html", "4:3", "3:4"]);
  // Every option the UI offers must be accepted by the export route.
  for (const option of options) {
    assert.doesNotThrow(() => normalizeAspect(option), `route rejected the UI aspect option ${option}`);
  }
});

test("the UI reuses one export package for both HTML and PPTX", () => {
  const app = readSource("app.js");
  assert.match(app, /async function buildEditableExportPayload\(\)/);
  assert.match(app, /async function downloadEditableHtmlZip\(\)/);
  assert.match(app, /async function exportEditablePptx\(\)/);
  // Both consumers must go through the shared builder rather than duplicating it.
  // one definition plus three consumers: HTML zip, single-page PPTX, deck queue
  assert.equal((app.match(/buildEditableExportPayload\(\)/g) || []).length, 4);
  assert.match(app, /fetchBackend\("\/api\/v1\/exports\/pptx",/);
  assert.match(app, /body: \{ \.\.\.payload, aspect: readPptxAspect\(\) \}/);
  assert.match(app, /JSON\.stringify\(body\)/);
  assert.match(app, /function updatePptxExportButtonState\(\)/);
  assert.match(app, /pptxRuntimeCapabilities\.pptxConversionAvailable/);
});

test("the PPTX action is gated on the health capability, not on any API key", () => {
  const app = readSource("app.js");
  assert.match(app, /pptxConversionAvailable: health\?\.capabilities\?\.pptxConversionAvailable === true/);
  assert.match(app, /pptxUnavailableReason: String\(health\?\.capabilities\?\.pptxUnavailableReason \|\| ""\)/);
  assert.match(app, /不需要 API Key/);
});

test("multi-page decks are queued client side and merged server side", () => {
  const app = readSource("app.js");
  const template = readSource("ui.template.html");
  assert.match(template, /id="pptxAddToDeck"/);
  assert.match(template, /id="pptxDeckExport"/);
  assert.match(template, /id="pptxDeckClear"/);
  assert.match(template, /id="pptxDeckStrip"/);
  assert.match(app, /let pptxDeckQueue = \[\]/);
  // The merged request must send an ordered slides[] array of captured packages.
  assert.match(app, /slides: pptxDeckQueue\.map\(\(item\) => \(\{ screen: item\.screen, files: item\.files \}\)\)/);
  assert.match(app, /function clearPptxDeckQueue\(\)/);
});

test("the built UI is not stale", () => {
  assert.ok(fs.existsSync(DIST_UI), "dist/ui.html missing - run npm run build");
  const built = fs.readFileSync(DIST_UI, "utf8");
  for (const marker of ["htmlPreviewPptx", "pptxAspect", "htmlPreviewPptxResult", "buildEditableExportPayload", "exportEditablePptx", "pptxAddToDeck", "pptxDeckExport", "exportPptxDeck"]) {
    assert.ok(built.includes(marker), `dist/ui.html is stale: missing ${marker}. Run npm run build.`);
  }
  // The slice .fig action must stay exposed (T2 regression guard).
  assert.ok(built.includes("下载切图 .fig"), "dist/ui.html must expose the slice .fig action");
});
