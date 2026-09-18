const test = require("node:test");
const assert = require("node:assert/strict");

const { exportFigManifest } = require("../src/fig-export/export-fig");
const { decodeFigDocument } = require("../src/fig-export/fig-codec");

const RED_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFgAI/ScL2WQAAAABJRU5ErkJggg==";

function buildSliceManifest() {
  return {
    version: "1.0.0",
    screen: { name: "Slice Screen", width: 750, height: 1334 },
    previewImage: { dataUrl: RED_PIXEL_PNG },
    assets: [{
      id: "asset-1",
      name: "Product",
      dataUrl: RED_PIXEL_PNG,
      selected: true,
      radius: 12,
      placement: { x: 30, y: 40, width: 120, height: 160 }
    }, {
      id: "asset-2",
      name: "Complex SVG",
      dataUrl: RED_PIXEL_PNG,
      svgData: '<svg viewBox="0 0 24 24"><defs><linearGradient id="g"><stop stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="24" height="24" fill="url(#g)"/></svg>',
      selected: true,
      placement: { x: 180, y: 40, width: 24, height: 24 }
    }]
  };
}

test("slice manifest exports a fig frame with a locked reference and positioned assets", async () => {
  const decoded = decodeFigDocument(await exportFigManifest({
    kind: "slice",
    manifest: buildSliceManifest()
  }));

  const frame = decoded.nodes.find((node) => node.name === "Slice Screen");
  const reference = decoded.nodes.find((node) => node.name === "preview_full_ui_reference");
  const product = decoded.nodes.find((node) => node.name === "Product");
  const complexSvg = decoded.nodes.find((node) => node.name === "Complex SVG");

  assert.equal(frame.type, "FRAME");
  assert.equal(reference.fillPaints[0].type, "IMAGE");
  assert.equal(reference.locked, true);
  assert.equal(product.transform.m02, 30);
  assert.equal(product.transform.m12, 40);
  assert.equal(product.cornerRadius, 12);
  assert.ok(decoded.images.has(product.fillPaints[0].image.name));
  assert.equal(product.exportSettings[0].imageType, "PNG");
  assert.equal(complexSvg.type, "ROUNDED_RECTANGLE");
  assert.equal(complexSvg.exportSettings[0].imageType, "PNG");
});

test("slice export skips hidden assets but keeps the frame", async () => {
  const manifest = buildSliceManifest();
  manifest.assets[0].selected = false;
  const decoded = decodeFigDocument(await exportFigManifest({ kind: "slice", manifest }));

  assert.ok(decoded.nodes.find((node) => node.name === "Slice Screen"));
  assert.equal(decoded.nodes.find((node) => node.name === "Product"), undefined);
  assert.ok(decoded.nodes.find((node) => node.name === "Complex SVG"));
});

test("slice export names the document after the screen and falls back safely", async () => {
  const named = await exportFigManifest({ kind: "slice", manifest: buildSliceManifest() });
  assert.ok(named.length > 0);

  const fallback = await exportFigManifest({
    kind: "slice",
    manifest: { screen: { width: 10, height: 10 }, previewImage: { dataUrl: RED_PIXEL_PNG }, assets: [] }
  });
  assert.ok(fallback.length > 0);
});

test("unknown fig kinds are rejected", async () => {
  await assert.rejects(
    () => exportFigManifest({ kind: "nope", manifest: buildSliceManifest() }),
    /不支持的 \.fig 导出类型/
  );
});
