/**
 * スワイプくんパネル：枠（iframe）と、見ているページを読む仕組み。
 * 画面（https://swipe.shia2n.jp/panel）から頼まれたときだけ、いま見ているタブを読む・撮る。
 *
 * やりとり（画面 → ここ）：{ src: "swipe-kun", type, id, ... }
 *   hello                 … 拡張機能の中で開かれているかの確認
 *   peek                  … いま見ているページの情報（X ならポストとスレッド）。撮らない
 *   grab { mode, thread } … 情報＋スクショ。mode は post（ポストだけ）／screen（見えている範囲）／crop（範囲をなぞる）
 *   yt                    … YouTube の動画の題名・チャンネル・長さ・文字起こし（1.1.0 から）
 * ここ → 画面：{ src: "swipe-kun-ext", type: "reply", id, ok, data | error } と、タブが変わったときの { type: "tab" }
 */
const frame = document.getElementById("app");
const APP_ORIGIN = new URL(frame.src).origin;
const VERSION = chrome.runtime.getManifest().version;

const post = msg => frame.contentWindow?.postMessage({ src: "swipe-kun-ext", ...msg }, APP_ORIGIN);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error("見ているタブが見つかりません");
  if (!/^https?:/.test(tab.url || "")) throw new Error("このページは読めません（Chrome の画面や拡張機能のページなど）");
  return tab;
}

async function run(tab, func, args = []) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
  return res?.result;
}

/* ── ページの中で動く関数（そのままページへ差し込むので、外の変数は使えない） ── */

function readPage() {
  const meta = n => document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.content || "";
  const out = {
    url: location.href, title: document.title, site: location.hostname.replace(/^www\./, ""),
    ogTitle: meta("og:title"), desc: meta("og:description") || meta("description"), image: meta("og:image"),
    x: null,
  };
  const m = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
  if (!/(^|\.)(x|twitter)\.com$/.test(location.hostname) || !m) return out;

  const num = s => (String(s || "").match(/[\d][\d,.]*\s*[万千億KMB]?/) || [""])[0].replace(/\s/g, "");
  const info = a => {
    const href = [...a.querySelectorAll('a[href*="/status/"]')].map(x => x.getAttribute("href")).find(h => /^\/[^/]+\/status\/\d+$/.test(h)) || "";
    const [, handle = "", , id = ""] = href.split("/");
    const un = a.querySelector('[data-testid="User-Name"]');
    const name = un ? (un.querySelector("span")?.innerText || "").trim() : "";
    const text = (a.querySelector('[data-testid="tweetText"]')?.innerText || "").trim();
    const btn = k => { const b = a.querySelector(`[data-testid="${k}"]`); return b ? num(b.getAttribute("aria-label") || b.innerText) : ""; };
    const viewEl = a.querySelector('a[href$="/analytics"]');
    const time = a.querySelector("time")?.getAttribute("datetime") || "";
    const imgs = [...a.querySelectorAll('[data-testid="tweetPhoto"] img')].map(i => i.src).filter(Boolean);
    return { id, handle, name, text, time, imgs, like: btn("like") || btn("unlike"), rt: btn("retweet") || btn("unretweet"), reply: btn("reply"), view: viewEl ? num(viewEl.getAttribute("aria-label") || viewEl.innerText) : "" };
  };
  const list = [...document.querySelectorAll('article[data-testid="tweet"]')].map(info);
  let i = list.findIndex(p => p.id === m[2]);
  if (i < 0) return out;
  const main = list[i];
  // スレッド：本人が続けて書いたものだけ（前にも後ろにも）。他人の返信が来たらそこで切る
  let s = i, e = i;
  while (s > 0 && list[s - 1].handle === main.handle) s--;
  while (e < list.length - 1 && list[e + 1].handle === main.handle) e++;
  out.x = { main, thread: list.slice(s, e + 1), mainIndex: i - s };
  return out;
}

// 指定したポストを画面の真ん中へ動かし、その位置（画面に対する）を返す
function placePost(id) {
  const a = [...document.querySelectorAll('article[data-testid="tweet"]')].find(el =>
    [...el.querySelectorAll('a[href*="/status/"]')].some(x => new RegExp(`/status/${id}$`).test(x.getAttribute("href") || "")));
  if (!a) return null;
  a.scrollIntoView({ block: "center", behavior: "instant" });
  const r = a.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio };
}

// 画面の上に薄い幕を出し、なぞった範囲を返す（Esc でやめる）
function pickArea() {
  return new Promise(resolve => {
    const veil = document.createElement("div");
    veil.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(20,14,8,.18)";
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;border:2px solid #f59e0b;background:rgba(245,158,11,.12);display:none;pointer-events:none";
    const tip = document.createElement("div");
    tip.textContent = "撮りたい範囲をなぞってください（Esc でやめる）";
    tip.style.cssText = "position:fixed;left:50%;top:16px;transform:translateX(-50%);background:#1a1a1a;color:#fff;font:600 13px system-ui,sans-serif;padding:8px 12px;border-radius:8px;pointer-events:none";
    veil.append(box, tip); document.documentElement.append(veil);
    let s = null;
    const done = v => { veil.remove(); removeEventListener("keydown", key, true); resolve(v); };
    const key = e => { if (e.key === "Escape") { e.preventDefault(); done(null); } };
    addEventListener("keydown", key, true);
    veil.addEventListener("pointerdown", e => { s = { x: e.clientX, y: e.clientY }; veil.setPointerCapture(e.pointerId); });
    veil.addEventListener("pointermove", e => {
      if (!s) return;
      const x = Math.min(s.x, e.clientX), y = Math.min(s.y, e.clientY), w = Math.abs(e.clientX - s.x), h = Math.abs(e.clientY - s.y);
      Object.assign(box.style, { display: "block", left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
    });
    veil.addEventListener("pointerup", e => {
      if (!s) return;
      const x = Math.min(s.x, e.clientX), y = Math.min(s.y, e.clientY), w = Math.abs(e.clientX - s.x), h = Math.abs(e.clientY - s.y);
      if (w < 8 || h < 8) { s = null; box.style.display = "none"; return; }
      done({ x, y, w, h, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio });
    });
  });
}

/**
 * YouTube の動画を読む（ページの中で動く）。
 * 文字起こしは 3 つの道を順に試す：①字幕の住所（timedtext）②YouTube の文字起こしの口（get_transcript）
 * ③画面の「文字起こしを表示」を開いて読む。どれも Naoki が開いているページの中から取るので、外から取るより確実。
 * 戻り値 { id, title, channel, len, cap, lines: [[秒, 文], ...], how, err }
 */
async function readYouTube() {
  const id = (location.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})/) || [])[1] || new URLSearchParams(location.search).get("v") || "";
  const out = { id, title: "", channel: "", len: 0, cap: "", lines: [], how: "", err: "" };
  if (!/^[\w-]{11}$/.test(id)) { out.err = "動画の番号が見つかりません"; return out; }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // HTML の中の「名前 = {…}」の {…} を取り出す（文字列の中の括弧は数えない）
  const objAfter = (html, marker) => {
    const at = html.indexOf(marker); if (at < 0) return null;
    const st = html.indexOf("{", at); if (st < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = st; i < html.length; i++) {
      const c = html[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) { try { return JSON.parse(html.slice(st, i + 1)); } catch { return null; } }
    }
    return null;
  };
  const runsText = r => (r?.runs || []).map(x => x.text || "").join("") || r?.simpleText || "";
  const pieces = []; // [[秒, 文の切れ端], ...]
  let html = "";
  try { html = await (await fetch(`/watch?v=${id}&hl=ja`, { credentials: "include" })).text(); } catch { /* 下の道へ */ }
  const pr = objAfter(html, "ytInitialPlayerResponse = ") || {};
  const vd = pr.videoDetails || {};
  out.title = vd.title || ""; out.channel = vd.author || ""; out.len = +vd.lengthSeconds || 0;

  // ① 字幕の住所。手で付けた日本語 → 自動字幕の日本語 → 手で付けたほかの言語 → 最初のもの
  const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const ja = t => /^ja/.test(t.languageCode || "");
  const track = tracks.find(t => ja(t) && t.kind !== "asr") || tracks.find(ja) || tracks.find(t => t.kind !== "asr") || tracks[0];
  if (track?.baseUrl) {
    try {
      const txt = await (await fetch(track.baseUrl + "&fmt=json3", { credentials: "include" })).text();
      if (txt.trim()) {
        for (const ev of JSON.parse(txt).events || []) {
          const t = (ev.segs || []).map(x => x.utf8 || "").join("");
          if (t.trim()) pieces.push([(ev.tStartMs || 0) / 1000, t]);
        }
      }
    } catch { /* 下の道へ */ }
    if (pieces.length) { out.how = "timedtext"; out.cap = track.kind === "asr" ? "自動字幕" : "字幕"; }
  }

  // ② YouTube の文字起こしの口
  if (!pieces.length && html) {
    const params = (html.match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/) || [])[1];
    const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
    const ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1] || "2.20250101.00.00";
    if (params) {
      try {
        const res = await fetch(`/youtubei/v1/get_transcript?prettyPrint=false${key ? "&key=" + key : ""}`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: ver, hl: "ja" } }, params }),
        });
        const walk = o => { if (!o || typeof o !== "object") return; if (o.transcriptSegmentRenderer) { const r = o.transcriptSegmentRenderer; const t = runsText(r.snippet); if (t.trim()) pieces.push([(+r.startMs || 0) / 1000, t]); return; } for (const k in o) walk(o[k]); };
        if (res.ok) walk(await res.json());
      } catch { /* 下の道へ */ }
      if (pieces.length) { out.how = "transcript"; out.cap = "文字起こし"; }
    }
  }

  // ③ 画面の「文字起こしを表示」を開いて読む（いま開いている動画と同じときだけ）
  const curId = (location.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})/) || [])[1] || new URLSearchParams(location.search).get("v");
  if (!pieces.length && curId === id) {
    const segs = () => document.querySelectorAll("ytd-transcript-segment-renderer");
    if (!segs().length) {
      const btn = document.querySelector("ytd-video-description-transcript-section-renderer button")
        || [...document.querySelectorAll("button")].find(b => /文字起こしを表示|Show transcript/i.test(b.innerText || b.getAttribute("aria-label") || ""));
      btn?.click();
      for (let i = 0; i < 30 && !segs().length; i++) await wait(200);
    }
    for (const el of segs()) {
      const ts = (el.querySelector(".segment-timestamp")?.innerText || "").trim();
      const t = (el.querySelector(".segment-text")?.innerText || "").trim();
      if (!ts || !t) continue;
      pieces.push([ts.split(":").reduce((a, v) => a * 60 + (+v || 0), 0), t]);
    }
    if (pieces.length) { out.how = "screen"; out.cap = "文字起こし"; }
  }
  if (!pieces.length) { out.err = tracks.length ? "字幕はあるが読めませんでした" : "この動画には字幕がありません"; return out; }

  // 切れ端を、文の終わり（。！？）か 90 字か 30 秒で 1 行にまとめる
  const clean = t => t.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").replace(/([\u3000-\u9fff\uff00-\uffef])\s+(?=[\u3000-\u9fff\uff00-\uffef])/g, "$1").trim();
  let cur = null;
  for (const [sec, raw] of pieces.sort((a, b) => a[0] - b[0])) {
    const t = clean(raw); if (!t) continue;
    if (!cur) cur = [sec, t];
    else cur[1] = clean(cur[1] + (/[A-Za-z0-9]$/.test(cur[1]) && /^[A-Za-z0-9]/.test(t) ? " " : " ") + t);
    if (/[。！？!?]$/.test(cur[1]) || cur[1].length >= 90 || sec - cur[0] >= 30) { out.lines.push([Math.floor(cur[0]), cur[1]]); cur = null; }
  }
  if (cur) out.lines.push([Math.floor(cur[0]), cur[1]]);
  return out;
}

/* ── 撮る・切り抜く ──────────────────────────────────── */

let lastShot = 0;
async function shoot(tab) {
  // Chrome は 1 秒に 2 回までしか撮らせないので、間をあける
  const wait = 650 - (Date.now() - lastShot);
  if (wait > 0) await sleep(wait);
  lastShot = Date.now();
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
}

async function crop(dataUrl, r) {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const k = bmp.width / r.vw; // 画面の 1px が画像の何 px か（拡大率・高解像度の画面に合わせる）
  const sx = Math.max(0, Math.round(r.x * k)), sy = Math.max(0, Math.round(r.y * k));
  const sw = Math.min(bmp.width - sx, Math.round(r.w * k)), sh = Math.min(bmp.height - sy, Math.round(r.h * k));
  const c = new OffscreenCanvas(sw, sh);
  c.getContext("2d").drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
  return c.convertToBlob({ type: "image/png" });
}

async function stack(blobs) {
  const bmps = await Promise.all(blobs.map(b => createImageBitmap(b)));
  const w = Math.max(...bmps.map(b => b.width)), gap = 8;
  const h = bmps.reduce((s, b) => s + b.height, 0) + gap * (bmps.length - 1);
  const c = new OffscreenCanvas(w, h), g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
  let y = 0; for (const b of bmps) { g.drawImage(b, 0, y); y += b.height + gap; }
  return c.convertToBlob({ type: "image/png" });
}

const toDataUrl = blob => new Promise((ok, ng) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = ng; fr.readAsDataURL(blob); });

async function grab({ mode = "post", thread = true } = {}) {
  const tab = await activeTab();
  const page = await run(tab, readPage);
  let blob = null, used = mode;
  if (mode === "crop") {
    const r = await run(tab, pickArea);
    if (!r) throw new Error("範囲の選択をやめました");
    await sleep(120); // 幕が消えてから撮る
    blob = await crop(await shoot(tab), r);
  } else if (mode === "post" && page?.x) {
    const posts = thread ? page.x.thread.slice(0, 10) : [page.x.main];
    const parts = [];
    for (const p of posts) {
      const r = await run(tab, placePost, [p.id]);
      if (!r) continue;
      await sleep(250); // 動かしたあと、画像が描かれるのを待つ
      parts.push(await crop(await shoot(tab), r));
    }
    if (parts.length) blob = parts.length > 1 ? await stack(parts) : parts[0];
  }
  if (!blob) { used = "screen"; blob = await (await fetch(await shoot(tab))).blob(); } // 見えている範囲（ポストが見つからないときもこれ）
  return { page, shot: await toDataUrl(blob), mode: used };
}

/* ── 画面とのやりとり ─────────────────────────────────── */

addEventListener("message", async e => {
  if (e.origin !== APP_ORIGIN || e.source !== frame.contentWindow) return;
  const m = e.data || {};
  if (m.src !== "swipe-kun") return;
  const reply = (ok, body) => post({ type: "reply", id: m.id, ok, ...body });
  try {
    if (m.type === "hello") return reply(true, { data: { version: VERSION } });
    if (m.type === "peek") { const tab = await activeTab(); return reply(true, { data: await run(tab, readPage) }); }
    if (m.type === "grab") return reply(true, { data: await grab(m) });
    if (m.type === "yt") { const tab = await activeTab(); return reply(true, { data: await run(tab, readYouTube) }); }
    reply(false, { error: "知らない頼みです" });
  } catch (err) {
    reply(false, { error: String(err?.message || err) });
  }
});

// 見ているタブが変わったら知らせる（画面は読み直す）
const notify = () => post({ type: "tab" });
chrome.tabs.onActivated.addListener(notify);
chrome.tabs.onUpdated.addListener((_, info) => { if (info.status === "complete" || info.url) notify(); });
