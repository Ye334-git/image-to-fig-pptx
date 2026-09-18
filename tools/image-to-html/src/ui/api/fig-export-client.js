// Both export kinds are supported: "slice" rebuilds the canvas slices as a flat
// Figma frame (locked background reference + one node per asset), "editable"
// rebuilds the captured AI layer document with its semantic groups.
const FIG_EXPORT_KINDS = new Set(["slice", "editable"]);

async function requestFigExport({ kind, manifest }, dependencies = {}) {
  const fetchBackendImpl = dependencies.fetchBackend;
  if (typeof fetchBackendImpl !== "function") {
    throw new Error("缺少 .fig 导出请求客户端");
  }
  if (!FIG_EXPORT_KINDS.has(kind)) {
    throw new Error(`不支持的 .fig 导出类型：${kind || "empty"}`);
  }
  const response = await fetchBackendImpl("/api/v1/exports/fig", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, manifest })
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error || `.fig 导出失败：${response.status}`);
  }
  return {
    blob: await response.blob(),
    filename: readAttachmentFilename(response.headers.get("content-disposition"))
      || `${kind === "editable" ? "editable-design" : "image-slices"}.fig`
  };
}

function readAttachmentFilename(value) {
  const source = String(value || "");
  const utf8Match = source.match(/filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ""));
    } catch (_) {}
  }
  const match = source.match(/filename="([^"]+)"/i);
  return match?.[1] || "";
}

if (typeof module !== "undefined") {
  module.exports = {
    readAttachmentFilename,
    requestFigExport
  };
}
