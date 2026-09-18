const test = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");

const {
  createExportRoutes,
  createHtmlExportZip,
  normalizeArchivePath,
  sanitizeExportCss,
  sanitizeExportHtml
} = require("../src/server/routes/export-routes");

test("HTML export creates the offline package and v1 manifest", async () => {
  const bytes = await createHtmlExportZip({
    screen: { name: "Demo", width: 320, height: 180 },
    files: [
      { name: "index.html", text: "<!doctype html><link rel=\"stylesheet\" href=\"./styles.css\"><img src=\"./assets/icon.svg\">" },
      { name: "styles.css", text: ".screen{width:320px}" },
      { name: "script.js", text: "" },
      { name: "assets/icon.svg", text: "<svg viewBox=\"0 0 1 1\"><path d=\"M0 0h1v1z\"/></svg>" }
    ]
  });
  const zip = await JSZip.loadAsync(bytes);
  assert.deepEqual(Object.keys(zip.files).sort(), [
    "assets/",
    "assets/icon.svg",
    "index.html",
    "manifest.json",
    "script.js",
    "styles.css"
  ]);
  const html = await zip.file("index.html").async("string");
  assert.equal(html.includes("asset:"), false);
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  assert.equal(manifest.schema, "image-to-html.export.v1");
});

test("HTML export rejects traversal and incomplete package payloads", async () => {
  assert.throws(() => normalizeArchivePath("../secret.txt"), /非法导出路径/);
  await assert.rejects(() => createHtmlExportZip({ files: [] }), /缺少文件/);
});

test("HTML package sanitizer removes active and external content", () => {
  const html = sanitizeExportHtml('<script>alert(1)</script><script src="./script.js"></script><img src="https://evil.example/x.png" onerror="steal()"><img src="./assets/good.png">');
  assert.doesNotMatch(html, /alert|onerror|evil\.example/);
  assert.match(html, /\.\/script\.js/);
  assert.match(html, /\.\/assets\/good\.png/);
  const css = sanitizeExportCss('@import "https://evil.example/x.css";.a{background:url(https://evil.example/x.png)}.b{background:url(./assets/good.png)}');
  assert.doesNotMatch(css, /evil\.example/);
  assert.match(css, /assets\/good\.png/);
});

test("HTML export rejects unresolved trusted asset references", async () => {
  await assert.rejects(() => createHtmlExportZip({
    files: [
      { name: "index.html", text: '<img src="asset:hero">' },
      { name: "styles.css", text: "" },
      { name: "script.js", text: "" }
    ]
  }), /未解析的 asset:/);
});

const FIG_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFgAI/ScL2WQAAAABJRU5ErkJggg==";

function createFigRouteHarness(onExport = () => Buffer.from("fig")) {
  const state = { payload: null, kinds: [] };
  const handler = createExportRoutes({
    readJson: async () => state.payload,
    exportFigManifest: async (input) => {
      state.kinds.push(input.kind);
      return onExport(input);
    },
    sendBinary: (response, status, bytes, headers) => Object.assign(response, { status, bytes, headers })
  });
  return {
    state,
    call: async () => {
      const response = {};
      const handled = await handler({ method: "POST", url: "/api/exports/fig" }, response);
      assert.equal(handled, true);
      return response;
    }
  };
}

test("fig export route dispatches both slice and editable manifests", async () => {
  const harness = createFigRouteHarness();

  harness.state.payload = {
    kind: "editable",
    manifest: {
      version: "editable-design-experiment-0.4",
      screen: { name: "可编辑稿", width: 100, height: 100 },
      nodes: []
    }
  };
  const editableResponse = await harness.call();
  assert.equal(editableResponse.status, 200);
  assert.match(editableResponse.headers["content-disposition"], /filename\*=UTF-8''/);

  harness.state.payload = {
    kind: "slice",
    manifest: {
      version: "1.0.0",
      screen: { name: "切图稿", width: 750, height: 1334 },
      previewImage: { dataUrl: FIG_PIXEL_PNG },
      assets: [{
        name: "hero_icon",
        placement: { x: 10, y: 20, width: 30, height: 40 },
        dataUrl: FIG_PIXEL_PNG
      }]
    }
  };
  const sliceResponse = await harness.call();
  assert.equal(sliceResponse.status, 200);
  assert.deepEqual(harness.state.kinds, ["editable", "slice"]);
});

test("fig export route rejects unknown kinds and malformed manifests", async () => {
  const harness = createFigRouteHarness();
  const call = harness.call;

  harness.state.payload = { manifest: { screen: {}, assets: [] } };
  await assert.rejects(call, /必须指定 \.fig 导出类型/);

  harness.state.payload = { kind: "slice", manifest: { screen: { name: "x", width: 1, height: 1 }, assets: [] } };
  await assert.rejects(call, /previewImage/);

  harness.state.payload = {
    kind: "slice",
    manifest: {
      screen: { name: "x", width: 1, height: 1 },
      previewImage: { dataUrl: FIG_PIXEL_PNG },
      assets: [{ name: "a", placement: { x: 1, y: 1, width: 1, height: 1 } }]
    }
  };
  await assert.rejects(call, /dataUrl 或 svgData/);

  harness.state.payload = {
    kind: "editable",
    manifest: { version: "not-editable", screen: { width: 1, height: 1 }, nodes: [] }
  };
  await assert.rejects(call, /只允许导出/);

  assert.deepEqual(harness.state.kinds, []);
});
