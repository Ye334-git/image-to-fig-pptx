const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");

const baseUrl = process.env.IMAGE_TO_HTML_URL || "http://127.0.0.1:18789";
const sampleImage = path.resolve(process.argv[2] || path.join(__dirname, "../../../1.png"));
const resultDir = path.join(__dirname, "..", "test-results");

async function main() {
  const executablePath = findBrowser();
  if (!executablePath) {
    console.log("SKIP: 未找到系统 Chrome/Edge");
    return;
  }
  if (!fs.existsSync(sampleImage)) throw new Error(`验收图片不存在：${sampleImage}`);
  fs.mkdirSync(resultDir, { recursive: true });
  const screenshotPath = path.join(
    resultDir,
    `browser-${path.basename(sampleImage, path.extname(sampleImage)).replace(/[^A-Za-z0-9_-]+/g, "-")}.png`
  );
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    try {
      await page.locator("#startupGate").waitFor({ state: "hidden", timeout: 10000 });
    } catch {
      const startupMessage = await page.locator("#startupMessage").innerText().catch(() => "");
      throw new Error(`启动页未关闭：${startupMessage}${errors.length ? `；${errors.join(" | ")}` : ""}`);
    }
    if (await page.title() !== "Image To HTML") throw new Error("页面标题不正确");
    for (const selector of ["#placeSource", "#exportSlices", "#exportFigmaFrameHtml"]) {
      if (await page.locator(selector).isVisible()) throw new Error(`已排除入口仍然可见：${selector}`);
    }
    if (!await page.locator("#placeAiLayers").isVisible()) throw new Error("AI 图层重建入口不可见");
    await page.locator("#localImage").setInputFiles(sampleImage);
    await page.locator(".result-card").waitFor({ state: "visible", timeout: 15000 });
    await page.locator("#globalLoadingDialog").waitFor({ state: "hidden", timeout: 15000 });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (errors.length) throw new Error(`浏览器控制台错误：${errors.join(" | ")}`);
    console.log(`PASS: 页面启动和本地图片载入通过；截图 ${screenshotPath}`);
  } finally {
    await browser.close();
  }
}

function findBrowser() {
  const candidates = [
    process.env.IMAGE_TO_HTML_BROWSER_PATH,
    process.platform === "win32" && path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
    process.platform === "win32" && path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
    process.platform === "win32" && path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
    process.platform === "darwin" && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    process.platform === "linux" && "/usr/bin/google-chrome",
    process.platform === "linux" && "/usr/bin/chromium"
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
