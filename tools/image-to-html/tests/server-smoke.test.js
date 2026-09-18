const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("one process serves the UI and versioned API while legacy API paths stay closed", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "image-to-html-test-"));
  process.env.HOST = "127.0.0.1";
  process.env.PORT = "0";
  process.env.IMAGE_TO_HTML_DATA_DIR = dataDir;
  const app = require("../server");
  t.after(async () => {
    await app.shutdownServer();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await app.startServer();
  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const ui = await fetch(`${baseUrl}/`);
  assert.equal(ui.status, 200);
  assert.match(await ui.text(), /image-to-fig-pptx/);

  const health = await fetch(`${baseUrl}/api/v1/health`);
  const healthPayload = await health.json();
  assert.equal(healthPayload.ok, true);
  assert.equal(typeof healthPayload.capabilities.highFidelityCapture, "boolean");
  // Capabilities drive UI gating: slicing needs a vision model, PPTX needs
  // browser + PowerPoint + the sibling tool.
  assert.equal(typeof healthPayload.capabilities.visionConfigured, "boolean");
  assert.equal(typeof healthPayload.capabilities.generationConfigured, "boolean");
  assert.equal(typeof healthPayload.capabilities.powerPointAvailable, "boolean");
  assert.equal(typeof healthPayload.capabilities.pptxConversionAvailable, "boolean");
  assert.equal(typeof healthPayload.capabilities.pptxUnavailableReason, "string");
  assert.equal(healthPayload.capabilities.visionConfigured, false);

  // Slicing without a configured vision model must fail as a client error with
  // an actionable message, not a 500.
  const sliced = await fetch(`${baseUrl}/api/v1/design/plan-background-decomposition`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFgAI/ScL2WQAAAABJRU5ErkJggg==",
      width: 1,
      height: 1
    })
  });
  assert.equal(sliced.status, 400);
  assert.match((await sliced.json()).error, /图片理解|请先/);

  const legacy = await fetch(`${baseUrl}/api/model-configs`);
  assert.equal(legacy.status, 404);
});
