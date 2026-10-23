/**
 * GET /diag  — スワイプくん 自己診断（Naoki は URL を 1 つ開くだけ）
 * ブラウザで開くと HTML の一覧、`/diag?json=1` で生 JSON を返す。
 *
 * 検証対象：
 *   1. 環境変数（値は出さない。有無だけ）
 *   2. データの出入り口
 *   3. sw_swipes（スワイプくんの列まで）と sw_settings の実在（管理者キーで確認）
 *   4. 公開キーからの到達（表も置き場も、届かない・書けないのが正常）
 *
 * この画面はログインの外側にある。値そのものは一切表示しない。
 */

import { checkDbGateway } from "shia2n-core/server/db-gateway.js";

const CLIENT_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_DB_GATEWAY",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_DATABASE_ID",
];

const SERVER_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
];

/* ── 小物 ────────────────────────────────────────────────────────────────── */

function supabaseBase(env) {
  return (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
}

function adminHeaders(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, ...(/^eyJ/.test(String(key || "")) ? { Authorization: `Bearer ${key}` } : {}) };
}

/* ── 個別チェック ───────────────────────────────────────────────────────── */

function checkEnv(env) {
  const rows = [];
  for (const key of [...CLIENT_ENV_KEYS, ...SERVER_ENV_KEYS]) {
    const ok = typeof env[key] === "string" && env[key].length > 0;
    rows.push({
      name:   `環境変数 ${key}`,
      status: ok ? "ok" : "ng",
      detail: ok ? "設定済み" : "未設定。Cloudflare Pages → Settings → Environment variables に追加してください",
    });
  }
  return rows;
}

async function checkGateway(env) {
  const name   = "データの出入り口（サーバー経由の読み書き）";
  const result = await checkDbGateway(env);
  return { name, status: result.ok ? "ok" : "ng", detail: result.detail };
}

/** 表と列の実在を、管理者キーで確認する（公開キーを閉じた後もここは通る） */
async function checkTableAsAdmin(env, table, columns) {
  const name = `Supabase テーブル ${table}`;
  const base = supabaseBase(env);
  if (!base || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { name, status: "ng", detail: "Supabase の環境変数が未設定のため検証できません" };
  }
  const url = `${base}/rest/v1/${table}?select=${encodeURIComponent(columns)}&limit=1`;
  try {
    const res = await fetch(url, { headers: adminHeaders(env) });
    if (res.ok) {
      const rows = await res.json();
      return { name, status: "ok", detail: `接続成功・列も最新（サンプル取得 ${rows.length} 件）` };
    }
    const text = await res.text().catch(() => "");
    if (/column .* does not exist/i.test(text)) {
      return { name, status: "ng", detail: "テーブルはありますが列が古い版のままです。sql/02_create_tables.sql を再実行してください" };
    }
    if (res.status === 404 || /relation .* does not exist/i.test(text)) {
      return { name, status: "ng", detail: "テーブルが未作成です。sql/02_create_tables.sql を実行してください" };
    }
    if (res.status === 401 || res.status === 403) {
      return { name, status: "ng", detail: "SUPABASE_SERVICE_ROLE_KEY が不正です" };
    }
    return { name, status: "ng", detail: `${res.status} ${res.statusText} — ${text.slice(0, 160)}` };
  } catch (err) {
    return { name, status: "ng", detail: `接続できません：${err.message}` };
  }
}

/** 公開キーで表に届かないことを確認する（届かないのが正常） */
async function checkPublicKeyClosed(env, table) {
  const name = `公開キーからの到達 ${table}（届かないのが正常）`;
  const base = supabaseBase(env);
  if (!base || !env.VITE_SUPABASE_ANON_KEY) {
    return { name, status: "ng", detail: "Supabase の環境変数が未設定のため検証できません" };
  }
  const url = `${base}/rest/v1/${table}?select=*&limit=1`; // 表ごとに列が違うので * で聞く（sw_settings には id が無い）
  try {
    const res = await fetch(url, {
      headers: {
        apikey:        env.VITE_SUPABASE_ANON_KEY,
        ...(/^eyJ/.test(String(env.VITE_SUPABASE_ANON_KEY || "")) ? { Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` } : {}),
      },
    });
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return { name, status: "ok", detail: "公開キーでは届きません（想定どおり閉じています）" };
    }
    if (res.ok) {
      return {
        name,
        status: "ng",
        detail: "まだ公開キーで読めます。sql/07b_revoke_and_verify.sql を実行してください",
      };
    }
    const text = await res.text().catch(() => "");
    return { name, status: "ng", detail: `判定できません：${res.status} ${text.slice(0, 140)}` };
  } catch (err) {
    return { name, status: "ng", detail: `接続できません：${err.message}` };
  }
}

async function checkRefCounter(env) {
  const name = "参照回数の加算関数 sw_increment_ref";
  const base = supabaseBase(env);
  if (!base || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { name, status: "ng", detail: "Supabase の環境変数が未設定のため検証できません" };
  }
  // 存在しないIDを渡すので、どのレコードも書き換わらない（安全な疎通確認）
  const url = `${base}/rest/v1/rpc/sw_increment_ref`;
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { ...adminHeaders(env), "Content-Type": "application/json" },
      body:    JSON.stringify({ p_id: "00000000-0000-0000-0000-000000000000" }),
    });
    if (res.ok) {
      return { name, status: "ok", detail: "呼び出し可能（存在しないIDを渡したため何も書き換えていません）" };
    }
    const text = await res.text().catch(() => "");
    if (res.status === 404 || /could not find|does not exist/i.test(text)) {
      return { name, status: "ng", detail: "関数が未作成です。sql/02_create_tables.sql を実行してください" };
    }
    return { name, status: "ng", detail: `${res.status} ${res.statusText} — ${text.slice(0, 160)}` };
  } catch (err) {
    return { name, status: "ng", detail: `接続できません：${err.message}` };
  }
}

async function checkStorageClosed(env) {
  const name = "ファイルの置き場 swipe-files に公開キーで書けない（書けないのが正常）";
  const base = supabaseBase(env);
  if (!base || !env.VITE_SUPABASE_ANON_KEY) {
    return { name, status: "ng", detail: "Supabase の環境変数が未設定のため検証できません" };
  }
  const path = `_diag/probe-${Date.now()}.txt`;
  const anon = {
    apikey: env.VITE_SUPABASE_ANON_KEY,
    ...(/^eyJ/.test(String(env.VITE_SUPABASE_ANON_KEY || "")) ? { Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` } : {}),
  };
  try {
    const put = await fetch(`${base}/storage/v1/object/swipe-files/${path}`, {
      method: "POST", headers: { ...anon, "Content-Type": "text/plain" }, body: "diag",
    });
    if (put.ok) {
      // 書けてしまった：残骸を消してから知らせる
      await fetch(`${base}/storage/v1/object/swipe-files/${path}`, { method: "DELETE", headers: adminHeaders(env) }).catch(() => {});
      return { name, status: "ng", detail: "公開キーで書き込めました。作業 25 の手順 5（決まりを外す）が済んでいません" };
    }
    return { name, status: "ok", detail: `公開キーの書き込みは断られた（${put.status}）` };
  } catch (err) {
    return { name, status: "ng", detail: `接続できません：${err.message}` };
  }
}

/* ── 出力 ───────────────────────────────────────────────────────────────── */

const LABEL = { ok: "OK", ng: "要対応", skip: "未実行" };
const COLOR = { ok: "#256E45", ng: "#B8302A", skip: "#7A7769" };

function renderHtml(result) {
  const rows = result.checks.map(c => `
    <tr>
      <td class="st" style="color:${COLOR[c.status]}">${LABEL[c.status]}</td>
      <td class="nm">${escapeHtml(c.name)}</td>
      <td class="dt">${escapeHtml(c.detail)}</td>
    </tr>`).join("");

  const headline = result.summary.ng === 0
    ? `全 ${result.summary.total} 項目が OK です`
    : `${result.summary.ng} 項目が要対応です（全 ${result.summary.total} 項目）`;

  return `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>スワイプくん 診断</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Noto Sans JP','Hiragino Sans',sans-serif;background:#F0EEE7;color:#1C1B18;font-size:13px;padding:16px}
  .wrap{max-width:760px;margin:0 auto}
  h1{font-size:15px;font-weight:700;margin-bottom:4px}
  .sub{font-size:11px;color:#7A7769;margin-bottom:14px}
  .head{background:#FAFAF7;border:1px solid #E5E2D9;border-radius:10px;padding:14px 16px;margin-bottom:12px}
  .headline{font-size:14px;font-weight:700;color:${result.summary.ng === 0 ? "#256E45" : "#B8302A"}}
  .note{font-size:11px;color:#7A7769;margin-top:6px}
  table{width:100%;border-collapse:collapse;background:#FAFAF7;border:1px solid #E5E2D9;border-radius:10px;overflow:hidden}
  td{padding:9px 11px;border-bottom:1px solid #E5E2D9;vertical-align:top}
  tr:last-child td{border-bottom:none}
  .st{font-weight:700;white-space:nowrap;font-size:11px}
  .nm{font-weight:600;font-size:12px}
  .dt{color:#7A7769;font-size:11px}
  @media(max-width:520px){td{display:block;border-bottom:none;padding:3px 12px}tr{display:block;border-bottom:1px solid #E5E2D9;padding:8px 0}}
</style></head><body><div class="wrap">
<h1>スワイプくん 診断</h1>
<div class="sub">${escapeHtml(result.checked_at)}</div>
<div class="head">
  <div class="headline">${headline}</div>
</div>
<table>${rows}</table>
</div></body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

/* ── エントリポイント ───────────────────────────────────────────────────── */

export async function onRequestGet(context) {
  const { request, env } = context;
  const params   = new URL(request.url).searchParams;

  const [gateway, swipes, settings, refCounter, closedSwipes, closedSettings, storageClosed] = await Promise.all([
    checkGateway(env),
    checkTableAsAdmin(env, "sw_swipes", "id,table_id,shu,refs,grade,genres,labels,an_hypo,an_idea,ai_ask,ref_count"),
    checkTableAsAdmin(env, "sw_settings", "user_id,data"),
    checkRefCounter(env),
    checkPublicKeyClosed(env, "sw_swipes"),
    checkPublicKeyClosed(env, "sw_settings"),
    checkStorageClosed(env),
  ]);

  const checks = [
    ...checkEnv(env),
    gateway,
    swipes,
    settings,
    refCounter,
    closedSwipes,
    closedSettings,
    storageClosed,
  ];

  const result = {
    app:        "swipe-file",
    checked_at: new Date().toISOString(),
    summary:    {
      total: checks.length,
      ok:    checks.filter(c => c.status === "ok").length,
      ng:    checks.filter(c => c.status === "ng").length,
      skip:  checks.filter(c => c.status === "skip").length,
    },
    checks,
  };

  if (params.get("json") === "1") {
    return new Response(JSON.stringify(result, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(renderHtml(result), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
