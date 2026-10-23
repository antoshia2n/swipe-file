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
export const monthTableId = iso => { const p = jstParts(iso); return `x-${p.y}-${p.m}`; };

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
    shot: p.shot || r.screenshot_url || p.ogImage || "",
    shotIsOg: !p.shot && !r.screenshot_url && !!p.ogImage,
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
  const og = f.ogp || null;
  const t = deriveTitle({ manualTitle: f.title || "", pageTitle: og?.title || "", body, fileName: f.file?.name || "" });
  const props = {};
  if (f.file?.kind === "img") props.shot = f.file.url;
  if (isPdf) props.file_name = f.file.name;
  if (og?.image) props.ogImage = og.image;
  const row = {
    source_url: url || null,
    title: t.title,
    title_auto: t.auto,
    body: body || null,
    reason: (f.why || "").trim(),
    source_type: src,
    author: og?.author || null,
    excerpt: deriveExcerpt({ pageDescription: og?.description || "", body }) || null,
    status: "未活用",
    visibility: "private",
    table_id: f.table || null,
    shu: f.shu || shuFromSource(src) || null,
    file_url: isPdf ? f.file.url : null,
    props,
  };
  const data = await run(supabase.from(TABLE).insert(row).select().single(), "保存できませんでした");
  return toItem(data);
}
