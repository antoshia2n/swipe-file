/**
 * Zeus 索引への同期を呼び出す薄い窓口（要件 v1.7 §F5）。
 * 判断規則はサーバー側（functions/api/zeus-sync.js）に集約してあるので、
 * ここでは「呼ぶだけ・失敗しても画面を止めない」に徹する。
 */

async function callSync(body) {
  try {
    const res = await fetch("/api/zeus-sync", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/** 登録直後に1件だけ同期する。失敗しても登録は成立させる。 */
export function syncOneToZeus(id) {
  return callSync({ id });
}

/** 未同期のものをまとめて同期する（アプリ起動時に1回）。 */
export function retryPendingZeusSync() {
  return callSync({ retry: true });
}
