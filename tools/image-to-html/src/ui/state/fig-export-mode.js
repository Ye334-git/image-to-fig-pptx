function getFigExportUiMode(embedded) {
  if (embedded) {
    return {
      sliceLabel: "切图导入",
      editableLabel: "导入到 Figma",
      editableTitle: "把当前预览捕获为 Figma 可编辑图层",
      downloadsFig: false
    };
  }
  return {
    sliceLabel: "导出切图 .fig",
    editableLabel: "导出可编辑 .fig",
    editableTitle: "捕获当前预览并导出可手动导入 Figma 的 .fig 文件",
    downloadsFig: true
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    getFigExportUiMode
  };
}

