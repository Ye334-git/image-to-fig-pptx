const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  describePptxUnavailable,
  isPowerPointAvailable,
  isPptxToolInstalled,
  listPowerPointCandidates,
  resolvePowerPointExecutable,
  resolvePptxCliEntry,
  resolvePptxRuntimeCapabilities,
  resolvePptxToolDir,
  resolveSiblingToolDir
} = require("../src/server/services/pptx-runtime");

const OFFICE = "C:\\Program Files\\Microsoft Office";
const POWERPOINT = path.join(OFFICE, "root", "Office16", "POWERPNT.EXE");

function fakeEnv(overrides = {}) {
  return { PROGRAMFILES: "C:\\Program Files", ...overrides };
}

test("resolveSiblingToolDir points at the sibling tool next to image-to-html", () => {
  const toolsDir = path.resolve(__dirname, "..", "..");
  assert.equal(resolveSiblingToolDir("html-to-pptx", path.join(toolsDir, "image-to-html", "src", "server", "services")), path.join(toolsDir, "html-to-pptx"));
  assert.equal(resolvePptxToolDir(path.join(toolsDir, "image-to-html", "src", "server", "services")), path.join(toolsDir, "html-to-pptx"));
  assert.match(resolvePptxCliEntry(path.join(toolsDir, "image-to-html", "src", "server", "services")), /html-to-pptx[\\/]bin[\\/]html-to-pptx\.mjs$/);
});

test("the html-to-pptx CLI really exists next to this tool", () => {
  assert.equal(isPptxToolInstalled(), true);
});

test("powerpoint resolution is non-throwing and returns null off Windows", () => {
  assert.equal(resolvePowerPointExecutable({ platform: "linux" }), null);
  assert.equal(isPowerPointAvailable({ platform: "darwin" }), false);
  assert.equal(resolvePowerPointExecutable({ platform: "win32", env: {}, listDirs: () => [] }), null);
});

test("powerpoint is found via the env override and via Click-to-Run folders", () => {
  const override = "D:\\Custom\\POWERPNT.EXE";
  assert.equal(
    resolvePowerPointExecutable({
      platform: "win32",
      env: fakeEnv({ IMAGE_TO_PPTX_POWERPOINT_PATH: override }),
      isFile: (target) => target === override,
      listDirs: () => []
    }),
    override
  );

  const found = resolvePowerPointExecutable({
    platform: "win32",
    env: fakeEnv(),
    isFile: (target) => target === POWERPOINT,
    listDirs: (target) => (target === path.join(OFFICE, "root") ? ["Office16"] : [])
  });
  assert.equal(found, POWERPOINT);
});

test("candidate list covers explicit Office versions without touching the disk", () => {
  const candidates = listPowerPointCandidates({ env: fakeEnv(), listDirs: () => [] });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => candidate.toLowerCase().endsWith("powerpnt.exe")));
  assert.ok(candidates.some((candidate) => candidate.includes(path.join("root", "Office16"))));
});

test("capabilities require browser, powerpoint and the tool together", () => {
  const ready = resolvePptxRuntimeCapabilities({
    platform: "win32",
    env: fakeEnv(),
    browserAvailable: true,
    isFile: (target) => target === POWERPOINT || target.endsWith("html-to-pptx.mjs"),
    listDirs: (target) => (target === path.join(OFFICE, "root") ? ["Office16"] : [])
  });
  assert.equal(ready.powerPointAvailable, true);
  assert.equal(ready.pptxToolInstalled, true);
  assert.equal(ready.pptxConversionAvailable, true);
  assert.equal(describePptxUnavailable(ready), "");

  const readyOptions = {
    platform: "win32",
    env: fakeEnv(),
    browserAvailable: true,
    isFile: (target) => target === POWERPOINT || target.endsWith("html-to-pptx.mjs"),
    listDirs: (target) => (target === path.join(OFFICE, "root") ? ["Office16"] : [])
  };

  // Each dependency missing on its own must disable conversion.
  assert.equal(
    resolvePptxRuntimeCapabilities({ ...readyOptions, browserAvailable: false }).pptxConversionAvailable,
    false,
    "no browser"
  );
  assert.equal(
    resolvePptxRuntimeCapabilities({ ...readyOptions, platform: "linux" }).pptxConversionAvailable,
    false,
    "no PowerPoint"
  );
  assert.equal(
    resolvePptxRuntimeCapabilities({
      ...readyOptions,
      isFile: (target) => target === POWERPOINT
    }).pptxConversionAvailable,
    false,
    "no html-to-pptx tool"
  );
});

test("unavailable reasons are specific and human readable", () => {
  assert.match(describePptxUnavailable({ pptxToolInstalled: false, browserAvailable: false, powerPointAvailable: false }), /html-to-pptx/);
  assert.match(describePptxUnavailable({ pptxToolInstalled: true, browserAvailable: false, powerPointAvailable: true }), /Chrome/);
  assert.match(describePptxUnavailable({ pptxToolInstalled: true, browserAvailable: true, powerPointAvailable: false }), /PowerPoint/);
});
