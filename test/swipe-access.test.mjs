import test from "node:test";
import assert from "node:assert/strict";
import { canUseSwipe } from "../functions/_lib/swipe-access.js";

const env = { FIREBASE_PROJECT_ID: "test-project" };
const request = () => new Request("https://x.test/api/db/xa_obs", {
  headers: { Authorization: "Bearer test-token" },
});
const options = uid => ({
  request: request(), env, allowUids: [],
  verify: async (token, projectId) => {
    assert.equal(token, "test-token");
    assert.equal(projectId, "test-project");
    return uid;
  },
  fetchFn: async () => { throw new Error("unexpected fetch"); },
});

test("札なし → no_token", async () => {
  let calls = 0;
  const result = await canUseSwipe({
    ...options("missing"),
    request: new Request("https://x.test/api/db/xa_obs"),
    verify: async () => { calls++; throw new Error("unexpected verify"); },
    fetchFn: async () => { calls++; throw new Error("unexpected fetch"); },
  });
  assert.equal(result, "no_token");
  assert.equal(calls, 0);
});

test("札が偽 → denied", async () => {
  let calls = 0;
  assert.equal(await canUseSwipe({
    ...options("invalid"),
    verify: async () => { throw new Error("bad token"); },
    fetchFn: async () => { calls++; return Response.json({ ok: true, apps: ["swipe-file"] }); },
  }), "denied");
  assert.equal(calls, 0);
});

test("一覧にある人 → allowed・窓口 0 回", async () => {
  let calls = 0;
  assert.equal(await canUseSwipe({
    ...options("listed"), allowUids: ["listed"],
    fetchFn: async () => { calls++; throw new Error("unexpected fetch"); },
  }), "allowed");
  assert.equal(calls, 0);
});

test("窓口が swipe-file を返す人 → allowed", async () => {
  let calls = 0;
  assert.equal(await canUseSwipe({
    ...options("granted"),
    fetchFn: async (url, init) => {
      calls++;
      assert.equal(url, "https://shia2n-mcp.gameister1.workers.dev/gate/resolve");
      assert.deepEqual(init, { method: "POST", headers: { Authorization: "Bearer test-token" } });
      return Response.json({ ok: true, apps: ["swipe-file"] });
    },
  }), "allowed");
  assert.equal(calls, 1);
});

test("窓口が別の名前だけ返す人 → denied", async () => {
  assert.equal(await canUseSwipe({
    ...options("other"), fetchFn: async () => Response.json({ ok: true, apps: ["mindmap"] }),
  }), "denied");
});

test("窓口が失敗 → denied", async () => {
  for (const [uid, fetchFn] of [
    ["network", async () => { throw new Error("network"); }],
    ["http", async () => new Response("failure", { status: 500 })],
    ["json", async () => new Response("not JSON")],
  ]) assert.equal(await canUseSwipe({ ...options(uid), fetchFn }), "denied");
});

test("同じ人は 60 秒内なら窓口 1 回・60 秒後は取り直す", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 100000 });
  let calls = 0, verifies = 0;
  const opts = {
    ...options("cached"),
    verify: async () => { verifies++; return "cached"; },
    fetchFn: async () => {
      calls++;
      return Response.json({ ok: true, apps: calls === 1 ? ["swipe-file"] : [] });
    },
  };
  assert.equal(await canUseSwipe(opts), "allowed");
  t.mock.timers.tick(59999);
  assert.equal(await canUseSwipe(opts), "allowed");
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  assert.equal(await canUseSwipe(opts), "denied");
  assert.equal(calls, 2);
  assert.equal(verifies, 3);
});
