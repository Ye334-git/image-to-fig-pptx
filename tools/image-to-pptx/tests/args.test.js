const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const launcher = require("../bin/image-to-pptx.cjs");

test("parseArguments returns engine-compatible defaults", () => {
  const options = launcher.parseArguments([]);
  assert.equal(options.host, "127.0.0.1");
  assert.equal(options.port, 18789);
  assert.equal(options.noOpen, false);
  assert.equal(options.help, false);
  assert.equal(options.dataDir, launcher.DEFAULT_DATA_DIR);
});

test("parseArguments accepts both inline and spaced values", () => {
  const inline = launcher.parseArguments(["--port=19000", "--host=0.0.0.0", "--no-open"]);
  assert.equal(inline.port, 19000);
  assert.equal(inline.host, "0.0.0.0");
  assert.equal(inline.noOpen, true);

  const spaced = launcher.parseArguments(["--port", "19001", "--data-dir", "."]);
  assert.equal(spaced.port, 19001);
  assert.equal(spaced.dataDir, process.cwd());
});

test("parseArguments rejects unknown flags and invalid ports", () => {
  assert.throws(() => launcher.parseArguments(["--nope"]), /未知参数/);
  assert.throws(() => launcher.parseArguments(["--port", "abc"]), /无效端口/);
  assert.throws(() => launcher.parseArguments(["--port", "70000"]), /无效端口/);
  assert.throws(() => launcher.parseArguments(["--port"]), /缺少值/);
});

test("help flag is parsed without starting anything", () => {
  assert.equal(launcher.parseArguments(["--help"]).help, true);
  assert.equal(launcher.parseArguments(["-h"]).help, true);
});

test("the slicing engine it launches actually exists", () => {
  assert.ok(fs.existsSync(launcher.ENGINE_ENTRY), `engine entry missing: ${launcher.ENGINE_ENTRY}`);
  assert.match(launcher.ENGINE_ENTRY, /image-to-html[\\/]server\.js$/);
});
