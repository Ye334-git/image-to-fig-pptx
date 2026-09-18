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

test("fig export route accepts editable manifests and rejects slice manifests", async () => {
  let payload;
  const handler = createExportRoutes({
    readJson: async () => payload,
    exportFigManifest: async (input) => {
      assert.equal(input.kind, "editable");
      return Buffer.from("fig");
    },
    sendBinary: (response, status, bytes, headers) => Object.assign(response, { status, bytes, headers })
  });
  const response = {};
  payload = {
    manifest: {
      version: "editable-design-experiment-0.4",
      screen: { name: "可编辑稿", width: 100, height: 100 },
      nodes: []
    }
  };
  assert.equal(await handler({ method: "POST", url: "/api/exports/fig" }, response), true);
  assert.equal(response.status, 200);
  assert.match(response.headers["content-disposition"], /filename\*=UTF-8''/);

  payload = { manifest: { screen: {}, assets: [] } };
  await assert.rejects(
    () => handler({ method: "POST", url: "/api/exports/fig" }, {}),
    /只允许导出/
  );
});
