/**
 * POST /api/file-parse — 原本ファイルから本文テキストを取り出す
 *
 * 要件 v1.8 §F7：
 *   PDF          → 解析してテキストを返す
 *   テキスト系    → そのまま返す
 *   画像          → 解析しない（保存のみ）
 *
 * 解析に失敗しても登録は通す仕様なので、エラーでは返さず
 * { ok:false, reason } を 200 で返す。呼び出し側は本文を空のまま保存する。
 *
 * 新しい外部サービスは足さない（Claude API のみ・2026-07-17 Decision 準拠）。
 */

const MODEL        = "claude-haiku-4-5-20251001";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const MAX_BYTES    = 10 * 1024 * 1024;

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // 一度に渡すと大きいファイルで落ちるため小分けにする
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: "invalid json" }), { status: 400, headers: JSON_HEADERS });
  }

  const { file_url: fileUrl, media_type: mediaType } = payload ?? {};
  if (!fileUrl) {
    return new Response(JSON.stringify({ ok: false, reason: "file_url が必要です" }), { status: 400, headers: JSON_HEADERS });
  }

  // 画像は解析しない（要件 §F7・OCRは非スコープ）
  if (mediaType?.startsWith("image/")) {
    return new Response(JSON.stringify({ ok: true, body: "", skipped: "画像は解析しません" }), { headers: JSON_HEADERS });
  }

  // 原本を取ってくる
  let buffer;
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, reason: `原本を取得できません（${res.status}）` }), { headers: JSON_HEADERS });
    }
    buffer = await res.arrayBuffer();
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, reason: `原本を取得できません：${err.message}` }), { headers: JSON_HEADERS });
  }

  if (buffer.byteLength > MAX_BYTES) {
    return new Response(JSON.stringify({ ok: false, reason: "10MB を超えるファイルは解析できません" }), { headers: JSON_HEADERS });
  }

  // テキスト系はそのまま返す（AI を通す必要がない）
  if (mediaType?.startsWith("text/") || /\.(txt|md|markdown)$/i.test(fileUrl)) {
    try {
      return new Response(JSON.stringify({ ok: true, body: new TextDecoder("utf-8").decode(buffer) }), { headers: JSON_HEADERS });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, reason: `文字として読めません：${err.message}` }), { headers: JSON_HEADERS });
    }
  }

  // PDF は Claude に読ませて本文を書き起こす
  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ ok: false, reason: "ANTHROPIC_API_KEY が未設定です" }), { headers: JSON_HEADERS });
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
        model:      MODEL,
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: [
              {
                type:   "document",
                source: { type: "base64", media_type: "application/pdf", data: toBase64(buffer) },
              },
              {
                type: "text",
                text: "このPDFの本文をそのまま書き起こしてください。要約・解説・前置きは不要です。本文テキストのみを返してください。",
              },
            ],
          },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok || data?.error) {
      const msg = data?.error?.message ?? `${res.status}`;
      return new Response(
        JSON.stringify({ ok: false, reason: msg.includes("credit") ? "利用残高が不足しています" : msg.slice(0, 160) }),
        { headers: JSON_HEADERS }
      );
    }

    const text = (data.content ?? []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
    if (!text) {
      return new Response(JSON.stringify({ ok: false, reason: "本文を取り出せませんでした" }), { headers: JSON_HEADERS });
    }
    return new Response(JSON.stringify({ ok: true, body: text }), { headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, reason: err.message }), { headers: JSON_HEADERS });
  }
}
