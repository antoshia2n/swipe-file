/**
 * スワイプくんパネル：枠（iframe）と、見ているページを読む仕組み。
 * 画面（https://swipe.shia2n.jp/panel）から頼まれたときだけ、いま見ているタブを読む・撮る。
 *
 * やりとり（画面 → ここ）：{ src: "swipe-kun", type, id, ... }
 *   hello                 … 拡張機能の中で開かれているかの確認
 *   peek                  … いま見ているページの情報（X ならポストとスレッド）。撮らない
 *   grab { mode, thread } … 情報＋スクショ。mode は post（ポストだけ）／screen（見えている範囲）／crop（範囲をなぞる）
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
    reply(false, { error: "知らない頼みです" });
  } catch (err) {
    reply(false, { error: String(err?.message || err) });
  }
});

// 見ているタブが変わったら知らせる（画面は読み直す）
const notify = () => post({ type: "tab" });
chrome.tabs.onActivated.addListener(notify);
chrome.tabs.onUpdated.addListener((_, info) => { if (info.status === "complete" || info.url) notify(); });
