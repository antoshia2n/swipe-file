import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as listWs } from "../functions/api/workspaces.js";
import { onRequestGet as sharePage } from "../functions/s/[token].js";

const env = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "service", FIREBASE_PROJECT_ID: "p" };

test("場所の一覧：ログインの札が無ければ 401", async () => {
  const res = await listWs({ request: new Request("https://swipe.test/api/workspaces"), env });
  assert.equal(res.status, 401);
});

test("共有ページ：Naoki が持ち主の場所で作った共有も探す", async () => {
  const seen = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async url => {
    seen.push(String(url));
    if (String(url).includes("/ws_members")) return Response.json([{ workspace_id: "ws_" + "a".repeat(32) }, { workspace_id: "bad" }]);
    return Response.json([]);
  };
  try {
    const res = await sharePage({ params: { token: "abcdefgh12" }, env, waitUntil() {} });
    assert.equal(res.status, 404);
  } finally { globalThis.fetch = orig; }
  const q = decodeURIComponent(seen.find(u => u.includes("/sw_shares")) || "");
  assert.match(q, /user_id=in\.\(VrMwzeSceqWeXVQOrm8kpu4uVR33,ws_a{32}\)/);
  assert.doesNotMatch(q, /bad/);
});

test("共有ページ：場所の一覧が読めなくても Naoki 本人の共有は探す", async () => {
  const seen = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async url => {
    seen.push(String(url));
    if (String(url).includes("/ws_members")) return new Response("x", { status: 500 });
    return Response.json([]);
  };
  try {
    const res = await sharePage({ params: { token: "abcdefgh12" }, env, waitUntil() {} });
    assert.equal(res.status, 404);
  } finally { globalThis.fetch = orig; }
  const q = decodeURIComponent(seen.find(u => u.includes("/sw_shares")) || "");
  assert.match(q, /user_id=in\.\(VrMwzeSceqWeXVQOrm8kpu4uVR33\)/);
});
