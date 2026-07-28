/**
 * POST /api/ogp  — URL からページのメタ情報を取得する
 *
 * 要件 v1.5 §F1「OGPメタ取得は自前fetchのPages Functionを1本追加」に対応。
 * 実装は Zeus の _shared/og-fetch.js と同じ方式（外部の代行APIに依存しない）。
 *
 * 取得できない場合（X など）は空のオブジェクトを返す。エラーにはしない。
 * 要件どおり「OGP取得不能でも登録は通す」ため。
 */

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function pickMeta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1].trim());
  }
  return null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export async function onRequestPost(context) {
  const { request } = context;

  let url;
  try {
    ({ url } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: JSON_HEADERS });
  }
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return new Response(JSON.stringify({ error: "url required" }), { status: 400, headers: JSON_HEADERS });
  }

  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SwipeFile-Bot/1.0)" },
      signal:  AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ fetched: false, reason: `${res.status}` }), { headers: JSON_HEADERS });
    }
    html = (await res.text()).slice(0, 40000);
  } catch (err) {
    return new Response(JSON.stringify({ fetched: false, reason: err.message }), { headers: JSON_HEADERS });
  }

  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const result = {
    fetched:     true,
    title:       pickMeta(html, "og:title") || (titleTag ? decodeEntities(titleTag[1].trim()) : null),
    description: pickMeta(html, "og:description") || pickMeta(html, "description"),
    image:       pickMeta(html, "og:image"),
    site_name:   pickMeta(html, "og:site_name"),
    author:      pickMeta(html, "author") || pickMeta(html, "twitter:creator"),
  };

  return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
}
