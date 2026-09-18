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

test("the workflow guidance replaces the inherited design-tool shell", () => {
  const template = readSource("ui.template.html");
  const nodeMode = readSource("state/fig-export-mode.js");

  // Five-step bar with the three onward actions numbered to match it.
  assert.match(template, /id="workflowSteps"/);
  // step 1 also carries the "active" class, so match the prefix rather than the exact attribute
  assert.equal((template.match(/class="workflow-step\b/g) || []).length, 5);
  // Step names stay short; the buttons carry the full action names. Numbering both
  // put two identical labels side by side, which read as noise.
  assert.match(template, /<b>②<\/b>切图/);
  assert.match(template, /<b>⑤<\/b>PPTX/);
  assert.match(template, /disabled>一键切图<\/button>/);
  assert.match(template, /disabled>生成 HTML<\/button>/);
  assert.match(template, /disabled>转 PPTX<\/button>/);
  assert.doesNotMatch(template, /② 一键切图/);

  // Stage gating: the top bar starts with slicing only, and the post-slice actions
  // stay in the DOM but hidden so nothing can be exported before there are slices.
  assert.match(template, /id="sliceExportGroup" class="slice-export-group" hidden/);
  assert.match(template, /id="generateHtmlGroup" class="import-action-group ai" hidden/);
  assert.match(template, /id="sliceExport"[^>]*>导出切图包<\/button>/);
  assert.match(template, /data-slice-export-mode="zip"/);
  assert.match(template, /data-slice-export-mode="fig"/);
  // The old always-visible .fig button is gone; .fig now lives behind the dropdown.
  assert.doesNotMatch(template, /id="placeSource"/);
  // Only 生成 HTML is the filled primary action at this stage.
  assert.match(template, /id="placeAiLayers" class="text-action primary-action"/);
  assert.match(template, /id="sliceExport" class="text-action ghost-action"/);
  // The pre-HTML .fig caveat must be spelled out.
  assert.match(template, /id="sliceExportFigHint"/);
  assert.match(template, /不含文字/);
  // Dragging is the only way to change layer order, so it has to be advertised.
  assert.match(template, /cut-title-hint/);

  // PPT vocabulary instead of the Figma plugin's wording.
  assert.doesNotMatch(template, /AI拆图/);
  assert.doesNotMatch(template, /AI 图层导入/);
  assert.doesNotMatch(template, /设计稿/);
  assert.doesNotMatch(nodeMode, /设计稿/);
  assert.match(nodeMode, /sliceLabel: "导出切图 \.fig"/);

  // PPT-first presets only, 16:9 selected by default.
  const ratios = [...template.matchAll(/data-ratio="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ratios, ["16:9", "4:3", "3:4", "custom"]);
  assert.match(template, /class="choice active" type="button" data-ratio="16:9"/);

  // Slicing history must not be hard-hidden any more (it is toggled by state instead).
  assert.match(template, /<button id="draftsTrigger"[^>]*>/);
  assert.doesNotMatch(template, /<button id="draftsTrigger"[^>]*\bhidden\b/);

  // Secondary exports collapsed into one menu; the primary action is its own button.
  assert.match(template, /id="htmlPreviewMoreMenu"/);
  assert.match(template, /class="html-preview-pptx-primary"/);
  const menuStart = template.indexOf('id="htmlPreviewMoreMenu"');
  assert.ok(template.indexOf('id="htmlPreviewImport"') > menuStart, "editable .fig must live inside the menu");
  assert.ok(template.indexOf('id="htmlPreviewDownload"') > menuStart, "HTML zip must live inside the menu");
  assert.ok(template.indexOf('id="htmlPreviewPptx"') < menuStart, "转 PPTX must stay a first-class action");
});

test("the highlighted ratio preset and the real pixel size stay in sync", () => {
  const template = readSource("ui.template.html");
  const app = readSource("app.js");

  // The sidebar highlights a preset, but generation reads the hidden custom-size
  // inputs. If those keep an old default the UI lies about the output shape — which is
  // exactly how 16:9 produced portrait images.
  const width = template.match(/id="width"[^>]*value="(\d+)"/);
  const height = template.match(/id="height"[^>]*value="(\d+)"/);
  assert.ok(width && height, "the size inputs must declare defaults");
  assert.ok(Number(width[1]) / Number(height[1]) > 1.2, `default ${width[1]}x${height[1]} must be landscape`);

  const preset = app.match(/"16:9":\s*\[(\d+),\s*(\d+)\]/);
  assert.ok(preset, "the 16:9 preset must exist");
  assert.equal(width[1], preset[1], "template width must match the 16:9 preset");
  assert.equal(height[1], preset[2], "template height must match the 16:9 preset");

  // Portrait leftovers in the fallbacks would reintroduce the same bug silently.
  assert.doesNotMatch(app, /256, 4096, 750\)/);
  assert.doesNotMatch(app, /256, 4096, 1334\)/);
  assert.doesNotMatch(app, /256, 4096, 390\)/);
  assert.doesNotMatch(app, /256, 4096, 844\)/);

  // And the preset has to be applied on load, not only when a preset is clicked.
  assert.match(app, /\n      applyRatio\(currentRatio\);/);
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
  assert.ok(built.includes("导出切图到 .fig"), "dist/ui.html must expose the .fig slice export");
  assert.ok(built.includes("sliceExportGroup"), "dist/ui.html must carry the stage-gated export group");
  // Workflow guidance added on top of the inherited design-tool shell.
  assert.ok(built.includes("workflowSteps"), "dist/ui.html must carry the workflow step bar");
  assert.ok(built.includes("htmlPreviewMoreMenu"), "dist/ui.html must carry the secondary export menu");
});
