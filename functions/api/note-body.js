/**
 * POST /api/note-body  — note 記事の、誰でも読める部分の本文を取る（2026-11-03 開発部）
 *
 * note が記事ごとに出している中身のデータ（https://note.com/api/v3/notes/{記事の番号}）を
 * ログインなしで読む。ログインしていないので、返ってくるのは無料で読める部分だけ（有料部分は入らない）。
 * 本文は文字に直し、画像はその位置に「［画像］画像の住所」を残す。
 *
 * 取れないとき（note 以外の住所・note が断った・形が変わった）は { fetched: false } を返す。エラーにはしない。
 * 保存はいつもどおり通し、本文が空のまま残るだけにするため。
 */

import { canUseSwipe } from "../_lib/swipe-access.js";
import { noteKey, noteHtmlToText } from "../_lib/note-text.js";

const NAOKI_UID = "VrMwzeSceqWeXVQOrm8kpu4uVR33";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const out = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: JSON_HEADERS });

export async function onRequestPost(context) {
  const { request, env } = context;
  const allowUids = (env.SWIPE_ALLOW_UID ?? NAOKI_UID).split(",").map(s => s.trim()).filter(Boolean);
  const access = await canUseSwipe({ request, env, allowUids });
  if (access === "no_token") return out({ error: "login required" }, 401);
  if (access === "denied") return out({ error: "forbidden" }, 403);

  let url;
  try {
    ({ url } = await request.json());
  } catch {
    return out({ error: "invalid json" }, 400);
  }
  const key = noteKey(url);
  if (!key) return out({ fetched: false, reason: "note の記事の住所ではありません" });

  let data;
  try {
    const res = await fetch(`https://note.com/api/v3/notes/${key}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SwipeFile-Bot/1.0)", Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return out({ fetched: false, reason: `note が ${res.status} を返しました` });
    data = (await res.json())?.data;
  } catch (err) {
    return out({ fetched: false, reason: String(err?.message || err) });
  }
  const html = typeof data?.body === "string" ? data.body : "";
  if (!html.trim()) return out({ fetched: false, reason: "本文が空でした" });

  const { text, images } = noteHtmlToText(html);
  if (!text) return out({ fetched: false, reason: "本文を文字に直せませんでした" });
  return out({ fetched: true, body: text, chars: text.length, images });
}
