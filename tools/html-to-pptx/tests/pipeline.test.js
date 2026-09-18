import test from "node:test";
import assert from "node:assert/strict";

import {
  computeContainPlacement,
  normalizeAspect,
  parseArgs,
  resolveSlideSize
} from "../bin/html-to-pptx.mjs";

test("parseArgs collects repeatable inputs and every documented option", () => {
  const parsed = parseArgs([
    "--input", "a/index.html",
    "--input", "b/index.html",
    "--output", "deck.pptx",
    "--selector", ".slide-root",
    "--aspect", "4:3",
    "--slide-width", "10",
    "--no-render",
    "--keep-work",
    "--overwrite"
  ]);
  assert.deepEqual(parsed.inputs, ["a/index.html", "b/index.html"]);
  assert.equal(parsed.output, "deck.pptx");
  assert.equal(parsed.selector, ".slide-root");
  assert.equal(parsed.aspect, "4:3");
  assert.equal(parsed.slideWidthIn, 10);
  assert.equal(parsed.render, false);
  assert.equal(parsed.keepWork, true);
  assert.equal(parsed.overwrite, true);
});

test("parseArgs treats bare paths as inputs and rejects unknown flags", () => {
  assert.deepEqual(parseArgs(["slides/one"]).inputs, ["slides/one"]);
  assert.throws(() => parseArgs(["--nope"]), /Unknown option/);
  assert.throws(() => parseArgs(["--output"]), /Missing value/);
});

test("normalizeAspect maps aliases and rejects unsupported modes", () => {
  assert.equal(normalizeAspect(undefined), "html");
  assert.equal(normalizeAspect("wide"), "16:9");
  assert.equal(normalizeAspect("16x9"), "16:9");
  assert.equal(normalizeAspect("standard"), "4:3");
  assert.equal(normalizeAspect("portrait"), "3:4");
  assert.equal(normalizeAspect("16：9"), "16:9");
  assert.throws(() => normalizeAspect("21:9"), /Unsupported aspect mode/);
});

test("resolveSlideSize covers every fixed mode and the html-derived mode", () => {
  const inspection = { width: 1920, height: 1080 };
  assert.deepEqual(resolveSlideSize({ aspect: "16:9" }, inspection), { widthIn: 13.333333, heightIn: 7.5, mode: "16:9" });
  assert.deepEqual(resolveSlideSize({ aspect: "4:3" }, inspection), { widthIn: 10, heightIn: 7.5, mode: "4:3" });
  assert.deepEqual(resolveSlideSize({ aspect: "3:4" }, inspection), { widthIn: 7.5, heightIn: 10, mode: "3:4" });

  // html mode keeps the source ratio on a 13.333in-wide page.
  const derived = resolveSlideSize({ aspect: "html" }, { width: 1748, height: 900 });
  assert.equal(derived.mode, "html");
  assert.equal(derived.widthIn, 13.333333);
  assert.ok(Math.abs((derived.widthIn / derived.heightIn) - (1748 / 900)) < 0.001);
});

test("resolveSlideSize supports custom sizes and refuses to mix them with aspect", () => {
  const inspection = { width: 1600, height: 900 };
  const widthOnly = resolveSlideSize({ aspect: "html", slideWidthIn: 10 }, inspection);
  assert.equal(widthOnly.mode, "custom");
  assert.equal(widthOnly.widthIn, 10);
  assert.ok(Math.abs(widthOnly.heightIn - (10 / (1600 / 900))) < 0.001);

  const heightOnly = resolveSlideSize({ aspect: "html", slideHeightIn: 5 }, inspection);
  assert.ok(Math.abs(heightOnly.widthIn - (5 * (1600 / 900))) < 0.001);
  assert.equal(heightOnly.heightIn, 5);

  assert.throws(
    () => resolveSlideSize({ aspect: "16:9", slideWidthIn: 10 }, inspection),
    /not both/
  );
});

test("computeContainPlacement never crops or stretches", () => {
  const slide16x9 = { widthIn: 13.333333, heightIn: 7.5 };

  // Wider than the page: full width, letterboxed vertically.
  const wide = computeContainPlacement({ width: 3040, height: 1472 }, slide16x9);
  assert.equal(wide.fit, "contain");
  assert.equal(wide.widthPercent, 100);
  assert.ok(wide.heightPercent < 100);
  assert.equal(wide.marginXPercent, 0);
  assert.ok(wide.marginYPercent > 0);
  assert.ok(Math.abs(wide.heightPercent + wide.marginYPercent * 2 - 100) < 0.001);

  // Taller than the page: full height, pillarboxed horizontally.
  const tall = computeContainPlacement({ width: 900, height: 1600 }, slide16x9);
  assert.equal(tall.heightPercent, 100);
  assert.ok(tall.widthPercent < 100);
  assert.equal(tall.marginYPercent, 0);
  assert.ok(tall.marginXPercent > 0);
  assert.ok(Math.abs(tall.widthPercent + tall.marginXPercent * 2 - 100) < 0.001);

  // Exactly the page ratio fills it completely. Tolerance is needed because the
  // 16:9 page constant 13.333333in is not exactly 16/9, so the ratios differ in
  // the 7th decimal and the contain branch lands microscopically under 100%.
  const exact = computeContainPlacement({ width: 1920, height: 1080 }, slide16x9);
  assert.ok(Math.abs(exact.widthPercent - 100) < 0.001);
  assert.ok(Math.abs(exact.heightPercent - 100) < 0.001);
  assert.ok(exact.marginXPercent < 0.001);
  assert.ok(exact.marginYPercent < 0.001);
});
