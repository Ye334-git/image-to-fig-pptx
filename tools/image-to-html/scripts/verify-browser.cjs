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
    if (await page.title() !== "image-to-fig-pptx") throw new Error("页面标题不正确");
    // Slice .fig export is part of this tool (requirements.md D1) and must be reachable.
    const placeSource = page.locator("#placeSource");
    if (!await placeSource.isVisible()) throw new Error("切图 .fig 入口不可见");
    if ((await placeSource.innerText()).trim() !== "导出切图 .fig") {
      throw new Error(`切图入口文案不正确：${(await placeSource.innerText()).trim()}`);
    }
    for (const selector of ["#exportSlices", "#exportFigmaFrameHtml"]) {
      if (await page.locator(selector).isVisible()) throw new Error(`已排除入口仍然可见：${selector}`);
    }
    const placeAiLayers = page.locator("#placeAiLayers");
    if (!await placeAiLayers.isVisible()) throw new Error("生成 HTML 预览入口不可见");
    if ((await placeAiLayers.innerText()).trim() !== "生成 HTML 预览") {
      throw new Error(`预览入口文案不正确：${(await placeAiLayers.innerText()).trim()}`);
    }
    // Workflow guidance: five steps, exactly one active.
    const steps = page.locator("#workflowSteps .workflow-step");
    if (await steps.count() !== 5) throw new Error("工作流步骤条不是 5 步");
    if (await page.locator("#workflowSteps .workflow-step.active").count() !== 1) {
      throw new Error("工作流步骤条应恰好有 1 个当前步骤");
    }
    // Slicing history is reachable. It stays hidden until there is history to show,
    // so only the element's presence is asserted here; the template-level removal of
    // the hard-coded hidden attribute is covered by the wiring test.
    if (await page.locator("#draftsTrigger").count() !== 1) throw new Error("切图记录入口不存在");
    const ratios = await page.locator("[data-ratio]").evaluateAll((nodes) => nodes.map((n) => n.dataset.ratio));
    if (JSON.stringify(ratios) !== JSON.stringify(["16:9", "4:3", "3:4", "custom"])) {
      throw new Error("选片比例应为 16:9 / 4:3 / 3:4 / custom，实际：" + JSON.stringify(ratios));
    }
    if (!await page.locator('[data-ratio="16:9"]').evaluate((n) => n.classList.contains("active"))) {
      throw new Error("默认比例应为 16:9");
    }
    // Secondary exports collapsed into one menu.
    if (await page.locator("#htmlPreviewMoreMenu").isVisible()) throw new Error("其他导出菜单初始应为收起");
    if (await page.locator("#htmlPreviewPptx").count() !== 1) throw new Error("缺少「转 PPTX」按钮");
    // PPTX export controls ship in the shell; they stay disabled until a preview
    // exists and the local runtime reports itself ready.
    if (await page.locator("#htmlPreviewPptx").count() !== 1) throw new Error("缺少「转 PPTX」按钮");
    if (await page.locator("#pptxAspect").count() !== 1) throw new Error("缺少 PPTX 比例选择");
    if (!await page.locator("#htmlPreviewPptx").isDisabled()) throw new Error("无 HTML 预览时「转 PPTX」应保持禁用");
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
