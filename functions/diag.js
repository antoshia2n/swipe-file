/**
 * GET /diag  — スワイプファイルアプリ 自己診断エンドポイント
 *
 * 要件定義 v1.4 §7「診断」／デバッグ鉄則（Naoki は URL を1つ開くだけ）準拠。
 * ブラウザで開くと HTML の一覧、`/diag?json=1` で生 JSON を返す。
 *
 * 検証対象：
 *   1. 環境変数（クライアント用9本 + サーバー用3本）
 *   2. Supabase 接続 + sw_swipes / sw_zeus_orphans の実在
 *   3. Zeus v2 外部API 疎通（合言葉と user_id を切り分けて判定）
 *   4. Claude API 疎通（claude.js プロキシと同じ経路・同じ鍵を検証）
 *
 * 注意：Pages Functions からの自己参照 fetch は行わない（Zeus 側で同じ構成が
 *       問題化し撤去済みのため）。プロキシ経由ではなく上流を直接叩いて検証する。
 */

const ZEUS_EXTERNAL_BASE = "https://zeus.shia2n.jp/api/external";
const CLAUDE_MODEL       = "claude-haiku-4-5-20251001";

const CLIENT_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_DATABASE_ID",
];

const SERVER_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ZEUS_EXTERNAL_SECRET",
  "ZEUS_USER_ID",
];

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

async function checkSupabaseTable(env, table, columns) {
  const name = `Supabase テーブル ${table}`;
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    return { name, status: "ng", detail: "Supabase の環境変数が未設定のため検証できません" };
  }
  // 要件 v1.5 で追加された列まで指定して取得し、列の取りこぼしも同時に検出する
  const url = `${env.VITE_SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${table}?select=${encodeURIComponent(columns)}&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey:        env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
      },
    });
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
      return { name, status: "ng", detail: "anon キーが不正、または RLS ポリシーが未作成です" };
    }
    return { name, status: "ng", detail: `${res.status} ${res.statusText} — ${text.slice(0, 160)}` };
  } catch (err) {
    return { name, status: "ng", detail: `接続できません：${err.message}` };
  }
}

async function checkRefCounter(env) {
  const name = "参照回数の加算関数 sw_increment_ref";
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    return { name, status: "ng", detail: "Supabase の環境変数が未設定のため検証できません" };
  }
  // 存在しないIDを渡すので、どのレコードも書き換わらない（安全な疎通確認）
  const url = `${env.VITE_SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/sw_increment_ref`;
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        apikey:         env.VITE_SUPABASE_ANON_KEY,
        Authorization:  `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_id: "00000000-0000-0000-0000-000000000000" }),
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

async function checkZeus(env) {
  const name = "Zeus v2 外部API 疎通";
  if (!env.ZEUS_EXTERNAL_SECRET) {
    return { name, status: "ng", detail: "ZEUS_EXTERNAL_SECRET が未設定です" };
  }
  const userId = env.ZEUS_USER_ID || "";
  const url    = `${ZEUS_EXTERNAL_BASE}/list-projects?user_id=${encodeURIComponent(userId)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.ZEUS_EXTERNAL_SECRET}` },
    });
    if (res.status === 401) {
      return { name, status: "ng", detail: "合言葉（ZEUS_EXTERNAL_SECRET）が Zeus 側と一致していません" };
    }
    if (res.status === 400) {
      return { name, status: "ng", detail: "合言葉は一致。ZEUS_USER_ID が未設定か不正です" };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { name, status: "ng", detail: `${res.status} ${res.statusText} — ${text.slice(0, 160)}` };
    }
    const data  = await res.json();
    const count = Array.isArray(data.items) ? data.items.length : 0;
    return { name, status: "ok", detail: `疎通成功（Zeus プロジェクト ${count} 件を取得）` };
  } catch (err) {
    return { name, status: "ng", detail: `接続できません：${err.message}` };
  }
}

async function checkClaude(env) {
  const name = "Claude API 疎通（claude.js プロキシと同経路）";
  if (!env.ANTHROPIC_API_KEY) {
    return { name, status: "ng", detail: "ANTHROPIC_API_KEY が未設定です" };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 8,
        messages:   [{ role: "user", content: "ping" }],
      }),
    });
    if (res.ok) {
      return { name, status: "ok", detail: `疎通成功（モデル ${CLAUDE_MODEL}）` };
    }
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
      return { name, status: "ng", detail: "ANTHROPIC_API_KEY が無効です" };
    }
    return { name, status: "ng", detail: `${res.status} ${res.statusText} — ${text.slice(0, 160)}` };
  } catch (err) {
    return { name, status: "ng", detail: `接続できません：${err.message}` };
  }
}

/* ── 出力 ───────────────────────────────────────────────────────────────── */

const LABEL = { ok: "OK", ng: "要対応" };
const COLOR = { ok: "#256E45", ng: "#B8302A" };

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
<title>スワイプファイル 診断</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Noto Sans JP','Hiragino Sans',sans-serif;background:#F0EEE7;color:#1C1B18;font-size:13px;padding:16px}
  .wrap{max-width:760px;margin:0 auto}
  h1{font-size:15px;font-weight:700;margin-bottom:4px}
  .sub{font-size:11px;color:#7A7769;margin-bottom:14px}
  .head{background:#FAFAF7;border:1px solid #E5E2D9;border-radius:10px;padding:14px 16px;margin-bottom:12px}
  .headline{font-size:14px;font-weight:700;color:${result.summary.ng === 0 ? "#256E45" : "#B8302A"}}
  table{width:100%;border-collapse:collapse;background:#FAFAF7;border:1px solid #E5E2D9;border-radius:10px;overflow:hidden}
  td{padding:9px 11px;border-bottom:1px solid #E5E2D9;vertical-align:top}
  tr:last-child td{border-bottom:none}
  .st{font-weight:700;white-space:nowrap;font-size:11px}
  .nm{font-weight:600;font-size:12px}
  .dt{color:#7A7769;font-size:11px}
  @media(max-width:520px){td{display:block;border-bottom:none;padding:3px 12px}tr{display:block;border-bottom:1px solid #E5E2D9;padding:8px 0}}
</style></head><body><div class="wrap">
<h1>スワイプファイル 診断</h1>
<div class="sub">${escapeHtml(result.checked_at)}</div>
<div class="head"><div class="headline">${headline}</div></div>
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

  const [swipes, orphans, refCounter, zeus, claude] = await Promise.all([
    checkSupabaseTable(env, "sw_swipes", "id,zeus_item_id,ref_count,last_referenced_at"),
    checkSupabaseTable(env, "sw_zeus_orphans", "id,zeus_item_id,source_url"),
    checkRefCounter(env),
    checkZeus(env),
    checkClaude(env),
  ]);

  const checks = [...checkEnv(env), swipes, orphans, refCounter, zeus, claude];
  const result = {
    app:        "swipe-file",
    checked_at: new Date().toISOString(),
    summary:    {
      total: checks.length,
      ok:    checks.filter(c => c.status === "ok").length,
      ng:    checks.filter(c => c.status === "ng").length,
    },
    checks,
  };

  const wantJson = new URL(request.url).searchParams.get("json") === "1";
  if (wantJson) {
    return new Response(JSON.stringify(result, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(renderHtml(result), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
