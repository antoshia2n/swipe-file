/**
 * スワイプくんの画面（デモ 8 の形をそのまま本物のデータで動かす）。
 * 並び：上の帯｜左のメニュー（フォルダと表）｜表のタブ → ビューのタブ → 中身｜右から出るくわしくの窓。
 * 色と字は思考整理くんにそろえる。React は使わず、1 つの描き直し関数で全体を描く。
 *
 * 上の帯の切り替えで、スワイプ／素材パック／共有ページ（3便目・coll.js）を行き来する。
 */
import * as D from "./data.js";
import { createColl, DEFAULT_COLL } from "./coll.js";
import { loadPdf } from "./pdfpages.js";
import { mountAppShell } from "shia2n-core";
import { makeTours } from "./tours.js";

/* ── 決まった値 ───────────────────────────────────────── */
const GRADE = { 5: "S", 4: "A", 3: "B", 2: "C", 1: "D" };
const STAGES = ["未分析", "言語化", "仮説", "用途抽出"];
const KINDC = { x: "var(--k-x)", note: "var(--k-note)", lp: "var(--k-lp)", doc: "var(--k-doc)" };
const COLS = { shu: "種類", grade: "評価", genre: "ジャンル", stage: "分析", tags: "ラベル", place: "場所", metric: "数字（保存時）", shares: "共有ページ", used: "使った", saved: "保存" };
const EXF = { "ポスト": ["投稿日", "いいね", "RT", "表示"], "記事": ["媒体", "価格", "スキ"], "教材": ["ページ数", "章の数", "価格"], "販売ページ": ["価格", "特典", "保証"] };
const LABEL_KEYS = { shu: "種類", genre: "ジャンル", tag: "ラベル" };

/* 初期設定（新しく使い始める人だけに効く。保存済みの人は自分の設定のまま）。2026-10-27 に Naoki 専用の中身を外し、生徒向けにした（Naoki 21:05 OK） */
export const DEFAULT_SETTINGS = () => ({
  v: 1,
  folders: [
    { id: "f-x", name: "Xポスト", parent: null },
    { id: "f-note", name: "note", parent: null },
    { id: "f-lp", name: "販売ページ・教材", parent: null },
    { id: "f-mine", name: "自分の資料", parent: null },
  ],
  tables: [
    { id: "t-note", name: "記事", folder: "f-note" },
    { id: "t-lp-page", name: "販売ページ", folder: "f-lp" },
    { id: "t-lp-pdf", name: "教材PDF", folder: "f-lp" },
    { id: "t-mine-own", name: "自分の投稿", folder: "f-mine" }, // 伸びた自分の投稿や、型にしたい自分の文を置く
  ],
  views: [
    { id: "v1", name: "表", type: "table", f: {} },
    { id: "v2", name: "ギャラリー", type: "gal", f: {} },
    { id: "v3", name: "分析の段", type: "board", group: "stage", f: {} },
    { id: "v4", name: "ラベルごと", type: "board", group: "tag", f: {} },
    { id: "v5", name: "A 以上", type: "table", f: { star: 4 } },
    { id: "v6", name: "未分析", type: "table", f: { todo: true } },
  ],
  cols: ["shu", "grade", "genre", "stage", "tags", "used", "metric", "saved"],
  labels: {
    shu: ["ポスト", "記事", "教材", "販売ページ"],
    genre: ["自己啓発", "X集客", "ライティング", "言語化", "マーケ", "習慣", "思考"],
    // 2026-10-30：参考ポイント（構文・内容・セールスの流れ・実績の見せ方）をラベルに統一した
    tag: ["構文", "内容", "セールスの流れ", "実績の見せ方", "書き出し", "締め", "図解", "スレッド", "自己開示", "顧客の声", "数字"],
  },
  coll: DEFAULT_COLL(),
});

// シアニン共通のアイコン（プロジェクト資料 claude/icon-rules.md の形・スワイプくんの色と絵）
const BRAND_ICON = '<svg class="brand-i" width="22" height="22" viewBox="0 0 128 128" aria-hidden="true"><defs><clipPath id="bic"><path d="M44 0H114A14 14 0 0 1 128 14V84A44 44 0 0 1 84 128H14A14 14 0 0 1 0 114V44A44 44 0 0 1 44 0Z"/></clipPath><mask id="bim"><rect width="128" height="128" fill="#fff"/><g fill="#000"><circle cx="132" cy="40" r="19"/><circle cx="-4" cy="90" r="19"/></g></mask></defs><g mask="url(#bim)"><g clip-path="url(#bic)"><rect width="128" height="128" fill="#2563eb"/><path d="M0 128V58C34 58 40 82 64 82S94 104 128 104V128Z" fill="#000" fill-opacity=".22"/></g><g transform="translate(14 14) scale(4.17)" fill="none" stroke="#fff" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12v17l-6-4.2-6 4.2z"/><path d="M9.5 8.5h5M9.5 12h5"/></g></g></svg>';
const F_NAME = { shu: "種類", star: "評価", genre: "ジャンル", stagex: "分析", tag: "ラベル" };
const isPhone = () => matchMedia("(max-width: 640px)").matches;

/* ── 小さな道具 ───────────────────────────────────────── */
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
const uniq = a => [...new Set(a.filter(Boolean))];
const colorOf = h => { const cs = ["var(--k-x)", "var(--k-note)", "var(--k-lp)", "var(--k-doc)", "var(--accent)", "var(--l-kata)"]; let n = 0; for (const ch of String(h || "")) n += ch.charCodeAt(0); return cs[n % cs.length]; };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 端末に残せなくても動く */ } },
};
const IC = {
  folder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  table: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></svg>',
  gal: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  board: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  up: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  menu: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  filter: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

/* ── 画面の起動 ───────────────────────────────────────── */
export function startApp(root) {
  let ITEMS = [];
  let CFG = DEFAULT_SETTINGS();
  const remembered = store.get("swipe.ui.v1", {});
  const S = {
    loading: true, err: "", scr: ["app", "pack", "share"].includes(remembered.scr) ? remembered.scr : "app",
    loc: remembered.loc || "all", table: remembered.table || null, view: remembered.view || "v1",
    q: "", f: {}, sel: new Set(), open: null, navOn: innerWidth > 860,
    colPop: false, fPop: false, cellPop: null, fold: new Set(), lb: null, dragCol: null, modal: null, add: null, delArm: false, bodyEdit: false, saving: 0,
  };

  root.innerHTML = `<div id="app">
    <div class="top gut">
      <div class="brand">${BRAND_ICON}<span class="brand-t">スワイプくん<span>.</span></span></div>
      <nav class="hm" aria-label="機能"><button data-scr="app">スワイプ</button><button data-scr="pack">素材パック</button><button data-scr="share">共有ページ</button></nav>
      <div class="top-r"><span class="lsub" id="saveState"></span><button class="ink" id="addBtn" aria-label="足す">＋<span class="add-t"> 足す</span></button><span class="shell-slot"></span></div>
    </div>
    <div class="screen" id="screen"></div>
  </div><div class="toast" id="toast" hidden></div>`;
  const $ = (s, el = root) => el.querySelector(s);
  const screen = $("#screen");

  /* 共通の外枠（右上：使い方・アプリ一覧・アカウント。2026-10-27 作業 59）。上の帯は描き直さないので置くのは 1 回だけ */
  try {
    const shellGo = name => {
      S.open = null; S.lb = null; S.cellPop = null; S.modal = null; S.add = null;
      if (name === "todo") { S.scr = "app"; S.loc = "todo"; S.f = {}; }
      else S.scr = name;
      render();
    };
    const shell = mountAppShell({
      appId: "swipe-file", appName: "スワイプくん",
      manual: {
        intro: "X のポスト・note・販売ページや教材など、参考になる見本を保存して、なぜ良いかを言語化しておくアプリ。分析は 言語化 → 仮説 → 用途抽出 の 3 段で書きます。",
        sections: [
          { title: "足す", items: [
            { t: "スワイプを足す", d: "右上の「＋ 足す」から。リンク・本文・画像か PDF のどれか 1 つがあれば保存できます。見出しは空ならリンク先の題名か本文の書き出しから付きます" },
            { t: "画像や PDF を入れる", d: "足す窓に落とすか、貼り付けます（⌘／Ctrl＋V）", keys: ["⌘／Ctrl＋V"] },
            { t: "置き場", d: "既定は自動です（X と YouTube は今月の表・note は記事・PDF は教材PDF・ほかは開いている表）。同じリンクがもう保存されていたら知らせます" },
          ] },
          { title: "探す・絞る", items: [
            { t: "左のメニュー", d: "すべて・未分析・フォルダから選びます。フォルダは「＋」で足せます" },
            { t: "探す", d: "上の欄で、本文・分析・投稿者の言葉で探します" },
            { t: "絞り込み", d: "種類・ラベル・評価・ジャンル・分析で絞ります。「＋ ビュー」で、いまの絞り込みをビューとして残せます" },
          ] },
          { title: "見え方", items: [
            { t: "ビューのタブ", d: "表・ギャラリー・分析の段・ラベルごと などを切り替えます" },
          ] },
          { title: "くわしくの窓", items: [
            { t: "開く", d: "行やカードを押すと右に開きます。開いている間は j と k（↓ と ↑）で前後へ移れます", keys: ["j", "k"] },
            { t: "画像・PDF を大きく見る", d: "画像や PDF を大きく開き、「囲んで印を付ける」を入れてなぞると、見てほしい所に印が付きます" },
          ] },
          { title: "分析", items: [
            { t: "3 段で書く", d: "言語化（なぜ良いか）→ 仮説（ほかでも効きそうな型）→ 用途抽出（どこで・どう使うか）。書いた段の数で「分析」の印が進みます" },
          ] },
          { title: "素材パック", items: [
            { t: "見本を集めて渡す", d: "上の帯の「素材パック」で、見本を集め、GPT や Claude に渡す文をコピーできます" },
          ] },
          { title: "共有ページ", items: [
            { t: "見本を並べたページ", d: "上の帯の「共有ページ」で、選んだスワイプを並べたページを作ります。ログインなしで見られる形で公開されるのは、シアニンが作ったページだけです" },
          ] },
          { title: "保存", items: [
            { t: "自動で保存", d: "書いて手を止めると保存されます。保存中は右上に「保存中…」と出ます" },
          ] },
        ],
      },
      keys: [["くわしくの窓", "j ／ k", "次へ／前へ"], ["窓", "Esc", "閉じる"], ["足す窓", "⌘／Ctrl＋V", "画像や PDF を貼り付ける"]],
      tours: makeTours({ go: shellGo }),
    });
    shell.attach(root.querySelector(".shell-slot"));
  } catch (_) { /* 外枠が出せなくてもアプリは動かす */ }
  /* ── YouTube の埋め込み（5便目） ─────────────────────────
     画面は描き直すたびに中身を作り直す。動画の枠まで作り直すと再生が止まるので、
     描き直しの間だけ外の置き場へ移して戻す（moveBefore なら再生したまま移せる） */
  const ytHold = document.createElement("div"); ytHold.hidden = true; document.body.appendChild(ytHold);
  const mv = (parent, el) => (parent.moveBefore ? parent.moveBefore(el, null) : parent.appendChild(el));
  let ytT = -1; // いま再生している位置（秒）
  const ytPost = msg => screen.querySelector("#ytf")?.contentWindow?.postMessage(JSON.stringify(msg), "*");
  const ytCmd = (func, args = []) => ytPost({ event: "command", func, args });
  function mountYt(old) {
    const slot = screen.querySelector("#ytslot");
    if (!slot) { old?.remove(); return; }
    if (old && old.dataset.v === slot.dataset.v) { mv(slot, old); return; }
    old?.remove(); ytT = -1;
    const v = slot.dataset.v;
    slot.innerHTML = `<iframe id="ytf" data-v="${esc(v)}" src="https://www.youtube.com/embed/${encodeURIComponent(v)}?enablejsapi=1&rel=0&playsinline=1&origin=${encodeURIComponent(location.origin)}" title="YouTube の動画" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    slot.firstElementChild.addEventListener("load", () => ytPost({ event: "listening", id: "ytf", channel: "widget" }));
  }
  function markNow(follow) {
    const box = screen.querySelector("#bodyText.tr"); if (!box) return;
    let cur = null;
    for (const l of box.querySelectorAll(".ln")) { if (+l.dataset.s <= ytT + 0.3) cur = l; else break; }
    const was = box.querySelector(".ln.now");
    if (was === cur) return;
    was?.classList.remove("now"); cur?.classList.add("now");
    // なぞっている途中は動かさない
    if (follow && cur && (getSelection()?.isCollapsed ?? true)) box.scrollTop = cur.offsetTop - box.offsetTop - 8;
  }
  function onYtMsg(e) {
    if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
    let d; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
    const t = d?.info?.currentTime; if (typeof t !== "number") return;
    ytT = t; markNow(true);
  }
  addEventListener("message", onYtMsg);

  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3200); }
  function toastUndo(msg) { const t = $("#toast"); t.innerHTML = `<span>${esc(msg)}</span><button id="toastUndo" class="tundo">元に戻す</button>`; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 6000); }
  function remember() { store.set("swipe.ui.v1", { scr: S.scr, loc: S.loc, table: S.table, view: S.view }); }
  function setSaving(d) { S.saving += d; const el = $("#saveState"); if (el) el.textContent = S.saving > 0 ? "保存中…" : ""; }

  /* ── 保存（打つたびに送らず、少し待ってまとめて送る） ── */
  const timers = new Map();
  function queueSave(it, wait = 700) {
    clearTimeout(timers.get(it.id));
    timers.set(it.id, setTimeout(async () => {
      timers.delete(it.id); setSaving(1);
      try { await D.saveItem(it); } catch (e) { toast(e.message); } finally { setSaving(-1); }
    }, wait));
  }
  let cfgTimer = null;
  function saveCfg() {
    clearTimeout(cfgTimer);
    cfgTimer = setTimeout(async () => { setSaving(1); try { await D.saveSettings(CFG); } catch (e) { toast(e.message); } finally { setSaving(-1); } }, 500);
  }
  addEventListener("beforeunload", e => { if (timers.size || S.saving > 0 || pendingDel || coll?.pending()) { e.preventDefault(); e.returnValue = ""; } });

  /* ── フォルダと表 ───────────────────────────────────── */
  const tableOf = id => CFG.tables.find(t => t.id === id);
  const folderOf = id => CFG.folders.find(f => f.id === id);
  const pathOf = tid => { const t = tableOf(tid); if (!t) return ["未整理"]; const p = []; let f = folderOf(t.folder); while (f) { p.unshift(f.name); f = folderOf(f.parent); } return [...p, t.name]; };
  const tablesIn = fid => { const out = CFG.tables.filter(t => t.folder === fid); CFG.folders.filter(f => f.parent === fid).forEach(f => out.push(...tablesIn(f.id))); return out; };
  const rootOf = tid => { const t = tableOf(tid); let f = t && folderOf(t.folder); while (f && f.parent) f = folderOf(f.parent); return f?.id || ""; };
  const kindOf = it => { const r = rootOf(it.table); if (r === "f-mine") return "doc"; if (it.shu === "ポスト" || r === "f-x") return "x"; if (it.shu === "記事" || r === "f-note") return "note"; return "lp"; };
  const unsorted = () => ITEMS.filter(it => !tableOf(it.table));

  /** 月の表（X は x-2026-10、YouTube は yt-2026-10）が無ければ、年のフォルダと一緒に作る */
  const MONTH_ROOT = { x: { id: "f-x", name: "Xポスト" }, yt: { id: "f-yt", name: "YouTube" } };
  function ensureMonth(tid) {
    const m = /^(x|yt)-(\d{4})-(\d{2})$/.exec(tid || "");
    if (!m || tableOf(tid)) return false;
    const [, k, y, mo] = m, R = MONTH_ROOT[k], fid = `${R.id}-${y}`;
    if (!folderOf(R.id)) { if (k === "x") CFG.folders.unshift({ id: R.id, name: R.name, parent: null }); else CFG.folders.push({ id: R.id, name: R.name, parent: null }); }
    if (!folderOf(fid)) CFG.folders.push({ id: fid, name: `${y}年`, parent: R.id });
    CFG.tables.push({ id: tid, name: `${+mo}月`, folder: fid });
    const same = (a, b, re) => re.test(a.id) && re.test(b.id);
    CFG.tables.sort((a, b) => (same(a, b, /^x-/) || same(a, b, /^yt-/) ? b.id.localeCompare(a.id) : 0));
    CFG.folders.sort((a, b) => (same(a, b, /^f-x-/) || same(a, b, /^f-yt-/) ? b.id.localeCompare(a.id) : 0));
    return true;
  }
  const labelList = key => {
    const fromItems = key === "shu" ? ITEMS.map(i => i.shu) : ITEMS.flatMap(i => key === "genre" ? i.genre : i.tags);
    return key === "tag" ? D.uniqLabels([...(CFG.labels[key] || []), ...fromItems]) : uniq([...(CFG.labels[key] || []), ...fromItems]);
  };
  /* ラベルを足すときの重複よけ（2026-10-30）：同じものは今あるほうを使う。似た名前は足す前に確かめる */
  function pickLabel(key, raw) {
    const v = String(raw).normalize("NFKC").replace(/\s+/g, " ").trim(); if (!v) return null;
    const list = labelList(key); const k = D.labelKey(v);
    const same = list.find(x => D.labelKey(x) === k);
    if (same) { toast(`「${same}」がもうあるので、それを使いました`); return same; }
    const near = list.filter(x => { const xk = D.labelKey(x); return Math.min(xk.length, k.length) >= 2 && (xk.includes(k) || k.includes(xk)); });
    if (near.length && !confirm(`「${near.join("」「")}」と似ています。別のラベルとして「${v}」を足しますか？\n（キャンセルで足さない）`)) return null;
    return v;
  }

  /* ── 絞り込み ───────────────────────────────────────── */
  const stageOf = it => ["why", "hypo", "idea"].filter(k => (it.a[k] || "").trim()).length;
  function scope() {
    const l = S.loc;
    if (l === "all") return ITEMS.slice();
    if (l === "ai") return ITEMS.filter(it => it.ai);
    if (l === "unsorted") return unsorted();
    if (l.startsWith("f:")) return ITEMS.filter(it => it.table === S.table);
    return [];
  }
  const curView = () => CFG.views.find(v => v.id === S.view) || CFG.views[0];
  const matchQ = (it, q) => [it.title, it.body, it.excerpt, it.author, it.handle, it.a.why, it.a.hypo, it.a.idea, it.tags.join(" "), it.genre.join(" "), it.shu, it.file?.name || "", it.url].join("\n").toLowerCase().includes(q);
  function labelFilter(a, f) {
    if (f.shu) a = a.filter(it => it.shu === f.shu);
    if (f.ref) a = a.filter(it => it.tags.includes(f.ref));
    if (f.genre) a = a.filter(it => it.genre.includes(f.genre));
    if (f.stagex !== undefined && f.stagex !== "") a = a.filter(it => stageOf(it) === +f.stagex);
    if (f.tag) a = a.filter(it => it.tags.includes(f.tag));
    if (f.star) a = a.filter(it => (it.star || 0) >= f.star);
    return a;
  }
  function filtered() {
    const v = curView(), f = { ...v.f, ...S.f };
    let a = scope();
    if (f.todo) a = a.filter(it => stageOf(it) === 0);
    a = labelFilter(a, f);
    if (S.q.trim()) { const q = S.q.trim().toLowerCase(); a = a.filter(it => matchQ(it, q)); }
    return a.sort((x, y) => String(y.created).localeCompare(String(x.created)));
  }

  /* ── 部品の HTML ───────────────────────────────────── */
  function gradeHTML(it, ro) {
    const g = it.star || 0;
    if (ro) return g ? `<span class="gchip g${g}">${GRADE[g]}</span>` : "";
    return `<select class="grade g${g}" data-grade="${it.id}" aria-label="評価">${["", 5, 4, 3, 2, 1].map(v => `<option value="${v}" ${String(v) === String(g || "") ? "selected" : ""}>${v ? GRADE[v] : "―"}</option>`).join("")}</select>`;
  }
  const stageHTML = it => { const n = stageOf(it); return `<span class="stage ${n ? "" : "none"}">${STAGES[n]}</span>`; };
  const chipsHTML = (arr, c, max = 2) => arr.length ? `<div class="chips">${arr.slice(0, max).map(x => `<span class="chip" style="--c:${c}">${esc(x)}</span>`).join("")}${arr.length > max ? `<span class="chip">+${arr.length - max}</span>` : ""}</div>` : '<span class="ecell"></span>';
  const metricOf = it => { const m = it.m || {}, e = it.ex || {}; const v = m.view || e["表示"]; if (v) return `表示 ${v}`; return m.like || e["いいね"] || e["スキ"] || "―"; };
  function shotHTML(it, big) {
    if (it.shot) return `<div class="shot img"><span class="shot-tag">${it.shotIsOg ? "リンク先の画像" : "保存した画像"}</span><img src="${esc(it.shot)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`;
    if (it.file && /\.pdf($|\?)/i.test(it.file.url)) return `<div class="shot pdf"><span class="shot-tag">PDF</span><div class="pdf-p"><i class="h"></i><i></i><i></i><i style="width:70%"></i><i></i></div><div class="pdf-p"><i class="h"></i><i></i><i style="width:60%"></i><i></i><i></i></div>${it.file.pages ? `<div class="pdf-meta" style="align-self:flex-end;white-space:nowrap">${esc(it.file.pages)} ページ</div>` : ""}</div>`;
    const k = kindOf(it);
    const text = it.body || it.excerpt;
    if (k === "x" && (text || it.thread)) {
      const m = it.m || {};
      const name = it.author || it.handle || "X";
      const head = `<div class="xs-h"><div class="av" style="--c:${colorOf(it.handle)}">${esc(name.slice(0, 1))}</div><div><div class="xs-n">${esc(name)}</div><div class="xs-u">${esc(it.handle)}</div></div></div>`;
      const tag = it.thread ? `スレッド ${it.thread.length} 件` : "本文の写し";
      const parts = it.thread ? (big ? it.thread : it.thread.slice(0, 2)).map((p, i) => `${i ? '<div class="thsep"></div>' : ""}<div class="xs-b">${esc(p)}</div>`).join("") + (!big && it.thread.length > 2 ? `<div class="xs-u">… ほか ${it.thread.length - 2} 件</div>` : "") : `<div class="xs-b">${esc(big ? text : text.slice(0, 160))}</div>`;
      const ms = [m.like && `いいね ${m.like}`, m.rt && `RT ${m.rt}`, m.view && `表示 ${m.view}`].filter(Boolean);
      return `<div class="shot xs"><span class="shot-tag">${tag}</span>${head}${parts}${ms.length ? `<div class="xs-m">${ms.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}</div>`;
    }
    return `<div class="shot ps" style="--c:${KINDC[k]}"><span class="shot-tag">画像なし</span><div class="ps-h"></div><div class="ps-l"></div><div class="ps-l" style="width:85%"></div><div class="ps-b"></div><div class="ps-l"></div></div>`;
  }

  /* ── 左のメニュー ───────────────────────────────────── */
  function navHTML() {
    const cnt = f => ITEMS.filter(f).length;
    const nv = (key, label, n, opts = {}) => `<button class="nv ${S.loc === key ? "on" : ""} ${opts.cls || ""}" data-loc="${key}">${opts.icon || `<span class="nv-dot" style="--c:${opts.c || "var(--faint)"}"></span>`}<span class="nv-l">${esc(label)}</span><span class="nv-n">${n || ""}</span></button>`;
    const tree = (parent, depth) => CFG.folders.filter(f => f.parent === parent).map(f => {
      const n = tablesIn(f.id).reduce((s, t) => s + cnt(it => it.table === t.id), 0);
      return nv("f:" + f.id, f.name, n, { icon: IC.folder, cls: "d" + Math.min(depth, 2) }) + tree(f.id, depth + 1);
    }).join("");
    const un = unsorted().length;
    return `<nav class="nav ${S.navOn ? "" : "off"}" aria-label="メニュー"><div class="nav-list">
      ${nv("all", "すべて", ITEMS.length)}
      ${nv("todo", "未分析", cnt(it => stageOf(it) === 0), { c: "var(--accent)", cls: "warn" })}
      ${nv("ai", "Claude に頼んだ分析", cnt(it => it.ai), { c: "var(--k-doc)" })}
      ${un ? nv("unsorted", "未整理（置き場なし）", un, { c: "var(--k-lp)" }) : ""}
      <div class="nh"><span>フォルダ</span><button id="addFolder" aria-label="フォルダを足す" title="フォルダを足す">＋</button></div>
      ${tree(null, 0)}
    </div></nav>`;
  }

  /* ── 本体 ───────────────────────────────────────────── */
  function headHTML(crumb, title, lead) {
    return `<div><div class="crumb"><button class="icon navbtn" id="navBtn" aria-label="メニューを出す" style="width:24px;height:20px">${IC.menu}</button>${crumb.map(esc).join(" / ")}</div>
      <h1 class="ltitle">${esc(title)}</h1>${lead ? `<p class="lnote">${esc(lead)}</p>` : ""}</div>`;
  }
  function subfoldersHTML(fid) {
    const f = folderOf(fid), subs = CFG.folders.filter(x => x.parent === fid);
    return `<div class="wrap gut">${headHTML(["スワイプくん"], f.name, subs.length ? "この中のフォルダ。開くと、中の表がタブで横に並ぶ。" : "まだ表がありません。")}
      <div class="fcards">${subs.map(s => { const ts = tablesIn(s.id); return `<button class="fcard" data-loc="f:${s.id}"><div class="fc-t">${IC.folder}${esc(s.name)}</div>
        <div class="chips">${ts.map(t => `<span class="chip">${esc(t.name)}</span>`).join("")}</div>
        <div class="fc-s">表 ${ts.length} 枚・${ITEMS.filter(it => ts.some(t => t.id === it.table)).length} 件</div></button>`; }).join("")}
        <button class="fcard" id="addTable" data-folder="${esc(fid)}"><div class="fc-t">＋ 表を足す</div><div class="fc-s">このフォルダの直下に表を作る</div></button></div></div>`;
  }
  function labelSels(F, attr) {
    const sel = (key, label, opts) => `<select class="fsel ${F[key] !== undefined && F[key] !== "" && F[key] !== 0 ? "on" : ""}" data-${attr}="${key}" aria-label="${label}"><option value="">${label}</option>${opts.map(o => `<option value="${esc(o[0])}" ${String(F[key] ?? "") === String(o[0]) ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`;
    return sel("shu", "種類", labelList("shu").map(x => [x, x])) + sel("star", "評価", [[5, "S"], [4, "A 以上"], [3, "B 以上"]])
      + sel("genre", "ジャンル", labelList("genre").map(x => [x, x])) + sel("stagex", "分析", STAGES.map((x, i) => [i, x])) + sel("tag", "ラベル", labelList("tag").map(x => [x, x]));
  }
  function colPopHTML() {
    const all = [...CFG.cols, ...Object.keys(COLS).filter(k => !CFG.cols.includes(k))];
    return `<div class="colpop" role="dialog" aria-label="列の並び"><div class="cp-h">列の並びと表示（見出しのドラッグでも変えられる）</div>
      ${all.map(k => { const on = CFG.cols.includes(k); return `<div class="cp-r"><label><input type="checkbox" data-colshow="${k}" ${on ? "checked" : ""}>${esc(COLS[k])}</label>
        ${on ? `<button data-colmv="${k}:-1" aria-label="上へ">${IC.up}</button><button data-colmv="${k}:1" aria-label="下へ">${IC.down}</button>` : ""}</div>`; }).join("")}</div>`;
  }
  /* 表のセルをその場で直す（Notion のように押すと選べる窓が出る） */
  const FIELD_OF = { shu: "shu", genre: "genre", tag: "tags" };
  const cellPick = (it, key, inner) => `<button class="cellpick ${S.cellPop && S.cellPop.id === it.id && S.cellPop.key === key ? "on" : ""}" data-cp="${key}" data-id="${it.id}" aria-label="${LABEL_KEYS[key]}を直す">${inner}</button>`;
  function cellPopHTML() {
    const P = S.cellPop; if (!P) return "";
    const it = ITEMS.find(x => x.id === P.id); if (!it) return "";
    const field = FIELD_OF[P.key];
    const has = v => P.key === "shu" ? it.shu === v : it[field].includes(v);
    return `<div class="cpop" id="cpop" role="dialog" aria-label="${LABEL_KEYS[P.key]}"><div class="cp-h">${LABEL_KEYS[P.key]}${P.key === "shu" ? "（1 つ選ぶ）" : "（いくつでも）"}</div>
      <div class="pick">${labelList(P.key).map(v => `<button class="pk ${has(v) ? "on" : ""}" data-cpv="${esc(v)}">${esc(v)}</button>`).join("")}<button class="pk" data-newlabel="${P.key}" data-for="${it.id}" title="選べる値を足す">＋</button></div></div>`;
  }
  function placeCellPop() {
    const pop = document.getElementById("cpop"); if (!pop || !S.cellPop) return;
    const sel = `[data-cp="${S.cellPop.key}"][data-id="${S.cellPop.id}"]`;
    const btn = (S.open && screen.querySelector(`.detail ${sel}`)) || screen.querySelector(sel);
    if (!btn) { pop.remove(); return; }
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    const top = r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    pop.style.left = left + "px"; pop.style.top = top + "px";
  }
  function cellHTML(k, it) {
    switch (k) {
      case "grade": return gradeHTML(it);
      case "shu": return cellPick(it, "shu", it.shu ? `<span class="chip" style="--c:var(--k-doc)">${esc(it.shu)}</span>` : '<span class="ecell"></span>');
      case "genre": return cellPick(it, "genre", chipsHTML(it.genre, "var(--l-yoto)"));
      case "stage": return stageHTML(it);
      case "place": return `<span class="num">${esc(pathOf(it.table).join(" / "))}</span>`;
      case "metric": { const v = metricOf(it); return v === "―" ? "" : `<span class="num">${esc(v)}</span>`; }
      case "tags": return cellPick(it, "tag", chipsHTML(it.tags, "var(--faint)", 1));
      case "saved": return `<span class="num">${esc(it.saved)}</span>`;
      case "used": return it.used.length ? `<span class="num">${it.used.length} 回</span>` : "";
      case "shares": { const sh = coll.memberOf("share", it.id); return sh.length ? `<div class="chips">${sh.slice(0, 2).map(v => `<span class="chip" style="--c:var(--accent)">${esc(v.name)}</span>`).join("")}${sh.length > 2 ? `<span class="chip">+${sh.length - 2}</span>` : ""}</div>` : ""; }
      default: return "";
    }
  }
  function tableHTML(a) {
    const base = CFG.cols.filter(k => COLS[k]);
    const cols = S.loc.startsWith("f:") ? base : (base.includes("place") ? base : [...base.slice(0, 4), "place", ...base.slice(4)]);
    return `<div class="card"><div class="tw"><table><thead><tr><th style="width:36px"></th><th>見出し</th>${cols.map(k => `<th class="dragc" draggable="true" data-col="${k}">${esc(COLS[k])}</th>`).join("")}</tr></thead><tbody>
    ${a.map(it => `<tr class="${S.sel.has(it.id) ? "sel" : ""}">
      <td><input type="checkbox" class="ck" data-ck="${it.id}" ${S.sel.has(it.id) ? "checked" : ""} aria-label="選ぶ"></td>
      <td><button class="namebtn ${it.shot ? "withi" : ""}" data-open="${it.id}">${it.shot ? `<img class="ti" src="${esc(it.shot)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="nmw"><span class="nm">${esc(it.title)}</span><span class="snip">${esc(it.a.why || it.excerpt || it.body.slice(0, 120))}</span></span></button></td>
      ${cols.map(k => `<td>${cellHTML(k, it)}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div></div>`;
  }
  // 画像が無いものは、本文の書き出しと言語化を見せる文字のカード（同じ箱を並べない）
  function textCardHTML(it) {
    const k = kindOf(it), text = (it.body || it.excerpt || "").trim();
    const who = [it.author, it.handle].filter(Boolean).join("・");
    return `<div class="tcard" style="--c:${KINDC[k]}"><span class="tc-k">${esc(it.shu || "種類なし")}${who ? `・${esc(who)}` : ""}</span>${text ? `<p class="tc-b">${esc(text.slice(0, 220))}${text.length > 220 ? "…" : ""}</p>` : it.file ? `<p class="tc-f">${IC.file}${esc(it.file.name || "ファイル")}</p>` : ""}</div>`;
  }
  const galHTML = it => `<button class="gcard" data-open="${it.id}">${it.shot ? shotHTML(it) : textCardHTML(it)}<div class="g-t">${esc(it.title)}</div>${it.a.why ? `<div class="g-why">${esc(it.a.why)}</div>` : ""}<div class="g-ft"><span class="chips">${gradeHTML(it, true)}${it.tags.slice(0, 2).map(x => `<span class="chip" style="--c:var(--faint)">${esc(x)}</span>`).join("")}</span>${stageHTML(it)}</div></button>`;
  // スマホの一覧：表ではなく 1 件 1 枚のカードを縦に並べる
  const mrowHTML = it => `<div class="mrow ${S.sel.has(it.id) ? "sel" : ""}"><input type="checkbox" class="ck" data-ck="${it.id}" ${S.sel.has(it.id) ? "checked" : ""} aria-label="選ぶ">
      <button class="mrow-b" data-open="${it.id}">${it.shot ? `<img class="mrow-i" src="${esc(it.shot)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="mrow-w"><span class="nm">${esc(it.title)}</span>${it.a.why || it.excerpt ? `<span class="snip">${esc(it.a.why || it.excerpt)}</span>` : ""}
        <span class="chips">${gradeHTML(it, true)}${it.shu ? `<span class="chip" style="--c:var(--k-doc)">${esc(it.shu)}</span>` : ""}${it.tags.slice(0, 2).map(x => `<span class="chip" style="--c:var(--faint)">${esc(x)}</span>`).join("")}${stageOf(it) ? "" : '<span class="stage none">未分析</span>'}</span>
        <span class="mrow-p">${esc(pathOf(it.table).join(" / "))}・${esc(it.saved)}</span></span></button></div>`;
  function boardHTML(a, group) {
    let cols;
    if (group === "stage") cols = STAGES.map((n, i) => [n, a.filter(it => stageOf(it) === i)]);
    else { cols = labelList("tag").map(k => [k, a.filter(it => it.tags.includes(k))]); cols.push(["ラベルが未設定", a.filter(it => !it.tags.length)]); }
    return `<div class="board">${cols.map(([n, its]) => `<div class="col"><div class="col-h">${esc(n)}<span class="n">${its.length}</span></div>
      ${its.map(it => `<button class="bcard" data-open="${it.id}"><span class="b-t">${esc(it.title)}</span><span class="g-ft">${gradeHTML(it, true)}<span class="num">${esc(pathOf(it.table).join(" / "))}</span></span></button>`).join("")}</div>`).join("")}</div>`;
  }
  function listHTML() {
    const l = S.loc, inFolder = l.startsWith("f:");
    let crumb = [], title, lead = "";
    if (inFolder) {
      const fid = l.slice(2); const ts = CFG.tables.filter(t => t.folder === fid);
      if (!ts.some(t => t.id === S.table)) S.table = ts[0].id;
      crumb = pathOf(S.table).slice(0, -2); title = folderOf(fid).name;
    } else if (l === "all") { title = curView().f.todo ? "未分析" : "すべて"; lead = curView().f.todo ? "保存はしたが分析が空のもの。" : ""; }
    else if (l === "ai") { title = "Claude に頼んだ分析"; lead = "印が付いたものは、次に Claude が道具で読んだときに、空いている段へ下書きを入れる。"; }
    else if (l === "unsorted") { title = "未整理（置き場なし）"; lead = "どの表にも入っていないもの。開いて「場所」から表を選ぶと、ここから消える。"; }
    const a = filtered(), v = curView(), f = { ...v.f, ...S.f };
    const tabs = inFolder ? `<div class="ttabs" role="tablist" aria-label="このフォルダの表">${CFG.tables.filter(t => t.folder === l.slice(2)).map(t =>
      `<button class="ttab ${t.id === S.table ? "on" : ""}" data-table="${t.id}" title="ダブルクリックで名前を変える">${esc(t.name)}<span class="n">${ITEMS.filter(it => it.table === t.id).length}</span></button>`).join("")}<button class="ttab add" id="addTable" data-folder="${esc(l.slice(2))}">＋ 表</button></div>` : "";
    const vtab = x => `<button class="vtab ${x.id === S.view ? "on" : ""}" data-view="${x.id}">${IC[x.type === "gal" ? "gal" : x.type === "board" ? "board" : "table"]}${esc(x.name)}</button>`;
    const anyF = Object.values(S.f).some(x => x !== "" && x !== undefined && x !== 0) || S.q;
    const fOn = Object.entries(S.f).filter(([, x]) => x !== "" && x !== undefined && x !== 0);
    const nF = fOn.length;
    const fVal = (k, x) => k === "star" ? (GRADE[x] + (+x < 5 ? " 以上" : "")) : k === "stagex" ? STAGES[x] : x;
    const fChips = fOn.map(([k, x]) => `<button class="fchip" data-frm="${k}" aria-label="${F_NAME[k]}の条件を外す">${F_NAME[k]}：${esc(fVal(k, x))}${IC.x}</button>`).join("");
    let content;
    if (S.loading) content = `<div class="card empty">読み込んでいます…</div>`;
    else if (S.err) content = `<div class="card empty">${esc(S.err)}<br><button class="ghost" id="reload" style="margin-top:10px">もう一度読む</button></div>`;
    else if (!a.length) content = `<div class="card empty">${ITEMS.length ? "当てはまるものはありません。<br>絞り込みを外すか、別のビューを選んでください。" : "まだ 1 件もありません。右上の「＋ 足す」から入れてください。"}</div>`;
    else if (v.type === "gal") content = `<div class="gal">${a.map(galHTML).join("")}</div>`;
    else if (v.type === "board") content = boardHTML(a, v.group);
    else content = isPhone() ? `<div class="mlist">${a.map(mrowHTML).join("")}</div>` : tableHTML(a);
    const colBtn = v.type === "table" ? `<span class="colbtn"><button class="ghost" id="colBtn" aria-expanded="${S.colPop}">列</button>${S.colPop ? colPopHTML() : ""}</span>` : "";
    const moveOpts = CFG.tables.map(t => `<option value="${t.id}">${esc(pathOf(t.id).join(" / "))}</option>`).join("");
    return `<div class="wrap gut">${headHTML(crumb, title, lead)}${tabs}
      <div class="vrow"><div class="vtabs" role="tablist" aria-label="ビュー">${CFG.views.map(vtab).join("")}<button class="vtab" id="addView">＋ ビュー</button></div>
        <label class="lq">${IC.search}<input id="q" placeholder="本文・分析・投稿者で探す" value="${esc(S.q)}" aria-label="探す"></label></div>
      <div class="frow"><span class="fwrap"><button class="ghost fbtn ${nF ? "on" : ""}" id="fBtn" aria-expanded="${S.fPop}">${IC.filter}絞り込み${nF ? ` <b>${nF}</b>` : ""}</button>${S.fPop ? `<div class="fpop" role="dialog" aria-label="絞り込み">${labelSels(S.f, "f")}</div>` : ""}</span>
        ${fChips}${anyF ? `<button class="fclear" id="fClear">外す</button>` : ""}<span class="lsub" style="margin-left:auto">${a.length} 件${f.star || f.todo ? `・ビュー「${esc(v.name)}」の条件つき` : ""}</span>${colBtn}</div>
      ${S.sel.size ? `<div class="bulk"><span>${S.sel.size} 件を選択中</span><select id="bulkMove" aria-label="移す先"><option value="">表へ移す…</option>${moveOpts}</select>
        <select id="bulkSet" aria-label="まとめて付ける"><option value="">まとめて付ける…</option>
          <option value="ai:1">Claude に分析を頼む</option>
          <optgroup label="評価">${[5, 4, 3, 2, 1].map(g => `<option value="grade:${g}">${GRADE[g]}</option>`).join("")}<option value="grade:0">評価を外す</option></optgroup>
          <optgroup label="種類">${labelList("shu").map(v => `<option value="shu:${esc(v)}">${esc(v)}</option>`).join("")}</optgroup>
          <optgroup label="ジャンルを足す">${labelList("genre").map(v => `<option value="genre:${esc(v)}">${esc(v)}</option>`).join("")}</optgroup>
          <optgroup label="ラベルを足す">${labelList("tag").map(v => `<option value="tag:${esc(v)}">${esc(v)}</option>`).join("")}</optgroup></select>
        <select id="bulkPack" aria-label="入れる素材パック"><option value="">素材パックに入れる…</option>${coll.DATA.pack.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}<option value="new">＋ 新しい素材パック</option></select>
        <select id="bulkShare" aria-label="入れる共有ページ"><option value="">共有ページに入れる…</option>${coll.DATA.share.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}<option value="new">＋ 新しい共有ページ</option></select>
        <button id="bulkClear">選択をやめる</button></div>` : ""}
      ${content}</div>`;
  }

  /* ── くわしくの窓 ───────────────────────────────────── */
  function hlBody(it) { let h = esc(it.body); it.hl.forEach(x => { if (!x.t) return; const e = esc(x.t); if (e) h = h.split(e).join(`<mark class="hl" title="${esc(x.r)}">${e}</mark>`); }); return h; }
  /* ── 画像と PDF を大きく見る・画像を囲んで印を付ける ─────────── */
  const isPdf = it => !!(it.file && /\.pdf($|[?#])/i.test(it.file.url));
  // 印は、画像なら p なし、PDF なら p（ページ番号）つきで持つ
  const boxesHTML = (it, page) => it.hl.map((h, i) => h.box && (page ? h.p === page : !h.p) ? `<span class="mk" style="left:${h.box[0]}%;top:${h.box[1]}%;width:${h.box[2]}%;height:${h.box[3]}%"><em>${esc(h.r)}</em></span>` : "").join("");
  const shotView = it => `<button class="shotv" data-lbopen="img" aria-label="画像を大きく見る"><span class="shotv-clip"><span class="mk-wrap"><img src="${esc(it.shot)}" alt="" referrerpolicy="no-referrer">${boxesHTML(it)}</span></span><span class="shotv-cap">押すと大きく見られる・囲んで印を付けられる</span></button>`;
  // 全面表示の右に出す「書きながら見る」欄（分析 3 段と、画像の印の一覧）
  function lbSideHTML(it) {
    if (!S.lb.side) return "";
    const n = stageOf(it);
    const step = (k, i, label, hint) => `<div class="step ${(it.a[k] || "").trim() ? "done" : ""}"><div class="sn">${i}</div><div><div class="sl">${label}<span>${hint}</span></div>
      <textarea class="dt-ta" id="lb-a-${k}" data-a="${k}">${esc(it.a[k])}</textarea></div></div>`;
    const marks = it.hl.map((h, i) => h.box ? `<div class="hli"><span class="chip" style="--c:var(--l-kata)">${esc(h.r)}</span><q>${h.p ? `PDF ${h.p} ページの印` : `画像の印 ${i + 1}`}</q><button data-hlrm="${i}" aria-label="印を消す">${IC.x}</button></div>` : "").join("");
    return `<aside class="lb-side" aria-label="書きながら見る"><div class="dt-h">分析<span>${n} / 3・${STAGES[n]}</span></div><div class="steps">
      ${step("why", 1, "言語化", "なぜ良いか")}${step("hypo", 2, "仮説", "ほかでも効きそうな型")}${step("idea", 3, "用途抽出", "どこで・どう使うか")}</div>
      ${marks ? `<div class="hls">${marks}</div>` : ""}</aside>`;
  }
  const sideBtn = () => `<label class="aitag ${S.lb.side ? "on" : ""}"><input type="checkbox" id="lbSide" ${S.lb.side ? "checked" : ""}>書きながら見る</label>`;
  let pdfTick = 0, pdfLater = false;
  // PDF のページが 1 枚描けるたびに描き直す（なぞっている最中は、離したあとにまとめて）
  const pdfProgress = () => { if (!S.lb || S.lb.kind !== "pdf") return; if (drag) { pdfLater = true; return; } cancelAnimationFrame(pdfTick); pdfTick = requestAnimationFrame(() => render()); };
  function lbPdfHTML(it, L) {
    const st = loadPdf(it.file.url, pdfProgress);
    const w = L.zoom === "fit" ? "width:100%;max-width:880px" : L.zoom === "real" ? "width:max-content" : `width:${L.zoom}%`;
    const pages = st.pages.map((pg, i) => `<div class="pg-n">${i + 1} / ${st.total}</div><span class="mk-wrap pg ${L.zoom === "real" ? "real" : ""}" data-pg="${i + 1}" style="${w}"><img src="${pg.src}" alt="${i + 1} ページ目" draggable="false" width="${pg.w}" height="${pg.h}">${boxesHTML(it, i + 1)}<span class="mk draft" hidden></span></span>`).join("");
    const note = st.err ? `<div class="pg-note">${esc(st.err)}<br><a class="ghost" href="${esc(it.file.url)}" target="_blank" rel="noopener">別のタブで開く</a></div>`
      : !st.done ? `<div class="pg-note">PDF をページごとに読み込んでいます…${st.total ? ` ${st.pages.length} / ${st.total}` : ""}</div>`
      : st.capped ? `<div class="pg-note">先頭の ${st.pages.length} ページまで出しています。続きは「別のタブで開く」から</div>` : "";
    return `<div class="lb" role="dialog" aria-label="PDF を大きく見る"><div class="lb-bar">
        ${zoomSeg(L)}${markCtl(L, "ページの上をなぞって囲む")}${sideBtn()}
        <a class="ghost" href="${esc(it.file.url)}" target="_blank" rel="noopener" style="margin-left:auto">別のタブで開く</a>
        <button class="icon" id="lbClose" aria-label="閉じる（Esc）">${IC.close}</button></div>
      <div class="lb-main"><div class="lb-body pdfpages ${L.mark ? "marking" : ""}">${pages}${note}</div>${lbSideHTML(it)}</div></div>`;
  }
  const zoomSeg = L => `<div class="seg lb-z">${[["fit", "幅に合わせる"], [150, "150%"], [200, "200%"], ["real", "原寸"]].map(([z, l]) => `<button class="${String(L.zoom) === String(z) ? "on" : ""}" data-lbz="${z}">${l}</button>`).join("")}</div>`;
  const markCtl = (L, hint) => `<label class="aitag ${L.mark ? "on" : ""}"><input type="checkbox" id="lbMark" ${L.mark ? "checked" : ""}>囲んで印を付ける</label>
        ${L.mark ? `<select class="lsel mini" id="lbRef" aria-label="印のラベル">${labelList("tag").map(r => `<option ${r === L.ref ? "selected" : ""}>${esc(r)}</option>`).join("")}</select>` : ""}
        <span class="lsub">${L.mark ? hint : ""}</span>`;
  function lbHTML() {
    const it = cur(); if (!S.lb || !it) return "";
    const L = S.lb;
    if (L.kind === "pdf") return lbPdfHTML(it, L);
    const w = L.zoom === "fit" ? "width:100%" : L.zoom === "real" ? "width:max-content" : `width:${L.zoom}%`;
    return `<div class="lb" role="dialog" aria-label="画像を大きく見る"><div class="lb-bar">
        ${zoomSeg(L)}
        ${markCtl(L, "画像の上をなぞって囲む")}
        ${sideBtn()}
        <button class="icon" id="lbClose" aria-label="閉じる（Esc）" style="margin-left:auto">${IC.close}</button></div>
      <div class="lb-main"><div class="lb-body ${L.mark ? "marking" : ""}"><span class="mk-wrap ${L.zoom === "real" ? "real" : ""}" id="lbWrap" style="${w}"><img src="${esc(it.shot)}" alt="" referrerpolicy="no-referrer" draggable="false">${boxesHTML(it)}<span class="mk draft" hidden></span></span></div>${lbSideHTML(it)}</div></div>`;
  }
  // 囲む操作（マウスも指も同じ）。位置は画像に対する割合で持つので、拡大しても印がずれない
  let drag = null;
  screen.addEventListener("pointerdown", e => {
    const wrap = e.target.closest?.(".lb-body .mk-wrap"); if (!wrap || !S.lb?.mark) return;
    e.preventDefault(); const r = wrap.getBoundingClientRect();
    drag = { r, x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100, draft: wrap.querySelector(".mk.draft"), page: wrap.dataset.pg ? +wrap.dataset.pg : 0 };
    wrap.setPointerCapture?.(e.pointerId);
  });
  screen.addEventListener("pointermove", e => {
    if (!drag) return; const d = drag.draft; if (!d) return;
    const x = (e.clientX - drag.r.left) / drag.r.width * 100, y = (e.clientY - drag.r.top) / drag.r.height * 100;
    const b = [Math.min(drag.x, x), Math.min(drag.y, y), Math.abs(x - drag.x), Math.abs(y - drag.y)].map(v => Math.max(0, Math.min(100, v)));
    Object.assign(d.style, { left: b[0] + "%", top: b[1] + "%", width: b[2] + "%", height: b[3] + "%" }); d.hidden = false; drag.box = b;
  });
  screen.addEventListener("pointerup", () => {
    if (!drag) return; const { box: b, draft, page } = drag; drag = null;
    if (!b || b[2] < 1 || b[3] < 1) { if (draft) draft.hidden = true; if (pdfLater) { pdfLater = false; render(); } return; }
    const it = cur(); it.hl.push({ box: b.map(v => Math.round(v * 10) / 10), r: S.lb.ref, ...(page ? { p: page } : {}) }); changed(it, 0); pdfLater = false; render(); toast(page ? `${page} ページ目に印を付けました` : "印を付けました");
  });

  function detailHTML() {
    const it = cur(); if (!it) return "";
    const list = filtered(), idx = list.findIndex(x => x.id === it.id);
    const on = key => S.cellPop && S.cellPop.id === it.id && S.cellPop.key === key ? "on" : "";
    const chipBtn = (key, inner) => `<button class="cellpick dchip ${on(key)}" data-cp="${key}" data-id="${it.id}" aria-label="${LABEL_KEYS[key]}を直す">${inner}</button>`;
    const chips = (arr, c) => arr.length ? arr.map(x => `<span class="chip" style="--c:${c}">${esc(x)}</span>`).join("") : '<span class="add">＋ 選ぶ</span>';
    const step = (k, i, label, hint, ph) => `<div class="step ${(it.a[k] || "").trim() ? "done" : ""}"><div class="sn">${i}</div><div><div class="sl">${label}<span>${hint}</span></div>
      <textarea class="dt-ta" id="a-${k}" data-a="${k}" placeholder="${esc(ph)}">${esc(it.a[k])}</textarea></div></div>`;
    const fold = (key, title, count, inner) => `<details class="fold" data-fold="${key}" ${S.fold.has(key) ? "open" : ""}><summary><span class="chev">${IC.down}</span>${esc(title)}${count !== undefined ? `<span class="n">${count}</span>` : ""}</summary><div class="fold-b">${inner}</div></details>`;
    const m = it.m || {};
    const nums = [m.like && (String(m.like).startsWith("スキ") ? m.like : "いいね " + m.like), m.rt && "RT " + m.rt, m.view && "表示 " + m.view].filter(Boolean).join("・");
    const yid = D.ytId(it.url), yp = it.props?.yt || {};
    const tr = yid ? D.parseTranscript(it.body) : null;
    const ytInfo = yid ? [yp.len ? `長さ ${D.fmtTime(yp.len)}` : "", tr ? `${yp.cap || "文字起こし"}・${tr.reduce((n, l) => n + l.x.length, 0).toLocaleString()} 字` : "文字起こしなし"] : [];
    const meta = [it.author, yid ? "" : it.handle, ...ytInfo, `保存 ${it.saved}`, nums].filter(Boolean).map(esc).join('<span class="dot">・</span>');
    const markText = x => { let h = esc(x); it.hl.forEach(m => { if (!m.t) return; const e = esc(m.t); if (e && h.includes(e)) h = h.split(e).join(`<mark class="hl" title="${esc(m.r)}">${e}</mark>`); }); return h; };
    const hlTime = h => { if (!tr || !h.t) return ""; const l = tr.find(l => l.x.includes(h.t)); return l ? `<button class="tsc" data-seek="${l.s}" aria-label="${l.t} から再生">${l.t}</button>` : ""; };
    const hlBar = `<div class="hlbar"><select class="lsel" id="hlRef" aria-label="線のラベル">${labelList("tag").map(r => `<option>${esc(r)}</option>`).join("")}</select><button class="ghost" id="hlAdd">なぞったところに線を引く</button></div>`;
    const n = stageOf(it);
    const tableOpts = `${tableOf(it.table) ? "" : `<option value="" selected>未整理</option>`}${CFG.tables.map(t => `<option value="${t.id}" ${t.id === it.table ? "selected" : ""}>${esc(pathOf(t.id).join(" / "))}</option>`).join("")}`;
    const exf = it.shu && EXF[it.shu] ? fold("ex", `${it.shu}の欄`, undefined, `<div class="exg">${EXF[it.shu].map(k => `<label>${esc(k)}<input data-ex="${esc(k)}" value="${esc(it.ex[k] || "")}"></label>`).join("")}</div>`) : "";
    const used = fold("used", "使った記録", it.used.length, `<div class="used">${it.used.map((u, i) => `<div class="ur"><span class="d">${esc(u.d)}</span><span class="w">${esc(u.w)}</span><button data-usedrm="${i}" aria-label="消す">${IC.x}</button></div>`).join("")}</div>
      <div class="uadd" style="margin-top:6px"><input id="usedIn" placeholder="どの記事・セミナーで使ったか" aria-label="使った先"><button class="ghost" id="usedAdd">残す</button></div>`);
    const memb = k => { const all = coll.DATA[k], on = coll.memberOf(k, it.id); return all.length ? `<div class="pick">${all.map(o => `<button class="pk ${on.includes(o) ? "on" : ""}" data-mem="${k}:${o.id}">${esc(o.name)}</button>`).join("")}</div>` : `<span class="num">まだありません。上の「${coll.LABEL[k]}」から作れます</span>`; };
    const nIn = coll.memberOf("pack", it.id).length + coll.memberOf("share", it.id).length;
    const sets = fold("sets", "素材パック・共有ページ", nIn, `<div class="dt-h">素材パック</div>${memb("pack")}<div class="dt-h" style="margin-top:10px">共有ページ</div>${memb("share")}`);
    const edit = fold("edit", "元の情報を直す・消す", undefined, `<div class="exg one">
        <label>投稿者<input id="dtAuthor" value="${esc(it.author)}"></label>
        <label>リンク<input id="dtUrl" value="${esc(it.url)}" placeholder="https://"></label>
        <label>本文<textarea class="dt-ta" id="bodyEdit" style="min-height:160px">${esc(it.body)}</textarea></label></div>
      <div class="hlbar"><label class="ghost" style="cursor:pointer">画像を差し替える<input type="file" id="shotIn" accept="image/*" hidden></label>${it.file ? "" : `<label class="ghost" style="cursor:pointer">PDF を付ける<input type="file" id="pdfIn" accept="application/pdf" hidden></label>`}
        <button class="ghost" id="delItem" style="margin-left:auto">この 1 件を消す</button></div>`);
    return `<div class="scrim" id="scrim"></div><aside class="detail peek" aria-label="くわしく">
     <div class="dt-top">
       <div class="dt-nav"><button class="icon" data-step="-1" ${idx <= 0 ? "disabled" : ""} aria-label="前の 1 件（K）">${IC.up}</button><button class="icon" data-step="1" ${idx < 0 || idx >= list.length - 1 ? "disabled" : ""} aria-label="次の 1 件（J）">${IC.down}</button>${idx >= 0 ? `<span class="num">${idx + 1} / ${list.length}</span>` : ""}</div>
       <input class="dt-title dt-tin" id="dtTitle" value="${esc(it.title)}" aria-label="見出し">
       <label class="aitag ${it.ai ? "on" : ""}" title="次に Claude が道具で読んだとき、空いている段に下書きを入れる"><input type="checkbox" id="aiAsk" ${it.ai ? "checked" : ""}>Claude に頼む</label>
       ${it.url ? `<a class="icon" href="${esc(it.url)}" target="_blank" rel="noopener" aria-label="元のページを開く" title="元のページを開く">${IC.link}</a>` : ""}
       <button class="icon" id="dtClose" aria-label="閉じる（Esc）">${IC.close}</button></div>
     <div class="dt-props">
       <div class="pg"><span class="pl">評価</span>${gradeHTML(it)}</div>
       <div class="pg"><span class="pl">種類</span>${chipBtn("shu", it.shu ? `<span class="chip" style="--c:var(--k-doc)">${esc(it.shu)}</span>` : '<span class="add">＋ 選ぶ</span>')}</div>
       <div class="pg"><span class="pl">ジャンル</span>${chipBtn("genre", chips(it.genre, "var(--l-yoto)"))}</div>
       <div class="pg"><span class="pl">ラベル</span>${chipBtn("tag", chips(it.tags, "var(--faint)"))}</div>
       <div class="pg"><span class="pl">場所</span><select class="lsel mini" id="moveTo" aria-label="置き場">${tableOpts}</select></div>
     </div>
     ${meta ? `<div class="dt-meta">${meta}</div>` : ""}
     ${yid && !tr ? `<div class="dt-meta">文字起こし待ち：<a href="${esc(it.url)}" target="_blank" rel="noopener">YouTube で開く ↗</a>　スワイプくんパネルの「文字起こしをこの保存に入れる」で入ります</div>` : ""}
     <div class="dt-body dt-cols">
      <section class="dt-src">
        ${yid ? `<div class="ytv"><div class="ytslot" id="ytslot" data-v="${esc(yid)}"></div></div>` : it.shot ? shotView(it) : ""}${isPdf(it) ? `<div class="pdfv"><iframe src="${esc(it.file.url)}#view=FitH" title="PDF" loading="lazy"></iframe><button class="ghost" data-lbopen="pdf">大きく開く・印を付ける</button></div>` : ""}${it.file ? `<a class="filelink" href="${esc(it.file.url)}" target="_blank" rel="noopener">${IC.file}${esc(it.file.name || "ファイルを開く")}${it.file.pages ? `（${esc(it.file.pages)} ページ）` : ""}</a>` : ""}
        ${tr ? `<div><div class="dt-h">文字起こし<span>時刻を押すとそこから再生・なぞって線を引ける</span></div><div class="tr" id="bodyText">${tr.map(l => `<div class="ln" data-s="${l.s}"><button class="ts" data-seek="${l.s}" aria-label="${l.t} から再生">${l.t}</button><span class="lx">${markText(l.x)}</span></div>`).join("")}</div>${hlBar}</div>`
          : it.body ? `<div><div class="dt-h">本文<span>なぞって線を引ける</span></div><div class="dt-v" id="bodyText" style="white-space:pre-wrap">${hlBody(it)}</div>${hlBar}</div>` : ""}
        ${it.hl.length ? `<div class="hls">${it.hl.map((h, i) => `<div class="hli"><span class="chip" style="--c:var(--l-kata)">${esc(h.r)}</span>${h.box ? `<button class="mkref" data-lbopen="${h.p ? "pdf" : "img"}">${h.p ? `PDF ${h.p} ページの印` : "画像の印"}</button>` : `${hlTime(h)}<q>${esc(h.t)}</q>`}<button data-hlrm="${i}" aria-label="線を消す">${IC.x}</button></div>`).join("")}</div>` : ""}
        ${!it.body ? `<div><div class="dt-h">${yid ? "文字起こし" : "本文"}<span>${yid ? "パネルで保存すると入る・「元の情報を直す」から貼れる" : "「元の情報を直す」から入れられる"}</span></div><div class="dt-v">${it.excerpt ? esc(it.excerpt) : '<span class="num">本文はまだありません</span>'}</div></div>` : ""}
      </section>
      <section class="dt-an">
        <div><div class="dt-h">分析<span>${n} / 3・${STAGES[n]}</span></div><div class="steps">
          ${step("why", 1, "言語化", "なぜ良いか", "例：一文目で読み手の思い当たりを作っている")}
          ${step("hypo", 2, "仮説", "ほかでも効きそうな型", "例：対比に数字が入ると引用されやすい")}
          ${step("idea", 3, "用途抽出", "どこで・どう使うか", "例：2期の募集記事の冒頭で、0期の失敗談を先に置く形で使う")}
        </div></div>
        <div class="folds">${exf}${sets}${used}${edit}</div>
      </section>
     </div></aside>`;
  }

  /* ── 足す窓 ─────────────────────────────────────────── */
  // 足す窓の置き場は「自動」が既定。自動は X・YouTube→今月の表、note→記事、PDF→教材PDF、ほかは開いている表（無ければ未整理）
  const browsingTable = () => (S.loc.startsWith("f:") && tableOf(S.table) ? S.table : "");
  // 同じリンクがもう保存されていたら知らせる（保存は止めない）
  function dupHTML(url) {
    const d = D.findSame(ITEMS, url); if (!d) return '<div id="adDup"></div>';
    return `<div id="adDup" class="dup">このリンクは保存済み（${esc(d.saved)}・${esc(pathOf(d.table).join(" / "))}）<button class="ghost" data-dupopen="${d.id}">開く</button></div>`;
  }
  function addHTML() {
    const A = S.add;
    const opts = `<option value="" ${A.table === "" ? "selected" : ""}>自動（X と YouTube は今月の表・note は記事・PDF は教材PDF・ほかは開いている表）</option>${CFG.tables.map(t => `<option value="${t.id}" ${t.id === A.table ? "selected" : ""}>${esc(pathOf(t.id).join(" / "))}</option>`).join("")}`;
    return `<div class="mscrim" id="mScrim"></div><div class="modal addm" role="dialog" aria-label="スワイプを足す">
      <div class="m-top"><b style="font-size:15px">スワイプを足す</b><button class="icon" id="mClose" aria-label="閉じる">${IC.x}</button></div>
      <div class="addf">
        <label>リンク<input id="adUrl" value="${esc(A.url)}" placeholder="https://x.com/… や note の URL（無くてもよい）"></label>
        ${dupHTML(A.url)}
        <label>見出し<input id="adTitle" value="${esc(A.title)}" placeholder="空ならリンク先の題名か本文の書き出しから付ける"></label>
        <label>本文<textarea id="adBody" rows="6" placeholder="ポストや記事の本文を貼る（無くてもよい）">${esc(A.body)}</textarea></label>
        <div class="drop ${A.file ? "has" : ""}" id="drop">${A.file ? `${IC.file}<span>${esc(A.file.name)}</span><button class="icon" id="adFileX" aria-label="外す">${IC.x}</button>` : `画像か PDF をここへ落とす・貼る・<label class="lnk">選ぶ<input type="file" id="adFile" accept="image/*,application/pdf" hidden></label>`}</div>
        <label>言語化（なぜ良いか・あとで書いてもよい）<textarea id="adWhy" rows="2">${esc(A.why)}</textarea></label>
        <label>置き場<select id="adTable">${opts}</select></label>
      </div>
      <div class="m-foot"><span class="lsub">${A.busy ? "保存しています…" : "リンク・本文・ファイルのどれか 1 つがあれば保存できる"}</span><button class="ink" id="adSave" ${A.busy ? "disabled" : ""}>保存する</button></div></div>`;
  }

  /* ── 素材パックと共有ページ（coll.js） ───────────────────── */
  const coll = createColl({
    esc, IC, GRADE, S, items: () => ITEMS, cfg: () => CFG, saveCfg, toast, setSaving, render: () => render(),
    gradeHTML, shotHTML, pathOf, labelSels, labelFilter, matchQ, headHTML,
    openSwipe: id => { S.scr = "app"; S.open = id; S.delArm = false; S.lb = null; render(); },
  });

  /* ── 描く ───────────────────────────────────────────── */
  function render() {
    root.querySelectorAll("[data-scr]").forEach(b => b.classList.toggle("on", b.dataset.scr === S.scr));
    const addBtn = $("#addBtn"); if (addBtn) addBtn.hidden = S.scr !== "app";
    if (S.scr !== "app") {
      const keepC = ["#main", ".tw", ".dt-body", ".m-list"].map(sel => { const el = screen.querySelector(sel); return el ? [sel, el.scrollTop] : null; }).filter(Boolean);
      screen.querySelector("#ytf")?.remove(); ytHold.replaceChildren();
      screen.innerHTML = coll.mainHTML(S.scr);
      keepC.forEach(([sel, t]) => { const el = screen.querySelector(sel); if (el) el.scrollTop = t; });
      remember(); return;
    }
    if (S.loc === "todo") { S.loc = "all"; S.view = "v6"; }
    if (S.loc.startsWith("f:") && !folderOf(S.loc.slice(2))) S.loc = "all";
    if (S.loc === "unsorted" && !unsorted().length) S.loc = "all";
    let body;
    if (S.loc.startsWith("f:") && !CFG.tables.some(t => t.folder === S.loc.slice(2))) body = subfoldersHTML(S.loc.slice(2));
    else body = listHTML();
    // 描き直しても、見ていた位置（縦・表の横）と、くわしくの窓の位置を保つ
    const keep = ["#main", ".tw", ".dt-body", ".lb-body", ".lb-side", "#bodyText.tr"].map(sel => { const el = screen.querySelector(sel); return el ? [sel, el.scrollTop, el.scrollLeft] : null; }).filter(Boolean);
    const yf = screen.querySelector("#ytf"); if (yf) mv(ytHold, yf);
    screen.innerHTML = navHTML() + `<main class="main" id="main">${body}</main>` + (S.open ? detailHTML() : "") + (S.modal === "add" ? addHTML() : "") + cellPopHTML() + lbHTML();
    mountYt(yf); if (ytT >= 0) markNow(false);
    keep.forEach(([sel, t, l]) => { const el = screen.querySelector(sel); if (el) { el.scrollTop = t; el.scrollLeft = l; } });
    placeCellPop();
    remember();
  }
  function keepFocus(id, fn) { const el = document.getElementById(id); const pos = el ? el.selectionStart : 0; fn(); const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* 選べない欄 */ } } }
  const cur = () => ITEMS.find(x => x.id === S.open);
  // くわしくの窓を開いたまま、いまの並びで前後の 1 件へ移る（J / K）
  function stepOpen(d) {
    const list = filtered(), i = list.findIndex(x => x.id === S.open), next = list[i + d];
    if (!next) return;
    S.open = next.id; S.delArm = false; S.cellPop = null; S.lb = null; render();
    const body = screen.querySelector(".dt-body"); if (body) body.scrollTop = 0;
  }
  const changed = (it, wait) => queueSave(it, wait);

  /* ── 消す（数秒は元に戻せる。確定したら置き場のファイルも消す） ── */
  let pendingDel = null;
  function commitRemove() {
    const P = pendingDel; if (!P) return; pendingDel = null; clearTimeout(P.timer);
    setSaving(1);
    D.deleteItem(P.it.id)
      .then(() => D.removeFiles([P.it.props?.shot, P.it.file?.url].filter(Boolean)))
      .catch(err => { ITEMS.splice(Math.min(P.idx, ITEMS.length), 0, P.it); render(); toast(err.message); })
      .finally(() => setSaving(-1));
  }
  function removeWithUndo(it) {
    if (!it) return;
    commitRemove(); // 前に消したものは、ここで確定する
    clearTimeout(timers.get(it.id)); timers.delete(it.id);
    const idx = ITEMS.findIndex(x => x.id === it.id);
    ITEMS = ITEMS.filter(x => x.id !== it.id); S.open = null; S.lb = null; S.sel.delete(it.id); render();
    pendingDel = { it, idx, timer: setTimeout(commitRemove, 6000) };
    toastUndo(`「${it.title.slice(0, 24)}」を消しました`);
  }
  function undoRemove() {
    const P = pendingDel; if (!P) return; pendingDel = null; clearTimeout(P.timer);
    ITEMS.splice(Math.min(P.idx, ITEMS.length), 0, P.it); S.open = P.it.id; render(); toast("元に戻しました");
  }
  addEventListener("pagehide", commitRemove);

  /* ── 足す ───────────────────────────────────────────── */
  function openAdd() { S.modal = "add"; S.add = { url: "", title: "", body: "", why: "", table: "", file: null, fileObj: null, busy: false }; render(); setTimeout(() => { const n = $("#adUrl"); n && n.focus(); }, 0); }
  function setAddFile(f) {
    if (!f) return;
    if (!(f.type.startsWith("image/") || f.type === "application/pdf")) { toast("入れられるのは画像か PDF です"); return; }
    S.add.fileObj = f; S.add.file = { name: f.name || "貼った画像", kind: f.type === "application/pdf" ? "pdf" : "img" }; render();
  }
  async function saveAdd() {
    const A = S.add;
    if (!A.url.trim() && !A.body.trim() && !A.fileObj) { toast("リンク・本文・ファイルのどれか 1 つを入れてください"); return; }
    A.busy = true; render();
    try {
      let file = null;
      if (A.fileObj) file = { ...A.file, url: await D.uploadFile(A.fileObj) };
      const url = A.url.trim();
      const ogp = url && !A.title.trim() ? await D.fetchOgp(url) : null;
      const src = D.detectSourceType(url, { hasBody: !!A.body.trim(), isPdf: file?.kind === "pdf" });
      let table = A.table;
      if (!table) {
        if (src === "X") { table = D.monthTableId(); if (ensureMonth(table)) saveCfg(); }
        else if (src === "YouTube") { table = D.monthTableId(undefined, "yt"); if (ensureMonth(table)) saveCfg(); }
        else if (src === "note" && tableOf("t-note")) table = "t-note";
        else if (file?.kind === "pdf" && tableOf("t-lp-pdf")) table = "t-lp-pdf";
        else table = browsingTable();
      }
      const it = await D.createItem({ url, title: A.title, body: A.body, why: A.why, table, file, ogp });
      ITEMS.unshift(it);
      S.modal = null; S.add = null;
      if (table && tableOf(table)) { const t = tableOf(table); S.loc = "f:" + t.folder; S.table = table; }
      S.view = CFG.views[0].id; S.f = {}; S.q = ""; S.open = it.id; S.delArm = false; S.bodyEdit = false;
      render(); toast(`保存しました（${pathOf(it.table).join(" / ")}）`);
    } catch (e) { A.busy = false; render(); toast(e.message); }
  }

  /* ── 押したとき ─────────────────────────────────────── */
  const main0 = () => { const m = screen.querySelector("#main"); if (m) m.scrollTop = 0; };
  root.addEventListener("click", e => {
    const t = e.target, q = s => t.closest(s); let b;
    if (q("#addBtn")) { openAdd(); return; }
    if (b = q("[data-scr]")) { if (S.scr !== b.dataset.scr) { S.scr = b.dataset.scr; S.open = null; S.lb = null; S.cellPop = null; S.sel.clear(); render(); main0(); } return; }
    if (q("#toastUndo")) { undoRemove(); $("#toast").hidden = true; return; }
    if (!screen.contains(t)) return;
    if (b = q("[data-seek]")) { const sec = +b.dataset.seek; ytCmd("seekTo", [sec, true]); ytCmd("playVideo"); ytT = sec; markNow(false); return; }
    if (S.scr !== "app") { if (q("#navBtn")) { S.navOn = !S.navOn; render(); return; } coll.onClick(S.scr, t); return; }
    let closed = false; if (!q(".colbtn") && S.colPop) { S.colPop = false; closed = true; }
    if (!q(".fwrap") && S.fPop) { S.fPop = false; closed = true; }
    if (q("#fBtn")) { S.fPop = !S.fPop; render(); return; }
    if (b = q("[data-frm]")) { delete S.f[b.dataset.frm]; render(); return; }
    if (b = q("[data-cpv]")) {
      const P = S.cellPop, it = ITEMS.find(x => x.id === P.id), v = b.dataset.cpv;
      if (P.key === "shu") { it.shu = it.shu === v ? "" : v; S.cellPop = null; }
      else { const f = FIELD_OF[P.key]; it[f] = toggle(it[f], v); }
      changed(it, 300); render(); return;
    }
    if (b = q("[data-cp]")) {
      const same = S.cellPop && S.cellPop.id === b.dataset.id && S.cellPop.key === b.dataset.cp;
      S.cellPop = same ? null : { id: b.dataset.id, key: b.dataset.cp }; render(); return;
    }
    if (S.cellPop && !q("#cpop")) { S.cellPop = null; closed = true; }
    if (!q("#delItem") && S.delArm) { S.delArm = false; closed = true; }
    if (b = q("[data-loc]")) { S.loc = b.dataset.loc; S.sel.clear(); S.open = null; S.f = {}; if (S.loc.startsWith("f:") || S.loc === "all") S.view = CFG.views[0].id; if (innerWidth <= 860) S.navOn = false; render(); return; }
    if (b = q("[data-table]")) { if (S.table === b.dataset.table) return; S.table = b.dataset.table; S.sel.clear(); render(); return; }
    if (b = q("[data-view]")) { S.view = b.dataset.view; render(); return; }
    if (q("#reload")) { boot(); return; }
    if (q("#addView")) {
      const f = { ...S.f }; const parts = [f.shu, f.ref, f.star && (GRADE[f.star] + (f.star < 5 ? " 以上" : "")), f.genre, f.stagex !== undefined && f.stagex !== "" && STAGES[f.stagex], f.tag].filter(Boolean);
      const name = prompt("ビューの名前", parts.join("・") || "新しいビュー"); if (name === null) return;
      const id = "v" + Date.now().toString(36);
      CFG.views.push({ id, name: name.trim() || "新しいビュー", type: curView().type, group: curView().group, f });
      S.view = id; S.f = {}; saveCfg(); render(); toast(parts.length ? "いまの絞り込みをビューとして残しました" : "ビューを足しました"); return;
    }
    if (b = q("#addTable")) {
      const fid = b.dataset.folder; const name = prompt("表の名前"); if (!name || !name.trim()) return;
      const id = "t-" + Date.now().toString(36); CFG.tables.push({ id, name: name.trim(), folder: fid });
      S.loc = "f:" + fid; S.table = id; saveCfg(); render(); return;
    }
    if (q("#addFolder")) {
      const name = prompt("フォルダの名前"); if (!name || !name.trim()) return;
      const parent = S.loc.startsWith("f:") && confirm(`「${folderOf(S.loc.slice(2))?.name}」の中に作りますか？（キャンセルで一番上に作る）`) ? S.loc.slice(2) : null;
      const id = "f-" + Date.now().toString(36); CFG.folders.push({ id, name: name.trim(), parent });
      S.loc = "f:" + id; saveCfg(); render(); return;
    }
    if (q("#colBtn")) { S.colPop = !S.colPop; render(); return; }
    if (b = q("[data-colmv]")) { const [k, d] = b.dataset.colmv.split(":"); const i = CFG.cols.indexOf(k), j = i + +d; if (j >= 0 && j < CFG.cols.length) [CFG.cols[i], CFG.cols[j]] = [CFG.cols[j], CFG.cols[i]]; saveCfg(); render(); return; }
    if (q("#fClear")) { S.f = {}; S.q = ""; render(); return; }
    if (b = q("[data-lbopen]")) { S.lb = { kind: b.dataset.lbopen, zoom: "fit", mark: false, side: store.get("swipe.lbside", true), ref: S.lb?.ref || labelList("tag")[0] }; render(); return; }
    if (q("#lbClose")) { S.lb = null; render(); return; }
    if (b = q("[data-lbz]")) { S.lb.zoom = b.dataset.lbz; render(); return; }
    if (b = q("[data-step]")) { stepOpen(+b.dataset.step); return; }
    if (b = q("[data-open]")) { S.open = b.dataset.open; S.delArm = false; S.bodyEdit = false; render(); return; }
    if (q("#navBtn")) { S.navOn = !S.navOn; render(); return; }
    if (t.id === "scrim" || q("#dtClose")) { S.open = null; S.lb = null; render(); return; }
    if (b = q("[data-newlabel]")) {
      const key = b.dataset.newlabel; const raw = prompt(`${LABEL_KEYS[key]}に足す値`); if (!raw || !raw.trim()) return;
      const v = pickLabel(key, raw); if (!v) return;
      CFG.labels[key] = key === "tag" ? D.uniqLabels([...(CFG.labels[key] || []), v]) : uniq([...(CFG.labels[key] || []), v]); saveCfg();
      const it = b.dataset.for ? ITEMS.find(x => x.id === b.dataset.for) : cur(); if (it) { if (key === "shu") it.shu = v; else { const field = key === "tag" ? "tags" : key; it[field] = uniq([...it[field], v]); } changed(it, 0); }
      render(); return;
    }
    if (b = q("[data-pk]")) { const it = cur(); it[b.dataset.pk] = toggle(it[b.dataset.pk], b.dataset.v); changed(it, 300); render(); return; }
    if (b = q("[data-pkone]")) { const it = cur(); it.shu = it.shu === b.dataset.pkone ? "" : b.dataset.pkone; changed(it, 300); render(); return; }
    if (q("#bulkClear")) { S.sel.clear(); render(); return; }
    if (b = q("[data-mem]")) { const [k, oid] = b.dataset.mem.split(":"); coll.toggleMember(k, oid, S.open); render(); return; }
    if (q("#hlAdd")) {
      const it = cur(); const sel = String(getSelection() || "").trim(); const box = $("#bodyText");
      if (!sel || !box || !it.body.includes(sel)) { toast("本文の中をなぞってから押してください"); return; }
      it.hl.push({ t: sel, r: $("#hlRef").value }); changed(it, 0); render(); toast("線を引きました"); return;
    }
    if (b = q("[data-hlrm]")) { const it = cur(); it.hl.splice(+b.dataset.hlrm, 1); changed(it, 0); render(); return; }
    if (q("#bodyToggle")) { S.bodyEdit = !S.bodyEdit; render(); return; }
    if (q("#usedAdd")) { const v = $("#usedIn").value.trim(); if (!v) { toast("使った先を書いてから押してください"); return; } const it = cur(); const p = D.jstParts(); it.used.unshift({ w: v, d: `${p.y}-${p.m}-${p.d}` }); changed(it, 0); render(); return; }
    if (b = q("[data-usedrm]")) { const it = cur(); it.used.splice(+b.dataset.usedrm, 1); changed(it, 0); render(); return; }
    if (q("#delItem")) { removeWithUndo(cur()); return; }
    if (b = q("[data-dupopen]")) { S.modal = null; S.add = null; S.open = b.dataset.dupopen; render(); return; }
    if (q("#mClose") || t.id === "mScrim") { if (!S.add?.busy) { S.modal = null; S.add = null; render(); } return; }
    if (q("#adSave")) { saveAdd(); return; }
    if (q("#adFileX")) { S.add.file = null; S.add.fileObj = null; render(); return; }
    if (closed) render();
  });
  root.addEventListener("dblclick", e => {
    if (S.scr !== "app") { coll.onDblClick(S.scr, e.target); return; }
    const b = e.target.closest("[data-table]"); if (!b) return;
    const tb = tableOf(b.dataset.table); if (!tb) return;
    const n = ITEMS.filter(it => it.table === tb.id).length;
    const name = prompt(n ? "表の名前を変える" : "表の名前を変える（空にして決定すると、この空の表を消す）", tb.name);
    if (name === null) return;
    if (!name.trim()) { if (n) { toast("中身がある表は消せません"); return; } CFG.tables = CFG.tables.filter(x => x.id !== tb.id); S.table = null; }
    else tb.name = name.trim();
    saveCfg(); render();
  });
  screen.addEventListener("change", async e => {
    const t = e.target;
    if (S.scr !== "app") { coll.onChange(S.scr, t); return; }
    if (t.id === "bulkSet" && t.value) {
      const i = t.value.indexOf(":"), k = t.value.slice(0, i), v = t.value.slice(i + 1);
      const sel = ITEMS.filter(it => S.sel.has(it.id));
      const NAME = { ai: "Claude に分析を頼む", grade: "評価", shu: "種類", genre: "ジャンル", tag: "ラベル" };
      sel.forEach(it => {
        if (k === "ai") it.ai = true;
        else if (k === "grade") it.star = +v;
        else if (k === "shu") it.shu = v;
        else { const f = k === "tag" ? "tags" : k; if (!it[f].includes(v)) it[f] = [...it[f], v]; }
        changed(it, 0);
      });
      render(); toast(`${sel.length} 件に「${k === "ai" ? NAME.ai : `${NAME[k]}：${k === "grade" ? (GRADE[v] || "なし") : v}`}」を付けました`); return;
    }
    if ((t.id === "bulkPack" || t.id === "bulkShare") && t.value) {
      const k = t.id === "bulkPack" ? "pack" : "share", ids = ITEMS.filter(it => S.sel.has(it.id)).map(it => it.id);
      const o = await coll.addTo(k, t.value, ids);
      if (o) { S.sel.clear(); if (t.value === "new") { S.scr = k; coll.open(k, o.id); } }
      render(); return;
    }
    if (t.dataset.grade) { const it = ITEMS.find(x => x.id === t.dataset.grade); it.star = +t.value || 0; changed(it, 0); render(); return; }
    if (t.dataset.ck) { const id = t.dataset.ck; t.checked ? S.sel.add(id) : S.sel.delete(id); render(); return; }
    if (t.dataset.f) { S.f[t.dataset.f] = t.dataset.f === "star" ? +t.value : t.value; render(); return; }
    if (t.dataset.colshow) { const k = t.dataset.colshow; CFG.cols = t.checked ? [...CFG.cols, k] : CFG.cols.filter(x => x !== k); saveCfg(); render(); return; }
    if (t.id === "moveTo") { const it = cur(); it.table = t.value || null; changed(it, 0); render(); toast(`「${pathOf(it.table).join(" / ")}」へ移しました`); return; }
    if (t.id === "bulkMove" && t.value) { let n = 0; ITEMS.forEach(it => { if (S.sel.has(it.id)) { it.table = t.value; changed(it, 0); n++; } }); S.sel.clear(); render(); toast(`${n} 件を「${pathOf(t.value).join(" / ")}」へ移しました`); return; }
    if (t.id === "lbSide") { S.lb.side = t.checked; store.set("swipe.lbside", t.checked); render(); return; }
    if (t.id === "lbMark") { S.lb.mark = t.checked; render(); return; }
    if (t.id === "lbRef") { S.lb.ref = t.value; return; }
    if (t.id === "aiAsk") { const it = cur(); it.ai = t.checked; changed(it, 0); render(); return; }
    if (t.id === "adTable") { S.add.table = t.value; return; }
    if (t.id === "adFile" && t.files[0]) { setAddFile(t.files[0]); return; }
    if ((t.id === "shotIn" || t.id === "pdfIn") && t.files[0]) {
      const it = cur(); const f = t.files[0]; setSaving(1); toast("上げています…");
      try {
        const url = await D.uploadFile(f);
        if (t.id === "shotIn") { it.props = { ...it.props, shot: url }; it.shot = url; it.shotIsOg = false; }
        else { it.props = { ...it.props, file_name: f.name }; it.file = { url, name: f.name, pages: "" }; }
        changed(it, 0); render(); toast("付けました");
      } catch (err) { toast(err.message); } finally { setSaving(-1); }
    }
  });
  screen.addEventListener("input", e => {
    const t = e.target;
    if (S.scr !== "app") { if (e.isComposing && t.id === "cmq") return; const r = coll.onInput(S.scr, t); if (r === "keep:cmq") keepFocus("cmq", render); return; }
    if (t.id === "q") { if (e.isComposing) return; S.q = t.value; keepFocus("q", render); return; }
    const it = cur();
    if (t.dataset.a && it) { it.a[t.dataset.a] = t.value; const st = t.closest(".step"); st && st.classList.toggle("done", !!t.value.trim()); changed(it); return; }
    if (t.dataset.ex && it) { it.ex = { ...it.ex, [t.dataset.ex]: t.value }; changed(it); return; }
    if (t.id === "dtTitle" && it) { it.title = t.value; it.titleAuto = false; changed(it); return; }
    if (t.id === "dtAuthor" && it) { it.author = t.value; changed(it); return; }
    if (t.id === "dtUrl" && it) { it.url = t.value.trim(); changed(it); return; }
    if (t.id === "bodyEdit" && it) { it.body = t.value; changed(it); return; }
    if (S.add) {
      if (t.id === "adUrl") { S.add.url = t.value; const box = document.getElementById("adDup"); if (box) box.outerHTML = dupHTML(t.value); }
      else if (t.id === "adTitle") S.add.title = t.value;
      else if (t.id === "adBody") S.add.body = t.value;
      else if (t.id === "adWhy") S.add.why = t.value;
    }
  });
  screen.addEventListener("compositionend", e => {
    if (e.target.id === "q") { S.q = e.target.value; keepFocus("q", render); }
    if (e.target.id === "cmq" && S.scr !== "app") { coll.onInput(S.scr, e.target); keepFocus("cmq", render); }
  });
  // 見出しのドラッグで列の並びを変える／足す窓へファイルを落とす
  screen.addEventListener("dragstart", e => { const th = e.target.closest?.("th[data-col]"); if (th) { S.dragCol = th.dataset.col; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", S.dragCol); } catch { /* 古いブラウザ */ } } });
  screen.addEventListener("dragover", e => {
    const th = e.target.closest?.("th[data-col]"); if (th && S.dragCol) { e.preventDefault(); screen.querySelectorAll("th.over").forEach(x => x.classList.remove("over")); th.classList.add("over"); return; }
    const d = e.target.closest?.("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); }
  });
  screen.addEventListener("dragleave", e => { const d = e.target.closest?.("#drop"); if (d) d.classList.remove("over"); });
  screen.addEventListener("drop", e => {
    const th = e.target.closest?.("th[data-col]");
    if (th && S.dragCol) { e.preventDefault(); const from = S.dragCol, to = th.dataset.col; S.dragCol = null; if (from !== to && CFG.cols.includes(from) && CFG.cols.includes(to)) { CFG.cols = CFG.cols.filter(x => x !== from); CFG.cols.splice(CFG.cols.indexOf(to), 0, from); saveCfg(); } render(); return; }
    const d = e.target.closest?.("#drop"); if (!d) return; e.preventDefault(); setAddFile([...e.dataTransfer.files][0]);
  });
  screen.addEventListener("dragend", () => { S.dragCol = null; screen.querySelectorAll("th.over").forEach(x => x.classList.remove("over")); });
  const onPaste = e => { if (S.modal !== "add") return; const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith("image/") || x.type === "application/pdf"); if (f) { e.preventDefault(); setAddFile(f); } };
  const onKey = e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if (S.open && !S.modal && !S.lb && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); stepOpen(1); return; }
      if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); stepOpen(-1); return; }
    }
    if (e.key === "Escape" && S.lb) { S.lb = null; render(); return; }
    if (e.key === "Escape" && S.scr !== "app") { if (coll.onEscape()) render(); return; }
    if (e.key === "Escape") { if (S.modal && !S.add?.busy) { S.modal = null; S.add = null; render(); } else if (S.cellPop) { S.cellPop = null; render(); } else if (S.colPop) { S.colPop = false; render(); } else if (S.fPop) { S.fPop = false; render(); } else if (S.open) { S.open = null; render(); } } };
  screen.addEventListener("scroll", () => placeCellPop(), true);
  // 畳んだ欄の開け閉めを覚える（描き直しても開いたまま）
  screen.addEventListener("toggle", e => { const d = e.target; if (d?.dataset?.fold) { d.open ? S.fold.add(d.dataset.fold) : S.fold.delete(d.dataset.fold); } }, true);
  let wasPhone = isPhone();
  addEventListener("resize", () => { placeCellPop(); if (isPhone() !== wasPhone) { wasPhone = isPhone(); render(); } });
  document.addEventListener("paste", onPaste);
  document.addEventListener("keydown", onKey);

  /* ── 読み込み ───────────────────────────────────────── */
  async function boot() {
    S.loading = true; S.err = ""; render();
    try {
      const [items, cfg] = await Promise.all([D.loadItems(), D.loadSettings()]);
      // 素材パックと共有ページは、読めなくてもスワイプの画面は出す
      await coll.load().catch(err => toast(err.message));
      ITEMS = items;
      let dirty = false;
      if (cfg && cfg.v) { CFG = { ...DEFAULT_SETTINGS(), ...cfg, labels: { ...DEFAULT_SETTINGS().labels, ...(cfg.labels || {}) }, coll: { ...DEFAULT_COLL(), ...(cfg.coll || {}) } };
      // 2026-10-30：参考ポイントはラベルに統一。前に保存した設定の参考ポイントの値・列・ビューもラベルへ寄せる
      CFG.labels = { ...CFG.labels, tag: D.uniqLabels([...(CFG.labels.ref || []), ...(CFG.labels.tag || [])]) }; delete CFG.labels.ref;
      CFG.cols = (CFG.cols || []).filter(c => c !== "ref");
      CFG.views = (CFG.views || []).map(v => v.group === "ref" ? { ...v, group: "tag", name: v.name === "参考ポイントごと" ? "ラベルごと" : v.name } : v);
      }
      else dirty = true; // 初回：既定のフォルダと表を置く
      if (cfg && cfg.v && !cfg.coll) dirty = true; // 素材パックと共有ページの既定のフォルダと表を置く
      if (ensureMonth(D.monthTableId())) dirty = true;
      ITEMS.forEach(it => { if (ensureMonth(it.table)) dirty = true; });
      if (dirty) saveCfg();
      if (S.table && !tableOf(S.table)) S.table = null;
      if (!CFG.views.some(v => v.id === S.view)) S.view = CFG.views[0].id;
      // パネルの「さっき保存したもの」から ?open=ID で開かれたら、その 1 件を開く
      const openId = new URLSearchParams(location.search).get("open");
      if (openId && ITEMS.some(x => x.id === openId)) { S.open = openId; history.replaceState(null, "", location.pathname); }
    } catch (e) { S.err = e.message || "読み込めませんでした"; }
    S.loading = false; render();
  }
  boot();
  return () => { document.removeEventListener("paste", onPaste); document.removeEventListener("keydown", onKey); removeEventListener("message", onYtMsg); ytHold.remove(); };
}
