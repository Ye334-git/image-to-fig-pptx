const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSvgRecommendation,
  shouldWarnBeforeSvgAction
} = require("../src/ui/services/svg-recommendation");

test("simple icons without text recommend local tracing", () => {
  assert.equal(getSvgRecommendation({ kind: "icon" }).strategy, "local-trace");
});

test("flowcharts and embedded text never claim safe automatic SVG conversion", () => {
  for (const asset of [
    { kind: "flowchart" },
    { kind: "complex-chart" },
    { kind: "icon", containsEmbeddedText: true }
  ]) {
    const recommendation = getSvgRecommendation(asset);
    assert.equal(recommendation.strategy, "keep-raster-or-html");
    assert.match(shouldWarnBeforeSvgAction(asset, "local"), /文字|连线|拓扑/);
  }
});

test("complex illustrations recommend AI redraw with an accuracy warning", () => {
  const recommendation = getSvgRecommendation({ kind: "illustration" });
  assert.equal(recommendation.strategy, "ai-redraw");
  assert.match(recommendation.reason, /失真/);
});
