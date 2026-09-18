const fs = require("node:fs");
const path = require("node:path");

/**
 * Runtime detection for the HTML -> editable PPTX step.
 *
 * Conversion needs three local things and no API key at all:
 *   1. a Chromium-based browser (preflight + computed styles)
 *   2. Microsoft PowerPoint (merge + per-slide preview rendering)
 *   3. the html-to-pptx tool next to this one
 *
 * Everything here is best-effort and never throws: a missing dependency must
 * disable the PPTX action, not break the server.
 */

const POWERPOINT_PATH_ENV = "IMAGE_TO_PPTX_POWERPOINT_PATH";
const OFFICE_SUBDIRS = ["root/Office16", "root/Office15", "Office16", "Office15", "Office14"];

function defaultIsFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function defaultListDirs(target) {
  try {
    return fs.readdirSync(target, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * tools/<toolName> — this file lives at tools/<tool>/src/server/services, so the
 * tools directory is four levels up.
 */
function resolveSiblingToolDir(toolName, baseDir = __dirname) {
  return path.resolve(baseDir, "..", "..", "..", "..", toolName);
}

function resolvePptxToolDir(baseDir = __dirname) {
  return resolveSiblingToolDir("html-to-pptx", baseDir);
}

function resolvePptxCliEntry(baseDir = __dirname) {
  return path.join(resolvePptxToolDir(baseDir), "bin", "html-to-pptx.mjs");
}

function isPptxToolInstalled(options = {}) {
  const isFile = options.isFile || defaultIsFile;
  return Boolean(isFile(resolvePptxCliEntry(options.baseDir)));
}

function listPowerPointCandidates(options = {}) {
  const env = options.env || process.env;
  const listDirs = options.listDirs || defaultListDirs;
  const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
  const candidates = [];

  if (env[POWERPOINT_PATH_ENV]) candidates.push(env[POWERPOINT_PATH_ENV]);

  for (const root of roots) {
    const officeRoot = path.join(root, "Microsoft Office");
    for (const sub of OFFICE_SUBDIRS) {
      candidates.push(path.join(officeRoot, sub, "POWERPNT.EXE"));
    }
    candidates.push(path.join(officeRoot, "POWERPNT.EXE"));
    // Click-to-Run installs into a versioned Office* folder; enumerate rather
    // than hard-code versions we cannot know ahead of time.
    for (const base of [path.join(officeRoot, "root"), officeRoot]) {
      for (const entry of listDirs(base)) {
        if (/^Office\d+$/i.test(entry)) {
          candidates.push(path.join(base, entry, "POWERPNT.EXE"));
        }
      }
    }
  }
  return candidates;
}

function resolvePowerPointExecutable(options = {}) {
  if ((options.platform || process.platform) !== "win32") return null;
  const isFile = options.isFile || defaultIsFile;
  return listPowerPointCandidates(options).find((candidate) => isFile(candidate)) || null;
}

function isPowerPointAvailable(options = {}) {
  return Boolean(resolvePowerPointExecutable(options));
}

/**
 * Capability snapshot consumed by /api/v1/health so the UI can disable the
 * PPTX action up front instead of letting the user hit a failure.
 */
function resolvePptxRuntimeCapabilities(options = {}) {
  const powerPointExecutable = resolvePowerPointExecutable(options);
  const toolInstalled = isPptxToolInstalled(options);
  const browserAvailable = Boolean(options.browserAvailable);
  return {
    browserAvailable,
    powerPointAvailable: Boolean(powerPointExecutable),
    powerPointExecutable: powerPointExecutable || null,
    pptxToolInstalled: toolInstalled,
    pptxConversionAvailable: browserAvailable && Boolean(powerPointExecutable) && toolInstalled
  };
}

/**
 * Human-readable reason the PPTX action is unavailable, or "" when it is ready.
 */
function describePptxUnavailable(capabilities = {}) {
  const missing = [];
  if (!capabilities.pptxToolInstalled) missing.push("html-to-pptx 工具未找到");
  if (!capabilities.browserAvailable) missing.push("未找到 Chrome 或 Edge");
  if (!capabilities.powerPointAvailable) missing.push("未安装 Microsoft PowerPoint");
  return missing.join("；");
}

module.exports = {
  POWERPOINT_PATH_ENV,
  describePptxUnavailable,
  isPowerPointAvailable,
  isPptxToolInstalled,
  listPowerPointCandidates,
  resolvePowerPointExecutable,
  resolvePptxCliEntry,
  resolvePptxRuntimeCapabilities,
  resolvePptxToolDir,
  resolveSiblingToolDir
};
