/**
 * POST /api/zeus-sync — スワイプを Zeus v2 の索引へ登録する
 *
 * 要件 v1.7 §F5。判断規則をこの1ファイルに集約し、画面側には持たせない。
 *
 *   body { id: "<スワイプID>" }  … 1件だけ同期する（登録直後に呼ぶ）
 *   body { retry: true }        … 未同期のものをまとめて同期する（起動時・日次）
 *
 * リトライ規則（要件 §F5 の表そのまま）
 *   zeus_item_id 空  / synced false → push する
 *   zeus_item_id あり / synced false → push しない。フラグだけ直す（二重登録防止）
 *   zeus_item_id あり / synced true  → 何もしない
 *
 * push に失敗しても 200 を返す。登録そのものを失敗させないため（§F5）。
 */

const ZEUS_PUSH_URL   = "https://zeus.shia2n.jp/api/external/push-to-zeus";
const JSON_HEADERS    = { "Content-Type": "application/json; charset=utf-8" };
const RETRY_BATCH_MAX = 20;

// 2026-07-30 決定により、公開キーでは表に届かなくなった。
// ここはサーバー側の処理なので、管理者キー（Cloudflare の設定にのみ存在）を使う。
function sb(env, path, init = {}) {
  const base = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key  = env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey:         key,
      Authorization:  `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** 1件を Zeus へ登録し、結果を sw_swipes へ書き戻す */
async function syncOne(env, origin, swipe) {
  // すでに索引IDがある＝ push 済み。フラグだけ直して終わり（二重登録防止）
  if (swipe.zeus_item_id) {
    if (!swipe.zeus_synced) {
      await sb(env, `sw_swipes?id=eq.${swipe.id}`, {
        method: "PATCH",
        body:   JSON.stringify({ zeus_synced: true }),
      });
    }
    return { id: swipe.id, status: "already_pushed" };
  }

  // 索引3点（要件 §F5）：要約1行＝reason ／ タグ ／ 正本リンク＝詳細URL
  const detailUrl = `${origin}/?id=${swipe.id}`;
  const content   = [
    swipe.reason,
    (swipe.topic_tags ?? []).length ? `タグ：${(swipe.topic_tags ?? []).join(" / ")}` : null,
    `スワイプファイルで開く：${detailUrl}`,
  ].filter(Boolean).join("\n");

  let res;
  try {
    res = await fetch(ZEUS_PUSH_URL, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${env.ZEUS_EXTERNAL_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id:    env.ZEUS_USER_ID,
        source_app: "swipe-file",
        title:      swipe.title || swipe.reason,
        content,
        source_url: detailUrl,
      }),
    });
  } catch (err) {
    return { id: swipe.id, status: "failed", reason: err.message };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { id: swipe.id, status: "failed", reason: `${res.status} ${text.slice(0, 120)}` };
  }

  const data   = await res.json().catch(() => ({}));
  const itemId = data.item_id;
  if (!itemId) {
    return { id: swipe.id, status: "failed", reason: "Zeus から索引IDが返りませんでした" };
  }

  // 索引IDを先に保存してからフラグを立てる（途中で落ちても二重登録にならない順序）
  await sb(env, `sw_swipes?id=eq.${swipe.id}`, {
    method: "PATCH",
    body:   JSON.stringify({ zeus_item_id: itemId, zeus_synced: true }),
  });

  return { id: swipe.id, status: "pushed", zeus_item_id: itemId };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ZEUS_EXTERNAL_SECRET || !env.ZEUS_USER_ID) {
    return new Response(
      JSON.stringify({ ok: false, reason: "Zeus の設定が未完了です（/diag で確認してください）" }),
      { headers: JSON_HEADERS }
    );
  }
  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: "invalid json" }), { status: 400, headers: JSON_HEADERS });
  }

  const origin = new URL(request.url).origin;

  try {
    let query;
    if (payload.retry) {
      query = `sw_swipes?zeus_synced=eq.false&select=*&order=created_at.asc&limit=${RETRY_BATCH_MAX}`;
    } else if (payload.id) {
      query = `sw_swipes?id=eq.${encodeURIComponent(payload.id)}&select=*`;
    } else {
      return new Response(JSON.stringify({ ok: false, reason: "id または retry が必要です" }), { status: 400, headers: JSON_HEADERS });
    }

    const listRes = await sb(env, query);
    if (!listRes.ok) {
      const text = await listRes.text().catch(() => "");
      return new Response(JSON.stringify({ ok: false, reason: `Supabase: ${listRes.status} ${text.slice(0, 120)}` }), { headers: JSON_HEADERS });
    }

    const rows    = await listRes.json();
    const results = [];
    for (const row of rows) {
      results.push(await syncOne(env, origin, row));
    }

    return new Response(
      JSON.stringify({
        ok:      true,
        target:  rows.length,
        pushed:  results.filter(r => r.status === "pushed").length,
        failed:  results.filter(r => r.status === "failed").length,
        results,
      }),
      { headers: JSON_HEADERS }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, reason: err.message }), { headers: JSON_HEADERS });
  }
}

/**
 * GET /api/zeus-sync — ブラウザで開くだけで状況が分かる手動同期。
 * 未同期のスワイプをまとめて送り直し、何件送れて何件失敗したかを表示する。
 * 失敗している場合はその理由もそのまま出す（原因を探させないため）。
 */
export async function onRequestGet(context) {
  const { request, env } = context;

  const setup = {
    ZEUS_EXTERNAL_SECRET: !!env.ZEUS_EXTERNAL_SECRET,
    ZEUS_USER_ID:         !!env.ZEUS_USER_ID,
    SUPABASE:             !!(env.SUPABASE_URL ?? env.VITE_SUPABASE_URL) && !!env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (!setup.ZEUS_EXTERNAL_SECRET || !setup.ZEUS_USER_ID || !setup.SUPABASE) {
    return new Response(
      JSON.stringify({ ok: false, 設定: setup, 次にやること: "不足している環境変数を Cloudflare Pages に追加して Retry deployment" }, null, 2),
      { headers: JSON_HEADERS }
    );
  }

  const origin = new URL(request.url).origin;

  try {
    const [pendingRes, totalRes] = await Promise.all([
      sb(env, `sw_swipes?zeus_synced=eq.false&select=*&order=created_at.asc&limit=${RETRY_BATCH_MAX}`),
      sb(env, "sw_swipes?select=id"),
    ]);

    if (!pendingRes.ok) {
      const text = await pendingRes.text().catch(() => "");
      return new Response(JSON.stringify({ ok: false, reason: `Supabase: ${pendingRes.status} ${text.slice(0, 200)}` }, null, 2), { headers: JSON_HEADERS });
    }

    const pending = await pendingRes.json();
    const total   = totalRes.ok ? (await totalRes.json()).length : null;

    const results = [];
    for (const row of pending) {
      results.push(await syncOne(env, origin, row));
    }

    const failed = results.filter(r => r.status === "failed");

    return new Response(
      JSON.stringify(
        {
          ok:          failed.length === 0,
          スワイプ総数: total,
          未同期だった数: pending.length,
          今回送れた数: results.filter(r => r.status === "pushed").length,
          失敗した数:   failed.length,
          失敗の理由:   failed.map(f => f.reason),
          詳細:        results,
        },
        null,
        2
      ),
      { headers: JSON_HEADERS }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, reason: err.message }, null, 2), { headers: JSON_HEADERS });
  }
}
