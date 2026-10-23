/**
 * GET /s/{token} — 共有ページ（生徒が開く。ログインなし）
 *
 * 表 sw_shares を管理者キーで読み、公開中で期限内のときだけ、選んだスワイプを並べて出す。
 * 生徒の画面からデータベースには一切届かない（ここで HTML にしてから返す）。
 * 出すのは：見出し・画像（印つき）・本文の写し・線を引いた所・言語化（＋設定で仮説・用途抽出・ファイル）・シアニンのコメント・元のリンク。
 * 検索サイトには載せない（noindex）。開かれた数を 1 足す。
 */

const NOT_FOUND = "このページは見つかりませんでした。リンクが正しいか、送ってくれた人に確かめてください。";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const base = env => (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
const headers = env => {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, ...(/^eyJ/.test(String(key || "")) ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" };
};
const safeUrl = u => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "");

async function rest(env, path, init = {}) {
  const res = await fetch(`${base(env)}/rest/v1/${path}`, { ...init, headers: { ...headers(env), ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`rest ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const CSS = `
:root{--bg:#f5f0eb;--panel:#fff;--soft:#f7f3ee;--line:#e6dfd6;--fg:#1a1a1a;--muted:#6b6259;--faint:#a8a09a;--accent:#f59e0b;--accent-ink:#b45309;--ink:#1a1a1a;--on-ink:#fff;--shot-line:#ece6de;--shot-sub:#6b6259;
  --f:"Geist","Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",system-ui,sans-serif;--mono:"Geist Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#1b1916;--panel:#24211d;--soft:#2b2823;--line:#38332c;--fg:#f1ece6;--muted:#b0a69b;--faint:#7d746a;--accent:#fbbf24;--accent-ink:#fbbf24;--ink:#f1ece6;--on-ink:#1b1916;--shot-line:#38332c;--shot-sub:#b0a69b;color-scheme:dark}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--fg);font-family:var(--f);font-size:15px;-webkit-font-smoothing:antialiased}
a{color:inherit}
.wrap{max-width:900px;margin:0 auto;padding:28px max(16px,env(safe-area-inset-left)) 72px;display:flex;flex-direction:column;gap:16px}
.k{font-size:12px;font-weight:700;color:var(--accent-ink);letter-spacing:.04em}
h1{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:6px 0 8px;line-height:1.3;text-wrap:balance}
.d{font-size:15px;color:var(--muted);line-height:1.85;max-width:62ch;margin:0;white-space:pre-wrap}
.by{font-size:12px;color:var(--faint);margin-top:10px}
.item{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
.no{font-family:var(--mono);font-size:11px;color:var(--faint)}
h2{font-weight:800;font-size:17px;margin:4px 0 8px;line-height:1.45;text-wrap:balance}
.lab{font-size:11px;font-weight:700;color:var(--faint);letter-spacing:.04em;margin:14px 0 4px}
.txt{font-size:14px;line-height:1.85;margin:0;white-space:pre-wrap}
.cmt{border-left:3px solid var(--accent);background:color-mix(in srgb,var(--accent) 8%,var(--panel));border-radius:0 8px 8px 0;padding:8px 12px;font-size:14px;line-height:1.85;margin:10px 0 0;white-space:pre-wrap}
.cmt-l{font-size:11px;font-weight:700;color:var(--accent-ink);letter-spacing:.04em;margin-bottom:2px}
mark{background:color-mix(in srgb,var(--accent) 28%,transparent);color:inherit;border-radius:3px;padding:0 1px;box-shadow:inset 0 -2px 0 var(--accent)}
.shot{border:1px solid var(--shot-line);border-radius:10px;background:var(--panel);overflow:hidden;position:relative}
.mk-wrap{position:relative;display:block}.mk-wrap img{display:block;width:100%;height:auto}
.mk{position:absolute;border:2.5px solid var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent);border-radius:4px}
.mk em{position:absolute;left:-2px;top:-20px;font-style:normal;font-size:10.5px;font-weight:700;background:var(--accent);color:#1a1a1a;border-radius:4px;padding:1px 5px;white-space:nowrap}
.xs{padding:12px 14px;display:flex;flex-direction:column;gap:8px}.xs-n{font-weight:700;font-size:13px}.xs-u{font-size:11.5px;color:var(--shot-sub)}.xs-b{font-size:13.5px;line-height:1.7;white-space:pre-wrap}
.thsep{border-top:1px dashed var(--shot-line)}
.links{display:flex;gap:14px;flex-wrap:wrap;margin-top:12px}
.lk{font-size:13px;font-weight:700;color:var(--accent-ink);text-decoration:none}.lk:hover{text-decoration:underline}
.cta{background:var(--ink);color:var(--on-ink);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:10px}
.cta-t{font-weight:800;font-size:16px;line-height:1.6;white-space:pre-wrap}
.cta-b{align-self:flex-start;background:var(--accent);color:#1a1a1a;font-weight:800;font-size:14px;border-radius:8px;padding:10px 16px;text-decoration:none}
.msg{max-width:520px;margin:15vh auto 0;padding:0 16px;text-align:center;color:var(--muted);line-height:1.9}
.foot{font-size:11.5px;color:var(--faint);text-align:center;margin-top:12px}
@media (max-width:720px){.item{grid-template-columns:1fr}h1{font-size:24px}}`;

function page(title, body, desc = "", image = "") {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}"><meta property="og:type" content="website"><meta property="og:site_name" content="シアニンのスワイプ">${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}">` : `<meta name="twitter:card" content="summary">`}${desc ? `<meta property="og:description" content="${esc(desc.slice(0, 120))}"><meta name="description" content="${esc(desc.slice(0, 120))}">` : ""}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600;700;800&family=Geist+Mono:wght@400&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>${body}</body></html>`;
}
const reply = (html, status = 200) => new Response(html, {
  status,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" },
});
const message = (text, status) => reply(page("シアニンのスワイプ", `<div class="msg">${esc(text)}</div>`), status);

function shotHTML(r) {
  const p = r.props && typeof r.props === "object" ? r.props : {};
  const img = safeUrl(p.shot || r.screenshot_url || p.ogImage);
  const hl = Array.isArray(r.highlights) ? r.highlights : [];
  if (img) {
    const boxes = hl.filter(h => Array.isArray(h.box) && !h.p).map(h => `<span class="mk" style="left:${+h.box[0]}%;top:${+h.box[1]}%;width:${+h.box[2]}%;height:${+h.box[3]}%"><em>${esc(h.r)}</em></span>`).join("");
    return `<div class="shot"><span class="mk-wrap"><img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">${boxes}</span></div>`;
  }
  const thread = Array.isArray(p.thread) ? p.thread : null;
  const text = r.body || r.excerpt || "";
  if (!thread && !text) return "";
  const name = r.author || p.handle || "";
  const parts = thread ? thread.map((t, i) => `${i ? '<div class="thsep"></div>' : ""}<div class="xs-b">${esc(t)}</div>`).join("") : `<div class="xs-b">${esc(text)}</div>`;
  return `<div class="shot xs">${name ? `<div><div class="xs-n">${esc(name)}</div>${p.handle ? `<div class="xs-u">${esc(p.handle)}</div>` : ""}</div>` : ""}${parts}</div>`;
}

export async function onRequestGet({ params, env, waitUntil }) {
  const token = String(params.token || "");
  if (!/^[a-z0-9]{8,64}$/i.test(token)) return message(NOT_FOUND, 404);
  if (!base(env) || !env.SUPABASE_SERVICE_ROLE_KEY) return message("いまページを開けません。少し時間をおいてもう一度開いてください。", 503);

  let sh;
  try { [sh] = await rest(env, `sw_shares?token=eq.${encodeURIComponent(token)}&select=*&limit=1`); }
  catch { return message("いまページを開けません。少し時間をおいてもう一度開いてください。", 503); }
  if (!sh) return message(NOT_FOUND, 404);
  if (!sh.live) return message("このページは公開を止めています。", 410);
  if (sh.expire_at && new Date(sh.expire_at) < new Date()) return message("このページは公開の期限が切れています。", 410);

  const list = (Array.isArray(sh.items) ? sh.items : []).filter(x => x && /^[0-9a-f-]{36}$/i.test(x.id));
  let rows = [];
  if (list.length) {
    const ids = list.map(x => x.id).join(",");
    try {
      rows = await rest(env, `sw_swipes?id=in.(${ids})&user_id=eq.${encodeURIComponent(sh.user_id)}&select=id,title,body,excerpt,author,source_url,screenshot_url,file_url,props,reason,an_hypo,an_idea,highlights`);
    } catch { return message("いまページを開けません。少し時間をおいてもう一度開いてください。", 503); }
  }
  const byId = new Map(rows.map(r => [r.id, r]));
  const its = list.map(x => ({ r: byId.get(x.id), c: x.c || "" })).filter(v => v.r);

  // 開かれた数を 1 足す（返事は待たない）
  waitUntil(rest(env, `sw_shares?id=eq.${sh.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ opens: (sh.opens || 0) + 1, last_opened_at: new Date().toISOString() }) }).catch(() => {}));

  const n = its.length, pad = i => String(i).padStart(2, "0");
  const items = its.map(({ r, c }, i) => {
    const hl = (Array.isArray(r.highlights) ? r.highlights : []).filter(h => h && h.t);
    const p = r.props && typeof r.props === "object" ? r.props : {};
    const src = safeUrl(r.source_url), file = safeUrl(r.file_url);
    return `<article class="item"><div>${shotHTML(r)}</div><div style="min-width:0"><span class="no">${pad(i + 1)} / ${pad(n)}</span>
      <h2>${esc(r.title)}</h2>${c ? `<div class="cmt"><div class="cmt-l">シアニンのコメント</div>${esc(c)}</div>` : ""}
      ${hl.length ? `<div class="lab">見てほしい所</div>${hl.map(h => `<p class="txt"><mark>${esc(h.t)}</mark>（${esc(h.r)}）</p>`).join("")}` : ""}
      ${r.reason ? `<div class="lab">言語化</div><p class="txt">${esc(r.reason)}</p>` : ""}
      ${sh.show_hypo && r.an_hypo ? `<div class="lab">仮説</div><p class="txt">${esc(r.an_hypo)}</p>` : ""}
      ${sh.show_idea && r.an_idea ? `<div class="lab">用途抽出</div><p class="txt">${esc(r.an_idea)}</p>` : ""}
      <div class="links">${sh.show_file && file ? `<a class="lk" href="${esc(file)}" target="_blank" rel="noopener">${esc(p.file_name || "ファイル")} を開く</a>` : ""}${src ? `<a class="lk" href="${esc(src)}" target="_blank" rel="noopener noreferrer">元のページを開く</a>` : ""}</div>
    </div></article>`;
  }).join("");
  const ctaUrl = safeUrl(sh.cta_url);
  const cta = sh.cta ? `<div class="cta"><div class="cta-t">${esc(sh.cta_text)}</div>${ctaUrl ? `<a class="cta-b" href="${esc(ctaUrl)}" target="_blank" rel="noopener">${esc(sh.cta_btn || "くわしく見る")}</a>` : ""}</div>` : "";
  const body = `<div class="wrap"><header><div class="k">シアニンのスワイプ</div><h1>${esc(sh.name)}</h1>${sh.intro ? `<p class="d">${esc(sh.intro)}</p>` : ""}<div class="by">${n} 件</div></header>
    ${items || '<div class="msg" style="margin-top:20px">まだ何も入っていません。</div>'}${cta}<div class="foot">このページは検索サイトには出ません。リンクを知っている人だけが見られます。</div></div>`;
  // リンクを LINE などに貼ったときの見出しの画像：1 件目から順に、画像のあるものを使う
  const cover = its.map(({ r }) => { const p = r.props && typeof r.props === "object" ? r.props : {}; return safeUrl(p.shot || r.screenshot_url || p.ogImage); }).find(Boolean) || "";
  const desc = sh.intro || `${n} 件の見本`;
  return reply(page(sh.name, body, desc, cover));
}
