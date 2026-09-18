function getSvgRecommendation(asset = {}) {
  const kind = String(asset.kind || "").trim().toLowerCase();
  const containsText = asset.containsEmbeddedText === true;
  if (containsText || ["complex-chart", "chart", "flowchart", "diagram", "process", "workflow"].includes(kind)) {
    return {
      strategy: "keep-raster-or-html",
      label: "建议保留 PNG / HTML 重建",
      tone: "warning",
      reason: "文字、连线和拓扑无法通过普通描摹可靠还原为可编辑内容；转换结果需人工核对。"
    };
  }
  if (["icon", "logo", "decoration", "simple-decoration", "shape"].includes(kind)) {
    return {
      strategy: "local-trace",
      label: "建议本地描摹 SVG",
      tone: "positive",
      reason: "无内嵌文字的简单轮廓通常适合 VTracer，并在失败时回退到 ImageTracer。"
    };
  }
  if (["illustration", "complex-illustration", "hero", "character"].includes(kind)) {
    return {
      strategy: "ai-redraw",
      label: "可尝试 AI SVG",
      tone: "warning",
      reason: "复杂插画可尝试 AI 重绘，但造型、颜色与细节可能失真，采用前必须预览。"
    };
  }
  return {
    strategy: "review",
    label: "SVG 需人工判断",
    tone: "neutral",
    reason: "系统不会自动替换原 PNG；请根据轮廓复杂度和文字情况选择本地描摹或 AI 重绘。"
  };
}

function shouldWarnBeforeSvgAction(asset, action) {
  const recommendation = getSvgRecommendation(asset);
  if (recommendation.strategy === "keep-raster-or-html") return recommendation.reason;
  if (action === "local" && recommendation.strategy === "ai-redraw") return recommendation.reason;
  if (action === "ai" && recommendation.strategy === "local-trace") {
    return "该资产更适合本地描摹；AI 重绘可能改变原始轮廓。";
  }
  return "";
}

if (typeof module !== "undefined") {
  module.exports = { getSvgRecommendation, shouldWarnBeforeSvgAction };
}
