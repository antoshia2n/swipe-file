/**
 * スワイプくんの画面（デモ 8 の形をそのまま本物のデータで動かす）。
 * 並び：上の帯｜左のメニュー（フォルダと表）｜表のタブ → ビューのタブ → 中身｜右から出るくわしくの窓。
 * 色と字は思考整理くんにそろえる。React は使わず、1 つの描き直し関数で全体を描く。
 *
 * 1便目に入れないもの：サイドパネル（2便目）・素材パックと共有ページ（3便目）。
 */
import * as D from "./data.js";

/* ── 決まった値 ───────────────────────────────────────── */
const GRADE = { 5: "S", 4: "A", 3: "B", 2: "C", 1: "D" };
const STAGES = ["未分析", "言語化", "仮説", "用途抽出"];
const KINDC = { x: "var(--k-x)", note: "var(--k-note)", lp: "var(--k-lp)", doc: "var(--k-doc)" };
const COLS = { shu: "種類", ref: "参考ポイント", grade: "評価", genre: "ジャンル", stage: "分析", tags: "ラベル", place: "場所", metric: "数字（保存時）", used: "使った", saved: "保存" };
const EXF = { "ポスト": ["投稿日", "いいね", "RT", "表示"], "記事": ["媒体", "価格", "スキ"], "教材": ["ページ数", "章の数", "価格"], "販売ページ": ["価格", "特典", "保証"] };
const LABEL_KEYS = { shu: "種類", ref: "参考ポイント", genre: "ジャンル", tag: "ラベル" };

export const DEFAULT_SETTINGS = () => ({
  v: 1,
  folders: [
    { id: "f-x", name: "Xポスト", parent: null },
    { id: "f-note", name: "note", parent: null },
    { id: "f-lp", name: "情報商材", parent: null },
    { id: "f-mine", name: "自分の資料", parent: null },
  ],
  tables: [
    { id: "t-note", name: "記事", folder: "f-note" },
    { id: "t-lp-page", name: "販売ページ", folder: "f-lp" },
    { id: "t-lp-pdf", name: "教材PDF", folder: "f-lp" },
    { id: "t-mine-boshu", name: "募集告知", folder: "f-mine" },
    { id: "t-mine-seminar", name: "セミナー資料", folder: "f-mine" },
    { id: "t-mine-style", name: "文体基準", folder: "f-mine" },
    { id: "t-mine-rule", name: "ルール", folder: "f-mine" },
    { id: "t-mine-video", name: "動画", folder: "f-mine" },
  ],
  views: [
    { id: "v1", name: "表", type: "table", f: {} },
    { id: "v2", name: "ギャラリー", type: "gal", f: {} },
    { id: "v3", name: "分析の段", type: "board", group: "stage", f: {} },
    { id: "v4", name: "参考ポイントごと", type: "board", group: "ref", f: {} },
    { id: "v5", name: "A 以上", type: "table", f: { star: 4 } },
    { id: "v6", name: "未分析", type: "table", f: { todo: true } },
  ],
  cols: ["shu", "ref", "grade", "genre", "stage", "tags", "used", "metric", "saved"],
  labels: {
    shu: ["ポスト", "記事", "教材", "販売ページ"],
    ref: ["構文", "内容", "セールスの流れ", "実績の見せ方"],
    genre: ["自己啓発", "X集客", "ライティング", "言語化", "マーケ", "習慣", "思考"],
    tag: ["募集告知", "セミナー資料", "文体基準", "有料教材", "販売ページ", "顧客の声", "自己開示", "スレッド", "図解"],
  },
});

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
  menu: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

/* ── 画面の起動 ───────────────────────────────────────── */
export function startApp(root) {
  let ITEMS = [];
  let CFG = DEFAULT_SETTINGS();
  const remembered = store.get("swipe.ui.v1", {});
  const S = {
    loading: true, err: "",
    loc: remembered.loc || "all", table: remembered.table || null, view: remembered.view || "v1",
    q: "", f: {}, sel: new Set(), open: null, navOn: innerWidth > 860,
    colPop: false, cellPop: null, dragCol: null, modal: null, add: null, delArm: false, bodyEdit: false, saving: 0,
  };

  root.innerHTML = `<div id="app">
    <div class="top gut">
      <div class="brand">スワイプくん<span>.</span></div>
      <div class="top-r"><span class="lsub" id="saveState"></span><button class="ink" id="addBtn">＋ 足す</button></div>
    </div>
    <div class="screen" id="screen"></div>
  </div><div class="toast" id="toast" hidden></div>`;
  const $ = (s, el = root) => el.querySelector(s);
  const screen = $("#screen");

  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3200); }
  function remember() { store.set("swipe.ui.v1", { loc: S.loc, table: S.table, view: S.view }); }
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
  addEventListener("beforeunload", e => { if (timers.size || S.saving > 0) { e.preventDefault(); e.returnValue = ""; } });

  /* ── フォルダと表 ───────────────────────────────────── */
  const tableOf = id => CFG.tables.find(t => t.id === id);
  const folderOf = id => CFG.folders.find(f => f.id === id);
  const pathOf = tid => { const t = tableOf(tid); if (!t) return ["未整理"]; const p = []; let f = folderOf(t.folder); while (f) { p.unshift(f.name); f = folderOf(f.parent); } return [...p, t.name]; };
  const tablesIn = fid => { const out = CFG.tables.filter(t => t.folder === fid); CFG.folders.filter(f => f.parent === fid).forEach(f => out.push(...tablesIn(f.id))); return out; };
  const rootOf = tid => { const t = tableOf(tid); let f = t && folderOf(t.folder); while (f && f.parent) f = folderOf(f.parent); return f?.id || ""; };
  const kindOf = it => { const r = rootOf(it.table); if (r === "f-mine") return "doc"; if (it.shu === "ポスト" || r === "f-x") return "x"; if (it.shu === "記事" || r === "f-note") return "note"; return "lp"; };
  const unsorted = () => ITEMS.filter(it => !tableOf(it.table));

  /** X の月の表（x-2026-10）が無ければ、年のフォルダと一緒に作る */
  function ensureMonth(tid) {
    const m = /^x-(\d{4})-(\d{2})$/.exec(tid || "");
    if (!m || tableOf(tid)) return false;
    const fid = `f-x-${m[1]}`;
    if (!folderOf("f-x")) CFG.folders.unshift({ id: "f-x", name: "Xポスト", parent: null });
    if (!folderOf(fid)) CFG.folders.push({ id: fid, name: `${m[1]}年`, parent: "f-x" });
    CFG.tables.push({ id: tid, name: `${+m[2]}月`, folder: fid });
    CFG.tables.sort((a, b) => (/^x-/.test(a.id) && /^x-/.test(b.id) ? b.id.localeCompare(a.id) : 0));
    CFG.folders.sort((a, b) => (/^f-x-/.test(a.id) && /^f-x-/.test(b.id) ? b.id.localeCompare(a.id) : 0));
    return true;
  }
  const labelList = key => {
    const fromItems = key === "shu" ? ITEMS.map(i => i.shu) : ITEMS.flatMap(i => key === "ref" ? i.ref : key === "genre" ? i.genre : i.tags);
    return uniq([...(CFG.labels[key] || []), ...fromItems]);
  };

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
  const matchQ = (it, q) => [it.title, it.body, it.excerpt, it.author, it.handle, it.a.why, it.a.hypo, it.a.idea, it.tags.join(" "), it.ref.join(" "), it.genre.join(" "), it.shu, it.file?.name || "", it.url].join("\n").toLowerCase().includes(q);
  function labelFilter(a, f) {
    if (f.shu) a = a.filter(it => it.shu === f.shu);
    if (f.ref) a = a.filter(it => it.ref.includes(f.ref));
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
  const chipsHTML = (arr, c, max = 2) => arr.length ? `<div class="chips">${arr.slice(0, max).map(x => `<span class="chip" style="--c:${c}">${esc(x)}</span>`).join("")}${arr.length > max ? `<span class="chip">+${arr.length - max}</span>` : ""}</div>` : '<span class="num">―</span>';
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
    const nv = (key, label, n, opts = {}) => `<button class="nv ${S.loc === key ? "on" : ""} ${opts.cls || ""}" data-loc="${key}">${opts.icon || `<span class="nv-dot" style="--c:${opts.c || "var(--faint)"}"></span>`}<span class="nv-l">${esc(label)}</span><span class="nv-n">${n}</span></button>`;
    const tree = (parent, depth) => CFG.folders.filter(f => f.parent === parent).map(f => {
      const n = tablesIn(f.id).reduce((s, t) => s + cnt(it => it.table === t.id), 0);
      return nv("f:" + f.id, f.name, n, { icon: IC.folder, cls: "d" + Math.min(depth, 2) }) + tree(f.id, depth + 1);
    }).join("");
    const un = unsorted().length;
    return `<nav class="nav ${S.navOn ? "" : "off"}" aria-label="メニュー"><div class="nav-list">
      ${nv("all", "すべて（横断）", ITEMS.length)}
      ${nv("todo", "未分析", cnt(it => stageOf(it) === 0), { c: "var(--accent)", cls: "warn" })}
      ${nv("ai", "Claude に頼んだ分析", cnt(it => it.ai), { c: "var(--k-doc)" })}
      ${un ? nv("unsorted", "未整理（置き場なし）", un, { c: "var(--k-lp)" }) : ""}
      <div class="nh"><span>フォルダ</span><button id="addFolder" aria-label="フォルダを足す" title="フォルダを足す">＋</button></div>
      ${tree(null, 0)}
    </div><div class="nav-foot">AI から読む入口：<b>swipe-mcp</b>。種類・参考ポイント・評価・ジャンル・分析・ラベルを指定して探す。</div></nav>`;
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
    return sel("shu", "種類", labelList("shu").map(x => [x, x])) + sel("ref", "参考ポイント", labelList("ref").map(x => [x, x])) + sel("star", "評価", [[5, "S"], [4, "A 以上"], [3, "B 以上"]])
      + sel("genre", "ジャンル", labelList("genre").map(x => [x, x])) + sel("stagex", "分析", STAGES.map((x, i) => [i, x])) + sel("tag", "ラベル", labelList("tag").map(x => [x, x]));
  }
  function colPopHTML() {
    const all = [...CFG.cols, ...Object.keys(COLS).filter(k => !CFG.cols.includes(k))];
    return `<div class="colpop" role="dialog" aria-label="列の並び"><div class="cp-h">列の並びと表示（見出しのドラッグでも変えられる）</div>
      ${all.map(k => { const on = CFG.cols.includes(k); return `<div class="cp-r"><label><input type="checkbox" data-colshow="${k}" ${on ? "checked" : ""}>${esc(COLS[k])}</label>
        ${on ? `<button data-colmv="${k}:-1" aria-label="上へ">${IC.up}</button><button data-colmv="${k}:1" aria-label="下へ">${IC.down}</button>` : ""}</div>`; }).join("")}</div>`;
  }
  /* 表のセルをその場で直す（Notion のように押すと選べる窓が出る） */
  const FIELD_OF = { shu: "shu", ref: "ref", genre: "genre", tag: "tags" };
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
    const btn = screen.querySelector(`[data-cp="${S.cellPop.key}"][data-id="${S.cellPop.id}"]`);
    if (!btn) { pop.remove(); return; }
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    const top = r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    pop.style.left = left + "px"; pop.style.top = top + "px";
  }
  function cellHTML(k, it) {
    switch (k) {
      case "grade": return gradeHTML(it);
      case "shu": return cellPick(it, "shu", it.shu ? `<span class="chip" style="--c:var(--k-doc)">${esc(it.shu)}</span>` : '<span class="num">―</span>');
      case "ref": return cellPick(it, "ref", chipsHTML(it.ref, "var(--l-kata)"));
      case "genre": return cellPick(it, "genre", chipsHTML(it.genre, "var(--l-yoto)"));
      case "stage": return stageHTML(it);
      case "place": return `<span class="num">${esc(pathOf(it.table).join(" / "))}</span>`;
      case "metric": return `<span class="num">${esc(metricOf(it))}</span>`;
      case "tags": return cellPick(it, "tag", chipsHTML(it.tags, "var(--faint)", 1));
      case "saved": return `<span class="num">${esc(it.saved)}</span>`;
      case "used": return `<span class="num">${it.used.length ? it.used.length + " 回" : "―"}</span>`;
      default: return "";
    }
  }
  function tableHTML(a) {
    const base = CFG.cols.filter(k => COLS[k]);
    const cols = S.loc.startsWith("f:") ? base : (base.includes("place") ? base : [...base.slice(0, 4), "place", ...base.slice(4)]);
    return `<div class="card"><div class="tw"><table><thead><tr><th style="width:36px"></th><th>見出し</th>${cols.map(k => `<th class="dragc" draggable="true" data-col="${k}">${esc(COLS[k])}</th>`).join("")}</tr></thead><tbody>
    ${a.map(it => `<tr class="${S.sel.has(it.id) ? "sel" : ""}">
      <td><input type="checkbox" class="ck" data-ck="${it.id}" ${S.sel.has(it.id) ? "checked" : ""} aria-label="選ぶ"></td>
      <td><button class="namebtn" data-open="${it.id}"><span class="nm">${esc(it.title)}</span><span class="snip">${esc(it.a.why || it.excerpt || it.body.slice(0, 120))}</span></button></td>
      ${cols.map(k => `<td>${cellHTML(k, it)}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div></div>`;
  }
  const galHTML = it => `<button class="gcard" data-open="${it.id}">${shotHTML(it)}<div class="g-t">${esc(it.title)}</div><div class="g-ft">${gradeHTML(it, true)}${stageHTML(it)}</div></button>`;
  function boardHTML(a, group) {
    let cols;
    if (group === "stage") cols = STAGES.map((n, i) => [n, a.filter(it => stageOf(it) === i)]);
    else { cols = labelList("ref").map(k => [k, a.filter(it => it.ref.includes(k))]); cols.push(["参考ポイントが未設定", a.filter(it => !it.ref.length)]); }
    return `<div class="board">${cols.map(([n, its]) => `<div class="col"><div class="col-h">${esc(n)}<span class="n">${its.length}</span></div>
      ${its.map(it => `<button class="bcard" data-open="${it.id}"><span class="b-t">${esc(it.title)}</span><span class="g-ft">${gradeHTML(it, true)}<span class="num">${esc(pathOf(it.table).join(" / "))}</span></span></button>`).join("")}</div>`).join("")}</div>`;
  }
  function listHTML() {
    const l = S.loc, inFolder = l.startsWith("f:");
    let crumb = ["スワイプくん"], title, lead = "";
    if (inFolder) {
      const fid = l.slice(2); const ts = CFG.tables.filter(t => t.folder === fid);
      if (!ts.some(t => t.id === S.table)) S.table = ts[0].id;
      crumb = ["スワイプくん", ...pathOf(S.table).slice(0, -2)]; title = folderOf(fid).name;
    } else if (l === "all") { title = curView().f.todo ? "未分析" : "すべて（横断）"; lead = curView().f.todo ? "保存はしたが分析が空のもの。" : "全部のフォルダと表をまとめて見る。"; }
    else if (l === "ai") { title = "Claude に頼んだ分析"; lead = "印が付いたものは、次に Claude が道具で読んだときに、空いている段へ下書きを入れる。"; }
    else if (l === "unsorted") { title = "未整理（置き場なし）"; lead = "どの表にも入っていないもの。開いて「場所」から表を選ぶと、ここから消える。"; }
    const a = filtered(), v = curView(), f = { ...v.f, ...S.f };
    const tabs = inFolder ? `<div class="ttabs" role="tablist" aria-label="このフォルダの表">${CFG.tables.filter(t => t.folder === l.slice(2)).map(t =>
      `<button class="ttab ${t.id === S.table ? "on" : ""}" data-table="${t.id}" title="ダブルクリックで名前を変える">${esc(t.name)}<span class="n">${ITEMS.filter(it => it.table === t.id).length}</span></button>`).join("")}<button class="ttab add" id="addTable" data-folder="${esc(l.slice(2))}">＋ 表</button></div>` : "";
    const vtab = x => `<button class="vtab ${x.id === S.view ? "on" : ""}" data-view="${x.id}">${IC[x.type === "gal" ? "gal" : x.type === "board" ? "board" : "table"]}${esc(x.name)}</button>`;
    const anyF = Object.values(S.f).some(x => x !== "" && x !== undefined && x !== 0) || S.q;
    let content;
    if (S.loading) content = `<div class="card empty">読み込んでいます…</div>`;
    else if (S.err) content = `<div class="card empty">${esc(S.err)}<br><button class="ghost" id="reload" style="margin-top:10px">もう一度読む</button></div>`;
    else if (!a.length) content = `<div class="card empty">${ITEMS.length ? "当てはまるものはありません。<br>絞り込みを外すか、別のビューを選んでください。" : "まだ 1 件もありません。右上の「＋ 足す」から入れてください。"}</div>`;
    else if (v.type === "gal") content = `<div class="gal">${a.map(galHTML).join("")}</div>`;
    else if (v.type === "board") content = boardHTML(a, v.group);
    else content = tableHTML(a);
    const colBtn = v.type === "table" ? `<span class="colbtn"><button class="ghost" id="colBtn" aria-expanded="${S.colPop}">列</button>${S.colPop ? colPopHTML() : ""}</span>` : "";
    const moveOpts = CFG.tables.map(t => `<option value="${t.id}">${esc(pathOf(t.id).join(" / "))}</option>`).join("");
    return `<div class="wrap gut">${headHTML(crumb, title, lead)}${tabs}
      <div class="vrow"><div class="vtabs" role="tablist" aria-label="ビュー">${CFG.views.map(vtab).join("")}<button class="vtab" id="addView">＋ ビュー</button></div>
        <label class="lq">${IC.search}<input id="q" placeholder="本文・分析・投稿者で探す" value="${esc(S.q)}" aria-label="探す"></label></div>
      <div class="frow">${labelSels(S.f, "f")}
        ${anyF ? `<button class="fclear" id="fClear">絞り込みを外す</button>` : ""}<span class="lsub" style="margin-left:auto">${a.length} 件${f.star || f.todo ? `・ビュー「${esc(v.name)}」の条件つき` : ""}</span>${colBtn}</div>
      ${S.sel.size ? `<div class="bulk"><span>${S.sel.size} 件を選択中</span><select id="bulkMove" aria-label="移す先"><option value="">表へ移す…</option>${moveOpts}</select><button id="bulkClear">選択をやめる</button></div>` : ""}
      ${content}</div>`;
  }

  /* ── くわしくの窓 ───────────────────────────────────── */
  function hlBody(it) { let h = esc(it.body); it.hl.forEach(x => { const e = esc(x.t); if (e) h = h.split(e).join(`<mark class="hl" title="${esc(x.r)}">${e}</mark>`); }); return h; }
  function detailHTML() {
    const it = ITEMS.find(x => x.id === S.open); if (!it) return "";
    const step = (k, i, label, hint, ph) => `<div class="step ${(it.a[k] || "").trim() ? "done" : ""}"><div class="sn">${i}</div><div><div class="sl">${label}<span>${hint}</span></div>
      <textarea class="dt-ta" id="a-${k}" data-a="${k}" placeholder="${esc(ph)}">${esc(it.a[k])}</textarea></div></div>`;
    const picks = (arr, key, field, c) => `<div class="pick">${labelList(key).map(x => `<button class="pk ${arr.includes(x) ? "on" : ""}" style="--c:${c}" data-pk="${field}" data-v="${esc(x)}">${esc(x)}</button>`).join("")}<button class="pk" data-newlabel="${key}" title="選べる値を足す">＋</button></div>`;
    const m = it.m || {};
    const nums = [m.like && (String(m.like).startsWith("スキ") ? m.like : "いいね " + m.like), m.rt && "RT " + m.rt, m.view && "表示 " + m.view].filter(Boolean).join("・");
    const tableOpts = `${tableOf(it.table) ? "" : `<option value="" selected>未整理（置き場なし）</option>`}${CFG.tables.map(t => `<option value="${t.id}" ${t.id === it.table ? "selected" : ""}>${esc(pathOf(t.id).join(" / "))}</option>`).join("")}`;
    return `<div class="scrim" id="scrim"></div><aside class="detail" aria-label="くわしく">
     <div class="dt-top"><input class="dt-title dt-tin" id="dtTitle" value="${esc(it.title)}" aria-label="見出し">
       <button class="icon" id="dtClose" aria-label="閉じる">${IC.close}</button></div>
     <div class="dt-body">
      <div>${shotHTML(it, true)}${it.file ? `<a class="filelink" href="${esc(it.file.url)}" target="_blank" rel="noopener">${IC.file}${esc(it.file.name || "ファイルを開く")}${it.file.pages ? `（${esc(it.file.pages)} ページ）` : ""}</a>` : ""}
        <div class="hlbar" style="margin-top:8px"><label class="ghost" style="cursor:pointer">画像を差し替える<input type="file" id="shotIn" accept="image/*" hidden></label>${it.file ? "" : `<label class="ghost" style="cursor:pointer">PDF を付ける<input type="file" id="pdfIn" accept="application/pdf" hidden></label>`}</div></div>
      <dl class="props">
        <dt>評価</dt><dd>${gradeHTML(it)}</dd>
        <dt>種類</dt><dd><div class="pick">${labelList("shu").map(x => `<button class="pk ${it.shu === x ? "on" : ""}" style="--c:var(--k-doc)" data-pkone="${esc(x)}">${esc(x)}</button>`).join("")}<button class="pk" data-newlabel="shu" title="選べる値を足す">＋</button></div></dd>
        <dt>参考ポイント</dt><dd>${picks(it.ref, "ref", "ref", "var(--l-kata)")}</dd>
        <dt>ジャンル</dt><dd>${picks(it.genre, "genre", "genre", "var(--l-yoto)")}</dd>
        <dt>ラベル</dt><dd>${picks(it.tags, "tag", "tags", "var(--faint)")}</dd>
        <dt>場所</dt><dd><select class="lsel" id="moveTo" aria-label="表を移す">${tableOpts}</select></dd>
        <dt>投稿者</dt><dd><input class="dt-in" id="dtAuthor" value="${esc(it.author)}" placeholder="―"></dd>
        <dt>保存時の数字</dt><dd>${esc(nums) || "―"}</dd>
        <dt>リンク</dt><dd><input class="dt-in" id="dtUrl" value="${esc(it.url)}" placeholder="https://">${it.url ? ` <a href="${esc(it.url)}" target="_blank" rel="noopener">開く</a>` : ""}</dd>
        <dt>保存した日</dt><dd>${esc(it.saved)}</dd></dl>
      <div><div class="dt-h">分析（未分析 → 言語化 → 仮説 → 用途抽出）<span>${stageOf(it)} / 3</span></div><div class="steps">
        ${step("why", 1, "言語化", "なぜ良いかを言葉にする", "例：一文目で読み手の思い当たりを作っている")}
        ${step("hypo", 2, "仮説", "ほかでも効きそうな型", "例：対比に数字が入ると引用されやすい")}
        ${step("idea", 3, "用途抽出", "どこで・どう使うかを文章で", "例：2期の募集記事の冒頭で、0期の失敗談を先に置く形で使う")}
      </div></div>
      <label class="ai ${it.ai ? "on" : ""}"><input type="checkbox" id="aiAsk" ${it.ai ? "checked" : ""}><span><b>Claude に分析の下書きを頼む</b><br>次に Claude が道具で読んだとき、空いている段に下書きを入れ、参考ポイントとジャンルの候補も付ける。ラベルは決まった値の中からだけ選ぶ。書き換えるのは空の段だけ。</span></label>
      <div><div class="dt-h">本文（保存した時点の写し）<span>${S.bodyEdit ? "書き換え中" : "なぞって線を引ける"}</span></div>
        ${S.bodyEdit ? `<textarea class="dt-ta" id="bodyEdit" style="min-height:220px">${esc(it.body)}</textarea>` : `<div class="dt-v" id="bodyText" style="white-space:pre-wrap">${it.body ? hlBody(it) : '<span class="num">本文はまだありません</span>'}</div>`}
        <div class="hlbar">${S.bodyEdit ? "" : `<select class="lsel" id="hlRef" aria-label="線の参考ポイント">${labelList("ref").map(r => `<option>${esc(r)}</option>`).join("")}</select><button class="ghost" id="hlAdd">なぞったところに線を引く</button>`}<button class="ghost" id="bodyToggle">${S.bodyEdit ? "書き換えを終える" : "本文を書き換える"}</button></div>
        ${it.hl.length ? `<div class="hls">${it.hl.map((h, i) => `<div class="hli"><span class="chip" style="--c:var(--l-kata)">${esc(h.r)}</span><q>${esc(h.t)}</q><button data-hlrm="${i}" aria-label="線を消す">${IC.x}</button></div>`).join("")}</div>` : ""}</div>
      ${it.shu && EXF[it.shu] ? `<div><div class="dt-h">${esc(it.shu)}の欄<span>種類で変わる</span></div><div class="exg">${EXF[it.shu].map(k => `<label>${esc(k)}<input data-ex="${esc(k)}" value="${esc(it.ex[k] || "")}"></label>`).join("")}</div></div>` : ""}
      <div><div class="dt-h">使った記録<span>${it.used.length} 回</span></div><div class="used">${it.used.map((u, i) => `<div class="ur"><span class="d">${esc(u.d)}</span><span class="w">${esc(u.w)}</span><button data-usedrm="${i}" aria-label="消す">${IC.x}</button></div>`).join("")}</div>
        <div class="uadd" style="margin-top:6px"><input id="usedIn" placeholder="どの記事・セミナーで使ったか" aria-label="使った先"><button class="ghost" id="usedAdd">残す</button></div></div>
      <div class="dt-del"><button class="ghost ${S.delArm ? "danger" : ""}" id="delItem">${S.delArm ? "もう一度押すと消える" : "この 1 件を消す"}</button></div>
     </div></aside>`;
  }

  /* ── 足す窓 ─────────────────────────────────────────── */
  // 足す窓の置き場は「自動」が既定。自動は X→今月の表、note→記事、PDF→教材PDF、ほかは開いている表（無ければ未整理）
  const browsingTable = () => (S.loc.startsWith("f:") && tableOf(S.table) ? S.table : "");
  function addHTML() {
    const A = S.add;
    const opts = `<option value="" ${A.table === "" ? "selected" : ""}>自動（X は今月の表・note は記事・PDF は教材PDF・ほかは開いている表）</option>${CFG.tables.map(t => `<option value="${t.id}" ${t.id === A.table ? "selected" : ""}>${esc(pathOf(t.id).join(" / "))}</option>`).join("")}`;
    return `<div class="mscrim" id="mScrim"></div><div class="modal addm" role="dialog" aria-label="スワイプを足す">
      <div class="m-top"><b style="font-size:15px">スワイプを足す</b><button class="icon" id="mClose" aria-label="閉じる">${IC.x}</button></div>
      <div class="addf">
        <label>リンク<input id="adUrl" value="${esc(A.url)}" placeholder="https://x.com/… や note の URL（無くてもよい）"></label>
        <label>見出し<input id="adTitle" value="${esc(A.title)}" placeholder="空ならリンク先の題名か本文の書き出しから付ける"></label>
        <label>本文<textarea id="adBody" rows="6" placeholder="ポストや記事の本文を貼る（無くてもよい）">${esc(A.body)}</textarea></label>
        <div class="drop ${A.file ? "has" : ""}" id="drop">${A.file ? `${IC.file}<span>${esc(A.file.name)}</span><button class="icon" id="adFileX" aria-label="外す">${IC.x}</button>` : `画像か PDF をここへ落とす・貼る・<label class="lnk">選ぶ<input type="file" id="adFile" accept="image/*,application/pdf" hidden></label>`}</div>
        <label>言語化（なぜ良いか・あとで書いてもよい）<textarea id="adWhy" rows="2">${esc(A.why)}</textarea></label>
        <label>置き場<select id="adTable">${opts}</select></label>
      </div>
      <div class="m-foot"><span class="lsub">${A.busy ? "保存しています…" : "リンク・本文・ファイルのどれか 1 つがあれば保存できる"}</span><button class="ink" id="adSave" ${A.busy ? "disabled" : ""}>保存する</button></div></div>`;
  }

  /* ── 描く ───────────────────────────────────────────── */
  function render() {
    if (S.loc === "todo") { S.loc = "all"; S.view = "v6"; }
    if (S.loc.startsWith("f:") && !folderOf(S.loc.slice(2))) S.loc = "all";
    if (S.loc === "unsorted" && !unsorted().length) S.loc = "all";
    let body;
    if (S.loc.startsWith("f:") && !CFG.tables.some(t => t.folder === S.loc.slice(2))) body = subfoldersHTML(S.loc.slice(2));
    else body = listHTML();
    // 描き直しても、見ていた位置（縦・表の横）と、くわしくの窓の位置を保つ
    const keep = ["#main", ".tw", ".dt-body"].map(sel => { const el = screen.querySelector(sel); return el ? [sel, el.scrollTop, el.scrollLeft] : null; }).filter(Boolean);
    screen.innerHTML = navHTML() + `<main class="main" id="main">${body}</main>` + (S.open ? detailHTML() : "") + (S.modal === "add" ? addHTML() : "") + cellPopHTML();
    keep.forEach(([sel, t, l]) => { const el = screen.querySelector(sel); if (el) { el.scrollTop = t; el.scrollLeft = l; } });
    placeCellPop();
    remember();
  }
  function keepFocus(id, fn) { const el = document.getElementById(id); const pos = el ? el.selectionStart : 0; fn(); const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* 選べない欄 */ } } }
  const cur = () => ITEMS.find(x => x.id === S.open);
  const changed = (it, wait) => queueSave(it, wait);

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
  root.addEventListener("click", e => {
    const t = e.target, q = s => t.closest(s); let b;
    if (q("#addBtn")) { openAdd(); return; }
    if (!screen.contains(t)) return;
    let closed = false; if (!q(".colbtn") && S.colPop) { S.colPop = false; closed = true; }
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
    if (b = q("[data-open]")) { S.open = b.dataset.open; S.delArm = false; S.bodyEdit = false; render(); return; }
    if (q("#navBtn")) { S.navOn = !S.navOn; render(); return; }
    if (t.id === "scrim" || q("#dtClose")) { S.open = null; render(); return; }
    if (b = q("[data-newlabel]")) {
      const key = b.dataset.newlabel; const v = prompt(`${LABEL_KEYS[key]}に足す値`); if (!v || !v.trim()) return;
      CFG.labels[key] = uniq([...(CFG.labels[key] || []), v.trim()]); saveCfg();
      const it = b.dataset.for ? ITEMS.find(x => x.id === b.dataset.for) : cur(); if (it) { if (key === "shu") it.shu = v.trim(); else { const field = key === "tag" ? "tags" : key; it[field] = uniq([...it[field], v.trim()]); } changed(it, 0); }
      render(); return;
    }
    if (b = q("[data-pk]")) { const it = cur(); it[b.dataset.pk] = toggle(it[b.dataset.pk], b.dataset.v); changed(it, 300); render(); return; }
    if (b = q("[data-pkone]")) { const it = cur(); it.shu = it.shu === b.dataset.pkone ? "" : b.dataset.pkone; changed(it, 300); render(); return; }
    if (q("#bulkClear")) { S.sel.clear(); render(); return; }
    if (q("#hlAdd")) {
      const it = cur(); const sel = String(getSelection() || "").trim(); const box = $("#bodyText");
      if (!sel || !box || !it.body.includes(sel)) { toast("本文の中をなぞってから押してください"); return; }
      it.hl.push({ t: sel, r: $("#hlRef").value }); changed(it, 0); render(); toast("線を引きました"); return;
    }
    if (b = q("[data-hlrm]")) { const it = cur(); it.hl.splice(+b.dataset.hlrm, 1); changed(it, 0); render(); return; }
    if (q("#bodyToggle")) { S.bodyEdit = !S.bodyEdit; render(); return; }
    if (q("#usedAdd")) { const v = $("#usedIn").value.trim(); if (!v) { toast("使った先を書いてから押してください"); return; } const it = cur(); const p = D.jstParts(); it.used.unshift({ w: v, d: `${p.y}-${p.m}-${p.d}` }); changed(it, 0); render(); return; }
    if (b = q("[data-usedrm]")) { const it = cur(); it.used.splice(+b.dataset.usedrm, 1); changed(it, 0); render(); return; }
    if (q("#delItem")) {
      if (!S.delArm) { S.delArm = true; render(); return; }
      const it = cur(); clearTimeout(timers.get(it.id)); timers.delete(it.id);
      setSaving(1);
      D.deleteItem(it.id).then(() => { ITEMS = ITEMS.filter(x => x.id !== it.id); S.open = null; S.delArm = false; render(); toast("消しました"); })
        .catch(err => toast(err.message)).finally(() => setSaving(-1));
      return;
    }
    if (q("#mClose") || t.id === "mScrim") { if (!S.add?.busy) { S.modal = null; S.add = null; render(); } return; }
    if (q("#adSave")) { saveAdd(); return; }
    if (q("#adFileX")) { S.add.file = null; S.add.fileObj = null; render(); return; }
    if (closed) render();
  });
  root.addEventListener("dblclick", e => {
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
    if (t.dataset.grade) { const it = ITEMS.find(x => x.id === t.dataset.grade); it.star = +t.value || 0; changed(it, 0); render(); return; }
    if (t.dataset.ck) { const id = t.dataset.ck; t.checked ? S.sel.add(id) : S.sel.delete(id); render(); return; }
    if (t.dataset.f) { S.f[t.dataset.f] = t.dataset.f === "star" ? +t.value : t.value; render(); return; }
    if (t.dataset.colshow) { const k = t.dataset.colshow; CFG.cols = t.checked ? [...CFG.cols, k] : CFG.cols.filter(x => x !== k); saveCfg(); render(); return; }
    if (t.id === "moveTo") { const it = cur(); it.table = t.value || null; changed(it, 0); render(); toast(`「${pathOf(it.table).join(" / ")}」へ移しました`); return; }
    if (t.id === "bulkMove" && t.value) { let n = 0; ITEMS.forEach(it => { if (S.sel.has(it.id)) { it.table = t.value; changed(it, 0); n++; } }); S.sel.clear(); render(); toast(`${n} 件を「${pathOf(t.value).join(" / ")}」へ移しました`); return; }
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
    if (t.id === "q") { if (e.isComposing) return; S.q = t.value; keepFocus("q", render); return; }
    const it = cur();
    if (t.dataset.a && it) { it.a[t.dataset.a] = t.value; const st = t.closest(".step"); st && st.classList.toggle("done", !!t.value.trim()); changed(it); return; }
    if (t.dataset.ex && it) { it.ex = { ...it.ex, [t.dataset.ex]: t.value }; changed(it); return; }
    if (t.id === "dtTitle" && it) { it.title = t.value; it.titleAuto = false; changed(it); return; }
    if (t.id === "dtAuthor" && it) { it.author = t.value; changed(it); return; }
    if (t.id === "dtUrl" && it) { it.url = t.value.trim(); changed(it); return; }
    if (t.id === "bodyEdit" && it) { it.body = t.value; changed(it); return; }
    if (S.add) {
      if (t.id === "adUrl") S.add.url = t.value;
      else if (t.id === "adTitle") S.add.title = t.value;
      else if (t.id === "adBody") S.add.body = t.value;
      else if (t.id === "adWhy") S.add.why = t.value;
    }
  });
  screen.addEventListener("compositionend", e => { if (e.target.id === "q") { S.q = e.target.value; keepFocus("q", render); } });
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
  const onKey = e => { if (e.key === "Escape") { if (S.modal && !S.add?.busy) { S.modal = null; S.add = null; render(); } else if (S.cellPop) { S.cellPop = null; render(); } else if (S.colPop) { S.colPop = false; render(); } else if (S.open) { S.open = null; render(); } } };
  screen.addEventListener("scroll", () => placeCellPop(), true);
  addEventListener("resize", () => placeCellPop());
  document.addEventListener("paste", onPaste);
  document.addEventListener("keydown", onKey);

  /* ── 読み込み ───────────────────────────────────────── */
  async function boot() {
    S.loading = true; S.err = ""; render();
    try {
      const [items, cfg] = await Promise.all([D.loadItems(), D.loadSettings()]);
      ITEMS = items;
      let dirty = false;
      if (cfg && cfg.v) CFG = { ...DEFAULT_SETTINGS(), ...cfg, labels: { ...DEFAULT_SETTINGS().labels, ...(cfg.labels || {}) } };
      else dirty = true; // 初回：既定のフォルダと表を置く
      if (ensureMonth(D.monthTableId())) dirty = true;
      ITEMS.forEach(it => { if (ensureMonth(it.table)) dirty = true; });
      if (dirty) saveCfg();
      if (S.table && !tableOf(S.table)) S.table = null;
      if (!CFG.views.some(v => v.id === S.view)) S.view = CFG.views[0].id;
    } catch (e) { S.err = e.message || "読み込めませんでした"; }
    S.loading = false; render();
  }
  boot();
  return () => { document.removeEventListener("paste", onPaste); document.removeEventListener("keydown", onKey); };
}
