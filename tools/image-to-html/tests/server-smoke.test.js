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
  assert.match(await ui.text(), /Image To HTML/);

  const health = await fetch(`${baseUrl}/api/v1/health`);
  const healthPayload = await health.json();
  assert.equal(healthPayload.ok, true);
  assert.equal(typeof healthPayload.capabilities.highFidelityCapture, "boolean");

  const legacy = await fetch(`${baseUrl}/api/model-configs`);
  assert.equal(legacy.status, 404);
});
