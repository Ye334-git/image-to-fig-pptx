const test = require("node:test");
const assert = require("node:assert/strict");

const { requestFigExport } = require("../src/ui/api/fig-export-client");

function collectingFetch(calls, response = {}) {
  return async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      blob: async () => "blob",
      json: async () => response.json ?? {},
      headers: { get: () => response.contentDisposition ?? null }
    };
  };
}

test("requestFigExport forwards both slice and editable kinds to the versioned endpoint", async () => {
  const calls = [];
  const fetchBackend = collectingFetch(calls);

  const slice = await requestFigExport({ kind: "slice", manifest: { a: 1 } }, { fetchBackend });
  const editable = await requestFigExport({ kind: "editable", manifest: { b: 2 } }, { fetchBackend });

  assert.deepEqual(calls.map((call) => call.url), ["/api/v1/exports/fig", "/api/v1/exports/fig"]);
  assert.deepEqual(calls.map((call) => call.method), ["POST", "POST"]);
  assert.deepEqual(calls[0].body, { kind: "slice", manifest: { a: 1 } });
  assert.deepEqual(calls[1].body, { kind: "editable", manifest: { b: 2 } });
  assert.equal(slice.filename, "image-slices.fig");
  assert.equal(editable.filename, "editable-design.fig");
});

test("requestFigExport prefers the server-provided filename", async () => {
  const calls = [];
  const fetchBackend = collectingFetch(calls, {
    contentDisposition: "attachment; filename=\"fallback.fig\"; filename*=UTF-8''%E5%88%87%E5%9B%BE.fig"
  });
  const result = await requestFigExport({ kind: "slice", manifest: {} }, { fetchBackend });
  assert.equal(result.filename, "切图.fig");
});

test("requestFigExport rejects unsupported kinds before issuing any request", async () => {
  let called = false;
  const fetchBackend = async () => { called = true; };
  await assert.rejects(() => requestFigExport({ kind: "slice2" }, { fetchBackend }), /不支持的 \.fig 导出类型/);
  await assert.rejects(() => requestFigExport({}, { fetchBackend }), /不支持的 \.fig 导出类型/);
  assert.equal(called, false);
});

test("requestFigExport surfaces server errors and requires a client", async () => {
  const fetchBackend = collectingFetch([], { ok: false, status: 400, json: { error: "切图 manifest 非法" } });
  await assert.rejects(
    () => requestFigExport({ kind: "slice", manifest: {} }, { fetchBackend }),
    /切图 manifest 非法/
  );
  await assert.rejects(() => requestFigExport({ kind: "slice" }, {}), /缺少 \.fig 导出请求客户端/);
});
