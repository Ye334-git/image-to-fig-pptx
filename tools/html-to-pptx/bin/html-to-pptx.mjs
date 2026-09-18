#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";
import puppeteer from "puppeteer";

const toolDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function printHelp() {
  process.stdout.write(`HTML to editable PPTX pipeline

Usage:
  node bin/html-to-pptx.mjs --config examples/deck.example.json
  node bin/html-to-pptx.mjs --input slide1/index.html --input slide2/index.html --output deck.pptx

Options:
  --config <json>         JSON manifest. Relative paths resolve from the manifest folder.
  --input <path>          HTML file or a directory containing index.html. Repeatable.
  --output <pptx>         Final PPTX path.
  --selector <css>        Slide root selector. Default: .screen
  --aspect <mode>         Canvas mode: html, 16:9, 4:3, or 3:4. Default: html
  --slide-width <in>      Common PowerPoint slide width in inches.
  --slide-height <in>     Common PowerPoint slide height in inches.
  --render-dir <dir>      Final PowerPoint PNG preview directory.
  --no-render             Skip final PNG rendering. PowerPoint is still used to merge.
  --work-dir <dir>        Intermediate output directory.
  --keep-work             Keep per-slide PPTX files and merge manifest.
  --overwrite             Replace the exact output file if it already exists.
  --help                  Show this help.
`);
}

function parseArgs(argv) {
  const result = { inputs: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next) throw new Error(`Missing value for ${arg}`);
      return next;
    };
    if (arg === "--config") result.config = value();
    else if (arg === "--input") result.inputs.push(value());
    else if (arg === "--output") result.output = value();
    else if (arg === "--selector") result.selector = value();
    else if (arg === "--aspect") result.aspect = value();
    else if (arg === "--slide-width") result.slideWidthIn = Number(value());
    else if (arg === "--slide-height") result.slideHeightIn = Number(value());
    else if (arg === "--render-dir") result.renderDir = value();
    else if (arg === "--work-dir") result.workDir = value();
    else if (arg === "--no-render") result.render = false;
    else if (arg === "--keep-work") result.keepWork = true;
    else if (arg === "--overwrite") result.overwrite = true;
    else if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else result.inputs.push(arg);
  }
  return result;
}

function normalizeAspect(value) {
  const normalized = String(value ?? "html").trim().toLowerCase().replaceAll("：", ":");
  const aliases = new Map([
    ["html", "html"],
    ["source", "html"],
    ["original", "html"],
    ["16:9", "16:9"],
    ["16x9", "16:9"],
    ["wide", "16:9"],
    ["4:3", "4:3"],
    ["4x3", "4:3"],
    ["standard", "4:3"],
    ["3:4", "3:4"],
    ["3x4", "3:4"],
    ["portrait", "3:4"],
  ]);
  const mode = aliases.get(normalized);
  if (!mode) throw new Error(`Unsupported aspect mode: ${value}. Use html, 16:9, 4:3, or 3:4.`);
  return mode;
}

function resolveSlideSize(config, firstInspection) {
  let widthIn = Number(config.slideWidthIn);
  let heightIn = Number(config.slideHeightIn);
  const hasCustomSize = widthIn > 0 || heightIn > 0;
  if (hasCustomSize) {
    if (config.aspect !== "html") {
      throw new Error("Use either --aspect or --slide-width/--slide-height, not both.");
    }
    if (!(widthIn > 0)) widthIn = heightIn * (firstInspection.width / firstInspection.height);
    if (!(heightIn > 0)) heightIn = widthIn / (firstInspection.width / firstInspection.height);
    return { widthIn, heightIn, mode: "custom" };
  }
  if (config.aspect === "16:9") return { widthIn: 13.333333, heightIn: 7.5, mode: "16:9" };
  if (config.aspect === "4:3") return { widthIn: 10, heightIn: 7.5, mode: "4:3" };
  if (config.aspect === "3:4") return { widthIn: 7.5, heightIn: 10, mode: "3:4" };
  widthIn = 13.333333;
  heightIn = widthIn / (firstInspection.width / firstInspection.height);
  return { widthIn, heightIn, mode: "html" };
}

function computeContainPlacement(inspection, slideSize) {
  const sourceRatio = inspection.width / inspection.height;
  const targetRatio = slideSize.widthIn / slideSize.heightIn;
  if (sourceRatio > targetRatio) {
    const heightPercent = targetRatio / sourceRatio * 100;
    return { fit: "contain", widthPercent: 100, heightPercent, marginXPercent: 0, marginYPercent: (100 - heightPercent) / 2 };
  }
  const widthPercent = sourceRatio / targetRatio * 100;
  return { fit: "contain", widthPercent, heightPercent: 100, marginXPercent: (100 - widthPercent) / 2, marginYPercent: 0 };
}

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveHtml(inputPath, baseDir) {
  const absolute = path.resolve(baseDir, inputPath);
  const stat = await fsp.stat(absolute).catch(() => null);
  if (!stat) throw new Error(`HTML input does not exist: ${absolute}`);
  if (stat.isDirectory()) {
    const indexPath = path.join(absolute, "index.html");
    if (!(await pathExists(indexPath))) throw new Error(`Directory has no index.html: ${absolute}`);
    return indexPath;
  }
  if (path.extname(absolute).toLowerCase() !== ".html") {
    throw new Error(`Input is not an HTML file: ${absolute}`);
  }
  return absolute;
}

function findBrowserExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate));
}

async function waitForPageAssets(page, selector) {
  await page.evaluate(async rootSelector => {
    if (document.fonts?.ready) await document.fonts.ready;
    const root = document.querySelector(rootSelector);
    if (!root) throw new Error(`Slide root not found: ${rootSelector}`);
    const images = [...root.querySelectorAll("img")];
    await Promise.all(images.map(image => {
      if (image.complete) return Promise.resolve();
      return new Promise(resolve => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }));
  }, selector);
}

async function inspectHtml(browser, slide) {
  const page = await browser.newPage();
  const failedRequests = [];
  page.on("requestfailed", request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "failed" }));
  await page.setViewport({ width: slide.viewport?.width ?? 1920, height: slide.viewport?.height ?? 1080, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(slide.html).href, { waitUntil: "networkidle0" });
  await waitForPageAssets(page, slide.selector);
  const inspection = await page.evaluate(rootSelector => {
    const root = document.querySelector(rootSelector);
    const rect = root.getBoundingClientRect();
    const images = [...root.querySelectorAll("img")].map(image => ({
      src: image.currentSrc || image.src,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }));
    return {
      width: rect.width,
      height: rect.height,
      imageCount: images.length,
      brokenImages: images.filter(image => !image.complete || image.naturalWidth === 0),
      textLength: (root.innerText || "").trim().length,
    };
  }, slide.selector);
  await page.close();
  if (!(inspection.width > 0 && inspection.height > 0)) {
    throw new Error(`Slide root has invalid dimensions in ${slide.html}`);
  }
  return { ...inspection, failedRequests };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit", ...options });
    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout.on("data", chunk => { stdout += chunk; });
      child.stderr.on("data", chunk => { stderr += chunk; });
    }
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}${stderr ? `\n${stderr}` : ""}`));
    });
  });
}

async function validatePptx(pptxPath, expectedSlides) {
  const buffer = await fsp.readFile(pptxPath);
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const required = ["[Content_Types].xml", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"];
  const missingParts = required.filter(name => !zip.files[name]);
  const valid = missingParts.length === 0 && slideNames.length === expectedSlides;
  return { valid, slideCount: slideNames.length, expectedSlides, missingParts, byteCount: buffer.length };
}

async function loadConfiguration(cli) {
  let config = {};
  let baseDir = process.cwd();
  if (cli.config) {
    const configPath = path.resolve(cli.config);
    config = JSON.parse(await fsp.readFile(configPath, "utf8"));
    baseDir = path.dirname(configPath);
  }
  const rawSlides = cli.inputs.length ? cli.inputs.map(html => ({ html })) : (config.slides ?? []);
  if (!rawSlides.length) throw new Error("At least one HTML slide is required.");
  const defaultSelector = cli.selector ?? config.selector ?? ".screen";
  const slides = [];
  for (const item of rawSlides) {
    const entry = typeof item === "string" ? { html: item } : item;
    slides.push({
      html: await resolveHtml(entry.html, baseDir),
      selector: entry.selector ?? defaultSelector,
      viewport: entry.viewport,
    });
  }
  const outputRaw = cli.output ?? config.output;
  if (!outputRaw) throw new Error("--output or config.output is required.");
  const output = path.resolve(cli.output ? process.cwd() : baseDir, outputRaw);
  return {
    slides,
    output,
    render: cli.render ?? config.render ?? true,
    renderDir: path.resolve(cli.renderDir ? process.cwd() : baseDir, cli.renderDir ?? config.renderDir ?? `${output}.preview`),
    workDir: path.resolve(cli.workDir ? process.cwd() : baseDir, cli.workDir ?? config.workDir ?? path.join(toolDir, ".work", path.basename(output, ".pptx"))),
    keepWork: cli.keepWork ?? config.keepWork ?? false,
    overwrite: cli.overwrite ?? config.overwrite ?? false,
    aspect: normalizeAspect(cli.aspect ?? config.aspect ?? "html"),
    slideWidthIn: cli.slideWidthIn ?? config.slide?.widthIn,
    slideHeightIn: cli.slideHeightIn ?? config.slide?.heightIn,
  };
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }
  if (process.platform !== "win32") throw new Error("This wrapper currently requires Windows and Microsoft PowerPoint for merge and final rendering.");
  const config = await loadConfiguration(cli);
  if (path.extname(config.output).toLowerCase() !== ".pptx") throw new Error("Output must end in .pptx");
  if (await pathExists(config.output)) {
    if (!config.overwrite) throw new Error(`Output exists. Choose a new path or use --overwrite: ${config.output}`);
    await fsp.rm(config.output);
  }
  if (config.render && await pathExists(config.renderDir)) {
    if (!config.overwrite) throw new Error(`Render directory exists. Choose a new path or use --overwrite: ${config.renderDir}`);
    const resolvedRender = path.resolve(config.renderDir);
    const resolvedTool = path.resolve(toolDir);
    if (resolvedRender === resolvedTool || !resolvedRender.startsWith(`${resolvedTool}${path.sep}`) && !resolvedRender.startsWith(`${path.dirname(config.output)}${path.sep}`)) {
      throw new Error(`Refusing to remove render directory outside the tool/output scope: ${resolvedRender}`);
    }
    await fsp.rm(resolvedRender, { recursive: true });
  }
  await fsp.mkdir(config.workDir, { recursive: true });
  await fsp.mkdir(path.dirname(config.output), { recursive: true });

  const executablePath = findBrowserExecutable();
  const browser = await puppeteer.launch({ headless: true, executablePath, args: ["--allow-file-access-from-files"] });
  let inspections;
  try {
    inspections = [];
    for (const slide of config.slides) inspections.push(await inspectHtml(browser, slide));
  } finally {
    await browser.close();
  }

  const broken = inspections.flatMap((inspection, index) => inspection.brokenImages.map(image => ({ slide: index + 1, ...image })));
  const failed = inspections.flatMap((inspection, index) => inspection.failedRequests.map(request => ({ slide: index + 1, ...request })));
  if (broken.length || failed.length) {
    throw new Error(`HTML asset preflight failed. Broken images: ${broken.length}; failed requests: ${failed.length}`);
  }

  const slideSize = resolveSlideSize(config, inspections[0]);
  const { widthIn, heightIn } = slideSize;

  const exporter = path.join(toolDir, "node_modules", "dom-to-pptx", "bin", "cli-exporter.js");
  if (!(await pathExists(exporter))) throw new Error("Dependencies are missing. Run npm install in tools/html-to-pptx.");
  const perSlidePptx = [];
  for (let index = 0; index < config.slides.length; index++) {
    const slide = config.slides[index];
    const inspection = inspections[index];
    const slidePptx = path.join(config.workDir, `slide-${String(index + 1).padStart(3, "0")}.pptx`);
    perSlidePptx.push(slidePptx);
    await run(process.execPath, [
      exporter,
      slide.html,
      "--output", slidePptx,
      "--selector", slide.selector,
      "--inject",
      "--width", String(widthIn),
      "--height", String(heightIn),
      "--bw", String(Math.ceil(inspection.width)),
      "--bh", String(Math.ceil(inspection.height)),
    ]);
  }

  const mergeManifestPath = path.join(config.workDir, "merge-manifest.json");
  await fsp.writeFile(mergeManifestPath, JSON.stringify({
    inputPptx: perSlidePptx,
    outputPptx: config.output,
    render: config.render,
    renderDir: config.renderDir,
  }, null, 2));
  const mergeScript = path.join(toolDir, "scripts", "merge-and-render.ps1");
  const mergeResult = await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", mergeScript, "-ManifestPath", mergeManifestPath], { capture: true });
  const powerpoint = JSON.parse(mergeResult.stdout.trim().split(/\r?\n/).at(-1));
  const packageValidation = await validatePptx(config.output, config.slides.length);
  if (!packageValidation.valid) throw new Error(`PPTX package validation failed: ${JSON.stringify(packageValidation)}`);

  const reportPath = `${config.output}.report.json`;
  const report = {
    schemaVersion: "html-to-pptx-pipeline.v1",
    outputPptx: config.output,
    createdAt: new Date().toISOString(),
    tool: { domToPptx: "2.1.2", node: process.version, platform: process.platform },
    canvasMode: slideSize.mode,
    slideSizeIn: { width: widthIn, height: heightIn },
    htmlPreflight: config.slides.map((slide, index) => ({
      html: slide.html,
      selector: slide.selector,
      ...inspections[index],
      placement: computeContainPlacement(inspections[index], slideSize),
    })),
    packageValidation,
    powerpoint,
    visualReviewRequired: true,
  };
  await fsp.writeFile(reportPath, JSON.stringify(report, null, 2));

  if (!config.keepWork) {
    await fsp.rm(config.workDir, { recursive: true });
  }
  process.stdout.write(`${JSON.stringify({ outputPptx: config.output, reportPath, renderDir: config.render ? config.renderDir : null, slideCount: config.slides.length }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
