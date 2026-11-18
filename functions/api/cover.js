/**
 * POST /api/cover — 一覧に出す「表紙」の画像の住所を探す（2026-11-19 開発部・一覧のサムネ）
 *
 * X：ポストの埋め込みの口（cdn.syndication.twimg.com）から、ポストに付いている画像の 1 枚目。
 *    動画は動画の表紙。リンクのカードはカードの画像。画像の無いポストは { none: true }。
 * それ以外：ページの og:image（note は記事の見出し画像）。
 * 取れなかったときは { fetched: false }。エラーにはしない（一覧はスクショのまま出る）。
 */
import { canUseSwipe } from "../_lib/swipe-access.js";

const NAOKI_UID = "VrMwzeSceqWeXVQOrm8kpu4uVR33";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const out = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: JSON_HEADERS });

/** 埋め込みの口が求める鍵（X の埋め込みの部品と同じ計算） */
export const xToken = id => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");

/** 埋め込みの口の返事から表紙の住所を 1 つ選ぶ。画像が無ければ ""。 */
export function pickXCover(j) {
  const t = j?.__typename === "TweetTombstone" ? null : j;
  if (!t) return "";
  const m = (t.mediaDetails || [])[0] || (t.quoted_tweet?.mediaDetails || [])[0];
  if (m?.media_url_https) return small(m.media_url_https);
  const p = (t.photos || [])[0];
  if (p?.url) return small(p.url);
  if (t.video?.poster) return t.video.poster;
  const b = t.card?.binding_values || {};
  const c = b.thumbnail_image_large || b.photo_image_full_size_large || b.summary_photo_image_large || b.thumbnail_image;
  return c?.image_value?.url || "";
}
// 一覧に出すので、X の画像は 680px の版にする（元の大きさは要らない）
const small = u => /^https:\/\/pbs\.twimg\.com\/media\//.test(u) ? u.replace(/\?.*$/, "") + "?name=small" : u;

function ogImage(html) {
  const res = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of res) { const m = html.match(re); if (m) return m[1].trim().replace(/&amp;/g, "&"); }
  return "";
}

export async function onRequestPost({ request, env }) {
  const allowUids = (env.SWIPE_ALLOW_UID ?? NAOKI_UID).split(",").map(s => s.trim()).filter(Boolean);
  const access = await canUseSwipe({ request, env, allowUids });
  if (access === "no_token") return out({ error: "login required" }, 401);
  if (access === "denied") return out({ error: "forbidden" }, 403);

  let url;
  try { ({ url } = await request.json()); } catch { return out({ error: "invalid json" }, 400); }
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return out({ error: "url required" }, 400);

  const x = /(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i.exec(url);
  if (x) {
    try {
      const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${x[1]}&token=${xToken(x[1])}&lang=ja`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SwipeFile-Bot/1.0)" }, signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return out({ fetched: false, reason: String(res.status) });
      const text = await res.text();
      if (!text.trim()) return out({ fetched: false, reason: "empty" }); // 消えたポスト・鍵のかかったポスト
      const j = JSON.parse(text);
      if (j?.__typename === "TweetTombstone") return out({ fetched: false, reason: "tombstone" });
      const image = pickXCover(j);
      return out(image ? { fetched: true, image } : { fetched: true, image: null, none: true });
    } catch (e) {
      return out({ fetched: false, reason: e.message });
    }
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SwipeFile-Bot/1.0)" }, signal: AbortSignal.timeout(8000), redirect: "follow",
    });
    if (!res.ok) return out({ fetched: false, reason: String(res.status) });
    const image = ogImage((await res.text()).slice(0, 60000));
    return out(image ? { fetched: true, image: new URL(image, url).href } : { fetched: false, reason: "no og:image" });
  } catch (e) {
    return out({ fetched: false, reason: e.message });
  }
}
