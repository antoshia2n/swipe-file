/**
 * POST /api/storage/remove — 消したスワイプのファイル（スクショ・PDF）を置き場からも消す
 *
 * 受け取る：{ urls: ["https://…/storage/v1/object/public/swipe-files/shots/…", …] }（最大 10）
 * 消せるのは入れ物 swipe-files の shots/ の下だけ。使える人はアップロードと同じ（SWIPE_ALLOW_UID か Naoki）。
 * まだどれかのスワイプが使っているファイル（同じ住所を画像やファイルに持つ行がある）は消さずに残す。
 */
import { verifyIdToken } from "shia2n-core/server/db-gateway.js";

const NAOKI_UID = "VrMwzeSceqWeXVQOrm8kpu4uVR33";
const BUCKET = "swipe-files";
const PREFIX = "shots/";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

export async function onRequestPost({ request, env }) {
  const base = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const projectId = env.FIREBASE_PROJECT_ID ?? env.VITE_FIREBASE_PROJECT_ID ?? "";
  if (!base || !key || !projectId) return json(500, { ok: false, message: "置き場の出入り口の設定が足りません。" });
  const admin = { apikey: key, ...(/^eyJ/.test(key) ? { Authorization: `Bearer ${key}` } : {}) };

  let uid;
  try {
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(401, { ok: false, message: "ログインが必要です。" });
    uid = await verifyIdToken(token, projectId);
  } catch { return json(401, { ok: false, message: "ログインを確認できませんでした。" }); }
  const allow = (env.SWIPE_ALLOW_UID ?? NAOKI_UID).split(",").map(s => s.trim()).filter(Boolean);
  if (!allow.includes(uid)) return json(403, { ok: false, message: "この利用者にはファイルを消す許可がありません。" });

  const body = await request.json().catch(() => ({}));
  const head = `${base}/storage/v1/object/public/${BUCKET}/`;
  const pairs = (Array.isArray(body.urls) ? body.urls : []).slice(0, 10)
    .filter(u => typeof u === "string" && u.startsWith(head + PREFIX))
    .map(u => ({ u, p: decodeURIComponent(u.slice(head.length).split("?")[0]) }))
    .filter(x => /^shots\/[A-Za-z0-9_.-]+$/.test(x.p));
  if (!pairs.length) return json(200, { ok: true, removed: [], kept: [] });

  // まだ使っている行があるファイルは消さない
  const kept = [], target = [];
  for (const { u, p } of pairs) {
    const v = encodeURIComponent(`"${u}"`); // 住所の : / . を値として読ませるため " で囲む
    const q = `or=(file_url.eq.${v},screenshot_url.eq.${v},props->>shot.eq.${v})`;
    const r = await fetch(`${base}/rest/v1/sw_swipes?select=id&limit=1&${q}`, { headers: admin });
    const rows = r.ok ? await r.json() : [{ id: "?" }]; // 確かめられないときは消さない
    (rows.length ? kept : target).push(rows.length ? u : p);
  }
  if (!target.length) return json(200, { ok: true, removed: [], kept });

  const res = await fetch(`${base}/storage/v1/object/${BUCKET}`, {
    method: "DELETE", headers: { ...admin, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: target }),
  });
  if (!res.ok) return json(502, { ok: false, message: "置き場がファイルの削除を受け付けませんでした。", detail: (await res.text().catch(() => "")).slice(0, 200) });
  return json(200, { ok: true, removed: target, kept });
}
