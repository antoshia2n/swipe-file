/**
 * スワイプくんのデータの出入り口（画面側）。
 * 表の読み書きは shia2n-core の supabase（/api/db 経由・本人の行だけ）を使う。
 * ファイルは /api/storage/upload（管理者キーはサーバー側だけ）。
 *
 * 1 件の形（画面の中）と、表 sw_swipes の 1 行の形の対応はこのファイルだけに書く。
 */
import { supabase, auth } from "shia2n-core";
import { deriveTitle, deriveExcerpt } from "../lib/titling.js";
import { toJapanese } from "../lib/errors.js";

export const TABLE = "sw_swipes";
export const SETTINGS_TABLE = "sw_settings";
export const BUCKET = "swipe-files";
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");

async function run(q, fallback) {
  const { data, error } = await q;
  if (error) throw new Error(toJapanese(error, fallback));
  return data;
}

/* ── 日付 ─────────────────────────────────────────────── */
const JST = { timeZone: "Asia/Tokyo" };
export function jstParts(iso) {
  const d = iso ? new Date(iso) : new Date();
  const f = new Intl.DateTimeFormat("en-CA", { ...JST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const [y, m, dd] = f.split("-");
  return { y, m, d: dd };
}
export const shortDate = iso => { const p = jstParts(iso); return `${+p.m}/${+p.d}`; };
/** 月の表の ID。X は x-2026-10、YouTube は yt-2026-10 */
export const monthTableId = (iso, kind = "x") => { const p = jstParts(iso); return `${kind}-${p.y}-${p.m}`; };

/* ── YouTube（5便目） ─────────────────────────────────── */
/** 動画の番号（11 字）。watch?v= ・youtu.be/ ・shorts/ ・embed/ ・live/ に対応。取れなければ "" */
export function ytId(url = "") {
  const u = String(url || "");
  if (!/youtube\.com|youtu\.be/i.test(u)) return "";
  const m = /[?&]v=([\w-]{11})/.exec(u) || /youtu\.be\/([\w-]{11})/.exec(u) || /youtube\.com\/(?:shorts|embed|live)\/([\w-]{11})/.exec(u);
  return m ? m[1] : "";
}
export const ytThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
/** 秒 → 0:31 / 1:02:03 */
export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(+sec || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
const toSec = t => t.split(":").reduce((a, v) => a * 60 + (+v), 0);
/** 文字起こしは本文に「0:31 話したこと」の行で入れる。検索・線・素材パックがそのまま効く */
export const transcriptBody = lines => lines.map(([s, t]) => `${fmtTime(s)} ${t}`).join("\n");
/** 本文が文字起こしの形なら [{ s:秒, t:時刻, x:文 }] を返す。違えば null */
export function parseTranscript(body = "") {
  const rows = String(body || "").split("\n").filter(l => l.trim());
  if (rows.length < 2) return null;
  const out = [];
  for (const l of rows) { const m = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.*)$/.exec(l.trim()); if (m) out.push({ s: toSec(m[1]), t: m[1], x: m[2] }); }
  return out.length >= Math.max(2, rows.length * 0.6) ? out : null;
}

/* ── 媒体の見分け（旧アプリと同じ規則） ───────────────────── */
export function detectSourceType(url = "", { hasBody = false, isPdf = false } = {}) {
  const u = (url ?? "").toLowerCase();
  if (/(^|\/\/)(www\.)?(x\.com|twitter\.com)\//.test(u)) return "X";
  if (/(^|\/\/)(www\.)?note\.com\//.test(u)) return "note";
  if (/youtube\.com|youtu\.be/.test(u)) return "YouTube";
  if (/^https?:\/\//.test(u)) return "ブログ";
  if (isPdf) return "PDF";
  if (hasBody) return "ノート";
  return "その他";
}
export function shuFromSource(src) {
  if (src === "X") return "ポスト";
  if (src === "note" || src === "ブログ" || src === "ノート") return "記事";
  if (src === "PDF" || src === "YouTube") return "教材";
  return "";
}
function hostOf(url) {
  try { const u = new URL(url); return u.hostname.replace(/^www\./, "") + (/(x|twitter)\.com$/.test(u.hostname) ? "/" + (u.pathname.split("/")[1] || "") : ""); }
  catch { return ""; }
}
function fileNameOf(url) {
  try { return decodeURIComponent(new URL(url).pathname.split("/").pop() || ""); } catch { return ""; }
}

/**
 * X のリンク先の情報から、投稿者・アカウント・ポストの本文を取り出す。
 * 題名は「名前 (@id) on X」か「名前 on X: "本文" / X」の形で来る。
 */
export function fromXCard(og, url = "") {
  const out = { author: "", handle: "", text: "" };
  const m = /x\.com\/([A-Za-z0-9_]+)\/status/i.exec(url) || /twitter\.com\/([A-Za-z0-9_]+)\/status/i.exec(url);
  if (m) out.handle = "@" + m[1];
  if (!og) return out;
  const title = String(og.title || "").trim();
  let r;
  if ((r = /^(.*?)\s*\(@([A-Za-z0-9_]+)\)\s+on (X|Twitter)$/.exec(title))) out.author = r[1];
  else if ((r = /^(.*?) on (X|Twitter): [“"](.*)[”"]\s*\/\s*(X|Twitter)$/s.exec(title))) { out.author = r[1]; out.text = r[3]; }
  if (!out.text) out.text = String(og.description || "").trim();
  return out;
}

/* ── 1 行 ⇄ 1 件 ─────────────────────────────────────── */
export function toItem(r) {
  const p = r.props && typeof r.props === "object" ? r.props : {};
  return {
    id: r.id,
    table: r.table_id || null,
    title: r.title || "",
    titleAuto: r.title_auto === true,
    body: r.body || "",
    excerpt: r.excerpt || "",
    author: r.author || "",
    handle: p.handle || hostOf(r.source_url),
    url: r.source_url || "",
    // YouTube で画像が無い行（パネルの前に保存したもの）は、動画のサムネを出す
    shot: p.shot || r.screenshot_url || p.ogImage || (ytId(r.source_url) ? ytThumb(ytId(r.source_url)) : ""),
    shotIsOg: !p.shot && !r.screenshot_url && (!!p.ogImage || !!ytId(r.source_url)),
    file: r.file_url ? { url: r.file_url, name: p.file_name || fileNameOf(r.file_url), pages: p.pages || "" } : null,
    shu: r.shu || "",
    ref: r.refs || [],
    genre: r.genres || [],
    tags: r.labels || [],
    star: r.grade || 0,
    a: { why: r.reason || "", hypo: r.an_hypo || "", idea: r.an_idea || "" },
    ai: !!r.ai_ask,
    hl: Array.isArray(r.highlights) ? r.highlights : [],
    used: Array.isArray(r.used_log) ? r.used_log : [],
    ex: p.ex || {},
    m: p.m || {},
    thread: Array.isArray(p.thread) ? p.thread : null,
    props: p,
    src: r.source_type || "",
    created: r.created_at,
    saved: shortDate(r.created_at),
  };
}

/** 画面で触れる欄だけを行の形に戻す（見出しの自動扱いは、直したときだけ外す） */
export function toPatch(it) {
  const props = { ...it.props, ex: it.ex, m: it.m };
  if (it.thread) props.thread = it.thread;
  const used = it.used || [];
  return {
    title: (it.title || "").trim() || "見出し未設定",
    ...(it.titleAuto === false ? { title_auto: false } : {}),
    body: it.body || null,
    author: it.author || null,
    source_url: it.url || null,
    table_id: it.table || null,
    file_url: it.file?.url || null,
    shu: it.shu || null,
    refs: it.ref,
    grade: it.star || 0,
    genres: it.genre,
    labels: it.tags,
    reason: it.a.why || "",
    an_hypo: it.a.hypo || "",
    an_idea: it.a.idea || "",
    ai_ask: !!it.ai,
    highlights: it.hl,
    used_log: used,
    status: used.length ? "活用済" : "未活用",
    used_in: used.length ? used[0].w : null,
    props,
  };
}

/* ── 読み書き ─────────────────────────────────────────── */
export async function loadItems() {
  const rows = await run(
    supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(5000),
    "スワイプを読み込めませんでした",
  );
  return (rows ?? []).map(toItem);
}

export async function saveItem(it) {
  await run(supabase.from(TABLE).update(toPatch(it)).eq("id", it.id).select("id"), "保存できませんでした");
}

export async function deleteItem(id) {
  await run(supabase.from(TABLE).delete().eq("id", id).select("id"), "消せませんでした");
}

export async function loadSettings() {
  const rows = await run(supabase.from(SETTINGS_TABLE).select("data"), "設定を読み込めませんでした");
  return rows?.[0]?.data ?? null;
}

export async function saveSettings(data) {
  await run(
    supabase.from(SETTINGS_TABLE).upsert({ data, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select("user_id"),
    "設定を保存できませんでした",
  );
}

export async function fetchOgp(url) {
  try {
    const res = await fetch("/api/ogp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const j = await res.json();
    return j?.fetched ? j : null;
  } catch { return null; }
}

export async function uploadFile(file) {
  const user = auth.currentUser;
  if (!user) throw new Error("ログイン状態を確認できませんでした。ページを再読み込みしてください");
  const token = await user.getIdToken();
  const ext = (file.type === "application/pdf" ? "pdf" : (file.type.split("/")[1] || "png").replace("jpeg", "jpg"));
  const name = file.name && /\.[a-z0-9]+$/i.test(file.name) ? file.name : `paste.${ext}`;
  const res = await fetch(`/api/storage/upload?bucket=${BUCKET}&name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.path) throw new Error([j.message, j.hint].filter(Boolean).join(" ") || "ファイルを上げられませんでした");
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${j.path}`;
}

/**
 * 新しく 1 件足す。見出しは titling.js の規則で 1 つに決める（MCP と同じ規則）。
 * @param {{url,title,body,why,table,file,ogp}} f file は { kind:"img"|"pdf", url, name }
 */
export async function createItem(f) {
  const url = (f.url || "").trim();
  const body = (f.body || "").trim();
  const isPdf = f.file?.kind === "pdf";
  const src = detectSourceType(url, { hasBody: !!body, isPdf });
  let og = f.ogp || null;
  // X の題名は「名前 (@id) on X」でポストの中身ではない。本文は説明文の側に入っているので、そちらを使う
  const x = src === "X" ? fromXCard(og, url) : null;
  if (x) og = { ...og, title: "", description: "", author: x.author || og?.author };
  const text = body || x?.text || "";
  const t = deriveTitle({ manualTitle: f.title || "", pageTitle: og?.title || "", body: text, fileName: f.file?.name || "" });
  const props = { ...(f.props || {}) };
  if (x?.handle && !props.handle) props.handle = x.handle;
  if (f.file?.kind === "img") props.shot = f.file.url;
  if (isPdf) props.file_name = f.file.name;
  if (og?.image) props.ogImage = og.image;
  const row = {
    source_url: url || null,
    title: t.title,
    title_auto: t.auto,
    body: text || null,
    reason: (f.why || "").trim(),
    source_type: src,
    author: f.author || og?.author || null,
    excerpt: deriveExcerpt({ pageDescription: og?.description || "", body: text }) || null,
    status: "未活用",
    visibility: "private",
    table_id: f.table || null,
    shu: f.shu || shuFromSource(src) || null,
    refs: f.refs || [],
    grade: f.grade || 0,
    file_url: isPdf ? f.file.url : null,
    props,
  };
  const data = await run(supabase.from(TABLE).insert(row).select().single(), "保存できませんでした");
  return toItem(data);
}

/* ── 素材パックと共有ページ（3便目） ───────────────────────── */
export const PACKS_TABLE = "sw_packs";
export const SHARES_TABLE = "sw_shares";
// 表がまだ無い（作業 27 の前）ときは、画面を止めずに空のまま出す
const missingTable = e => /does not exist|relation .* not exist|Could not find the table|42P01|PGRST205/i.test(String(e?.message || e?.code || ""));

export const toPack = r => ({
  id: r.id, table: r.table_id || null, name: r.name || "", make: r.make || "", goal: r.goal || "",
  items: Array.isArray(r.items) ? r.items.filter(x => typeof x === "string") : [],
  upd: shortDate(r.updated_at || r.created_at), updated: r.updated_at,
});
const packPatch = p => ({ table_id: p.table || null, name: (p.name || "").trim() || "名前のない素材パック", make: p.make || "", goal: p.goal || "", items: p.items, updated_at: new Date().toISOString() });

export const toShare = r => ({
  id: r.id, table: r.table_id || null, token: r.token, name: r.name || "", intro: r.intro || "",
  items: (Array.isArray(r.items) ? r.items : []).filter(x => x && typeof x.id === "string").map(x => ({ id: x.id, c: x.c || "" })),
  showHypo: !!r.show_hypo, showIdea: !!r.show_idea, showFile: !!r.show_file,
  live: r.live !== false, expire: r.expire_at || "",
  cta: r.cta !== false, ctaText: r.cta_text || "", ctaBtn: r.cta_btn || "", ctaUrl: r.cta_url || "",
  opens: r.opens || 0, last: r.last_opened_at ? shortDate(r.last_opened_at) : "",
  upd: shortDate(r.updated_at || r.created_at), updated: r.updated_at,
});
const sharePatch = s => ({
  table_id: s.table || null, name: (s.name || "").trim() || "名前のない共有ページ", intro: s.intro || "", items: s.items,
  show_hypo: !!s.showHypo, show_idea: !!s.showIdea, show_file: !!s.showFile,
  live: !!s.live, expire_at: s.expire || null,
  cta: !!s.cta, cta_text: s.ctaText || "", cta_btn: s.ctaBtn || "", cta_url: (s.ctaUrl || "").trim(),
  updated_at: new Date().toISOString(),
});

async function loadOr(table, map, label) {
  const { data, error } = await supabase.from(table).select("*").order("updated_at", { ascending: false }).limit(2000);
  if (error) { if (missingTable(error)) return { rows: [], missing: true }; throw new Error(toJapanese(error, `${label}を読み込めませんでした`)); }
  return { rows: (data ?? []).map(map), missing: false };
}
export const loadPacks = () => loadOr(PACKS_TABLE, toPack, "素材パック");
export const loadShares = () => loadOr(SHARES_TABLE, toShare, "共有ページ");

export async function createPack(f) {
  const row = { table_id: f.table || null, name: f.name || "新しい素材パック", make: f.make || "", goal: f.goal || "", items: f.items || [] };
  return toPack(await run(supabase.from(PACKS_TABLE).insert(row).select().single(), "素材パックを作れませんでした"));
}
export const savePack = p => run(supabase.from(PACKS_TABLE).update(packPatch(p)).eq("id", p.id).select("id"), "素材パックを保存できませんでした");
export const deletePack = id => run(supabase.from(PACKS_TABLE).delete().eq("id", id).select("id"), "素材パックを消せませんでした");

export async function createShare(f) {
  const row = { table_id: f.table || null, name: f.name || "新しい共有ページ", items: f.items || [] };
  return toShare(await run(supabase.from(SHARES_TABLE).insert(row).select().single(), "共有ページを作れませんでした"));
}
export const saveShare = s => run(supabase.from(SHARES_TABLE).update(sharePatch(s)).eq("id", s.id).select("id"), "共有ページを保存できませんでした");
export const deleteShare = id => run(supabase.from(SHARES_TABLE).delete().eq("id", id).select("id"), "共有ページを消せませんでした");

/* ── 4便目：ファイルを置き場から消す・同じものの見分け ─────────── */
/** 消したスワイプのファイルを置き場からも消す（ほかの行が使っているものは残す）。失敗しても止めない */
export async function removeFiles(urls) {
  const list = urls.filter(u => u && u.startsWith(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/shots/`));
  if (!list.length) return;
  const user = auth.currentUser; if (!user) return;
  const token = await user.getIdToken();
  await fetch("/api/storage/remove", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ urls: list }) }).catch(() => {});
}

/** 同じものかを見分ける鍵。X はポストの番号、ほかは住所の余計な部分（http・www・末尾の /・?・#）を外したもの */
export function sameKey(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  const x = /(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i.exec(u);
  if (x) return "x:" + x[1];
  const y = ytId(u);
  if (y) return "yt:" + y; // youtu.be と watch?v= を同じ動画として見る（? を外すと全部の動画が同じになるため）
  return u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}
export const findSame = (items, url) => { const k = sameKey(url); return k ? items.find(it => sameKey(it.url) === k) : null; };
