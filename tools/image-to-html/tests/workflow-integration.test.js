const test = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");

const { parseUiDecompositionText } = require("../src/core/background-decomposition");
const { normalizeSlicePlacement } = require("../src/ui/services/slice-geometry");
const { createAiInpaintResultPair } = require("../src/ui/services/ai-inpaint-results");
const { getSvgRecommendation } = require("../src/ui/services/svg-recommendation");
const { sanitizeFastGeneratedHtml } = require("../src/server/services/fast-html-sanitizer");
const { createHtmlExportZip } = require("../src/server/routes/export-routes");
const { exportFigManifest } = require("../src/fig-export/export-fig");
const { decodeFigDocument } = require("../src/fig-export/fig-codec");

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFgAI/ScL2WQAAAABJRU5ErkJggg==";

test("mocked image-to-html workflow reaches offline ZIP and editable FIG", async () => {
  const decomposition = parseUiDecompositionText(JSON.stringify({
    assets: [{
      name: "flow",
      kind: "complex-chart",
      containsEmbeddedText: true,
      bbox: { x: 10, y: 20, width: 120, height: 80 }
    }],
    backgrounds: []
  }), { width: 320, height: 180 });
  const placement = normalizeSlicePlacement(decomposition.assets[0].bbox, { width: 320, height: 180 });
  const asset = { ...decomposition.assets[0], id: "flow", placement, dataUrl: PIXEL, originalDataUrl: PIXEL };
  assert.equal(getSvgRecommendation(asset).strategy, "keep-raster-or-html");

  const inpaint = createAiInpaintResultPair({
    compositeAsset: asset,
    compositeDataUrl: PIXEL,
    rawFullDataUrl: PIXEL,
    groupId: "group-1",
    rawFullId: "flow-full"
  });
  assert.equal(inpaint.composite.aiInpaintResultRole, "composite");
  assert.equal(inpaint.rawFull.aiInpaintResultRole, "raw-full");

  const reconstructed = sanitizeFastGeneratedHtml(
    '<html><body><main class="screen"><img data-reference-asset="flow" src="https://invalid.example/x.png"><script>alert(1)</script></main></body></html>',
    [asset],
    { previewWidth: 320, previewHeight: 180, sourceWidth: 320, sourceHeight: 180 }
  );
  assert.doesNotMatch(reconstructed.html, /invalid\.example|alert\(/);
  const offlineHtml = reconstructed.html.replace(/asset:flow/g, "./assets/flow.png");
  const zipBytes = await createHtmlExportZip({
    screen: { name: "workflow", width: 320, height: 180 },
    files: [
      { name: "index.html", text: offlineHtml },
      { name: "styles.css", text: ".screen{width:320px;height:180px}" },
      { name: "script.js", text: "untrusted input is replaced" },
      { name: "assets/flow.png", dataBase64: PIXEL.split(",")[1] }
    ]
  });
  const zip = await JSZip.loadAsync(zipBytes);
  assert.equal((await zip.file("index.html").async("string")).includes("asset:"), false);

  const figBytes = await exportFigManifest({
    kind: "editable",
    manifest: {
      version: "editable-design-experiment-0.4",
      screen: { name: "workflow", width: 320, height: 180 },
      nodes: [{ type: "image", name: "flow", x: 10, y: 20, width: 120, height: 80, dataUrl: PIXEL }]
    }
  });
  const decoded = decodeFigDocument(figBytes);
  assert.equal(decoded.nodes.some((node) => node.name === "workflow"), true);
  assert.equal(decoded.nodes.some((node) => node.name === "flow"), true);
});
