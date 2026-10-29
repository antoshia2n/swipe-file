/**
 * YouTube の文字起こしをサーバーから読む（2026-10-30・画面に URL を貼って足したとき用）。
 * 拡張機能 swipe-kun-panel/panel.js の readYouTube の ①字幕の住所 ②文字起こしの口 と同じ順で試す。
 * ③（画面の「文字起こしを表示」）はサーバーには無いので無い。
 * 戻り値 { id, title, channel, len, cap, lines: [[秒, 文], ...], how, err }
 *   err が "blocked" のときは、YouTube がサーバーからの読み取りを断った（ロボット扱い）。
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// HTML の中の「名前 = {…}」の {…} を取り出す（文字列の中の括弧は数えない）
export function objAfter(html, marker) {
  const at = html.indexOf(marker); if (at < 0) return null;
  const st = html.indexOf("{", at); if (st < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = st; i < html.length; i++) {
    const c = html[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) { try { return JSON.parse(html.slice(st, i + 1)); } catch { return null; } }
  }
  return null;
}

// 切れ端を、文の終わり（。！？）か 90 字か 30 秒で 1 行にまとめる（panel.js と同じ規則）
export function joinPieces(pieces) {
  const clean = t => t.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").replace(/([　-鿿＀-￯])\s+(?=[　-鿿＀-￯])/g, "$1").trim();
  const lines = []; let cur = null;
  for (const [sec, raw] of pieces.slice().sort((a, b) => a[0] - b[0])) {
    const t = clean(raw); if (!t) continue;
    if (!cur) cur = [sec, t];
    else cur[1] = clean(cur[1] + " " + t);
    if (/[。！？!?]$/.test(cur[1]) || cur[1].length >= 90 || sec - cur[0] >= 30) { lines.push([Math.floor(cur[0]), cur[1]]); cur = null; }
  }
  if (cur) lines.push([Math.floor(cur[0]), cur[1]]);
  return lines;
}

export async function readTranscript(id, fetchFn = fetch) {
  const out = { id, title: "", channel: "", len: 0, cap: "", lines: [], how: "", err: "" };
  if (!/^[\w-]{11}$/.test(id || "")) { out.err = "動画の番号が見つかりません"; return out; }
  const headers = { "User-Agent": UA, "Accept-Language": "ja,en;q=0.8", Cookie: "CONSENT=YES+1" };
  const runsText = r => (r?.runs || []).map(x => x.text || "").join("") || r?.simpleText || "";
  const pieces = [];
  let html = "";
  try { html = await (await fetchFn(`https://www.youtube.com/watch?v=${id}&hl=ja`, { headers, signal: AbortSignal.timeout(10000) })).text(); } catch { /* 下へ */ }
  const pr = objAfter(html, "ytInitialPlayerResponse = ") || {};
  const vd = pr.videoDetails || {};
  out.title = vd.title || ""; out.channel = vd.author || ""; out.len = +vd.lengthSeconds || 0;
  const status = pr.playabilityStatus?.status || "";
  if (!vd.videoId && (/LOGIN_REQUIRED|UNPLAYABLE/.test(status) || /confirm you.re not a bot|ロボットではない/i.test(html))) { out.err = "blocked"; return out; }

  // ① 字幕の住所。手で付けた日本語 → 自動字幕の日本語 → 手で付けたほかの言語 → 最初のもの
  const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const ja = t => /^ja/.test(t.languageCode || "");
  const track = tracks.find(t => ja(t) && t.kind !== "asr") || tracks.find(ja) || tracks.find(t => t.kind !== "asr") || tracks[0];
  if (track?.baseUrl) {
    try {
      const txt = await (await fetchFn(track.baseUrl + "&fmt=json3", { headers, signal: AbortSignal.timeout(10000) })).text();
      if (txt.trim()) for (const ev of JSON.parse(txt).events || []) {
        const t = (ev.segs || []).map(x => x.utf8 || "").join("");
        if (t.trim()) pieces.push([(ev.tStartMs || 0) / 1000, t]);
      }
    } catch { /* 下へ */ }
    if (pieces.length) { out.how = "timedtext"; out.cap = track.kind === "asr" ? "自動字幕" : "字幕"; }
  }

  // ② YouTube の文字起こしの口
  if (!pieces.length && html) {
    const params = (html.match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/) || [])[1];
    const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
    const ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1] || "2.20250101.00.00";
    if (params) {
      try {
        const res = await fetchFn(`https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false${key ? "&key=" + key : ""}`, {
          method: "POST", headers: { ...headers, "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000),
          body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: ver, hl: "ja" } }, params }),
        });
        const walk = o => { if (!o || typeof o !== "object") return; if (o.transcriptSegmentRenderer) { const r = o.transcriptSegmentRenderer; const t = runsText(r.snippet); if (t.trim()) pieces.push([(+r.startMs || 0) / 1000, t]); return; } for (const k in o) walk(o[k]); };
        if (res.ok) walk(await res.json());
      } catch { /* 下へ */ }
      if (pieces.length) { out.how = "transcript"; out.cap = "文字起こし"; }
    }
  }
  if (!pieces.length) { out.err = !html || !vd.videoId ? "blocked" : tracks.length ? "字幕はあるが読めませんでした" : "この動画には字幕がありません"; return out; }
  out.lines = joinPieces(pieces);
  return out;
}
