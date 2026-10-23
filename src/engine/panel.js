/**
 * スワイプくんの細い画面（/panel）。拡張機能「スワイプくんパネル」のサイドパネルの中で開く。
 * 見ているページを読む・撮るのは拡張機能（swipe-kun-panel/panel.js）。ここは頼んで、受け取って、保存する。
 * 形はデモ 8 のサイドパネルそのまま。保存までの操作は「保存する」1 回（撮り方・参考ポイントは前回のまま）。
 */
import * as D from "./data.js";

const GRADE = { 5: "S", 4: "A", 3: "B", 2: "C", 1: "D" };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 残せなくても動く */ } },
};
const IC = {
  post: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h6"/></svg>',
  screen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8"/></svg>',
  crop: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/></svg>',
  file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  x: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const REF_DEFAULT = ["構文", "内容", "セールスの流れ", "実績の見せ方"];

export function startPanel(root) {
  const S = {
    ext: false, page: null, err: "", loading: true,
    mode: store.get("swipe.pn.mode", "post"), thread: true,
    grade: 0, refs: new Set(store.get("swipe.pn.refs", [])), memo: "", table: "",
    busy: false, file: null, fileObj: null, items: [], cfg: null, saved: null,
  };
  root.innerHTML = `<div id="app" class="pn-app"><div class="pn-bar"><div class="brand" style="font-size:14px">スワイプくん<span>.</span></div><span class="lsub" id="pnState" style="margin-left:auto"></span><a class="ghost" href="/" target="_blank" rel="noopener">一覧を開く</a></div><div class="pn" id="pn"></div></div><div class="toast" id="toast" hidden></div>`;
  const $ = s => root.querySelector(s);
  const pn = $("#pn");
  const toast = msg => { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3200); };

  /* ── 拡張機能とのやりとり ─────────────────────────── */
  const inFrame = window.parent !== window;
  let seq = 0; const waiting = new Map();
  function ask(type, extra = {}, timeout = 20000) {
    if (!inFrame) return Promise.reject(new Error("拡張機能の中で開いていません"));
    return new Promise((ok, ng) => {
      const id = ++seq;
      const t = setTimeout(() => { waiting.delete(id); ng(new Error("拡張機能から返事がありません")); }, timeout);
      waiting.set(id, { ok: v => { clearTimeout(t); ok(v); }, ng: e => { clearTimeout(t); ng(e); } });
      window.parent.postMessage({ src: "swipe-kun", type, id, ...extra }, "*");
    });
  }
  addEventListener("message", e => {
    if (e.source !== window.parent) return;
    const m = e.data || {};
    if (m.src !== "swipe-kun-ext") return;
    if (m.type === "reply") { const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id); m.ok ? w.ok(m.data) : w.ng(new Error(m.error || "読めませんでした")); return; }
    if (m.type === "tab") { clearTimeout(peek.h); peek.h = setTimeout(peek, 400); }
  });

  async function peek() {
    if (!S.ext) return;
    try { S.page = await ask("peek", {}, 8000); S.err = ""; }
    catch (e) { S.page = null; S.err = e.message; }
    S.thread = true; render();
  }

  /* ── 置き場とラベル ───────────────────────────────── */
  const tables = () => (S.cfg?.tables || []);
  const tableName = id => { const t = tables().find(x => x.id === id); if (!t) { const m = /^x-(\d{4})-(\d{2})$/.exec(id || ""); return m ? `Xポスト / ${m[1]}年 / ${+m[2]}月` : "未整理"; } const fs = S.cfg.folders || []; const p = []; let f = fs.find(x => x.id === t.folder); while (f) { p.unshift(f.name); f = fs.find(x => x.id === f.parent); } return [...p, t.name].join(" / "); };
  const refList = () => [...new Set([...(S.cfg?.labels?.ref || REF_DEFAULT), ...S.items.flatMap(i => i.ref)])];
  function autoTable({ isX, url, isPdf }) {
    if (isX) return D.monthTableId();
    if (/note\.com\//.test(url || "") && tables().some(t => t.id === "t-note")) return "t-note";
    if (isPdf && tables().some(t => t.id === "t-lp-pdf")) return "t-lp-pdf";
    return "";
  }

  /* ── 描く ─────────────────────────────────────────── */
  const capBtn = (k, label) => `<button class="capb ${S.mode === k ? "on" : ""}" data-cap="${k}">${IC[k]}${label}</button>`;
  const capNote = { post: "ポストの枠だけを切り抜く。スレッドは 1 件ずつ切り抜いて縦に並べる。", screen: "いま画面に見えている範囲を 1 枚で撮る。", crop: "ページの上でなぞった範囲だけを撮る。図解の一部だけ欲しいとき。" };
  function fieldsHTML(isX, url) {
    const auto = autoTable({ isX, url });
    const opts = `<option value="">自動：${esc(tableName(auto))}</option>${tables().map(t => `<option value="${t.id}" ${S.table === t.id ? "selected" : ""}>${esc(tableName(t.id))}</option>`).join("")}`;
    return `<div class="dest"><div>保存先</div><select class="lsel mini" id="pnTable" aria-label="保存先">${opts}</select></div>
      <div class="frow"><span class="dt-h" style="margin:0">評価</span><select class="grade g${S.grade}" id="pnGrade" aria-label="評価">${["", 5, 4, 3, 2, 1].map(v => `<option value="${v}" ${String(v) === String(S.grade || "") ? "selected" : ""}>${v ? GRADE[v] : "―"}</option>`).join("")}</select><span class="lsub">空でもよい</span></div>
      <div><div class="dt-h">参考ポイント<span>前回の選び方を覚えておく</span></div><div class="pick">${refList().map(x => `<button class="pk ${S.refs.has(x) ? "on" : ""}" style="--c:var(--l-kata)" data-ref="${esc(x)}">${esc(x)}</button>`).join("")}</div></div>
      <div><div class="dt-h">ひとこと<span>空でもよい・分析の「言語化」に入る</span></div><textarea class="pn-in" id="pnMemo" placeholder="なぜ目に止まったか（あとで書いてもよい）">${esc(S.memo)}</textarea></div>`;
  }
  function pageBox() {
    if (!S.ext) return `<div class="box"><div class="box-h">見ているページを保存</div><div class="warnline">この画面は、拡張機能「スワイプくんパネル」のサイドパネルの中で開くと、見ているページ（X のポストやスレッド、販売ページなど）をそのまま取り込めます。いまは下から画像や PDF を入れられます。</div></div>`;
    if (S.loading && !S.page) return `<div class="box"><div class="box-h">見ているページを読んでいます…</div></div>`;
    if (!S.page) return `<div class="box"><div class="box-h">見ているページを保存</div><div class="warnline">${esc(S.err || "このページは読めません")}</div><button class="ghost" id="pnRetry">もう一度読む</button></div>`;
    const P = S.page, X = P.x;
    // 同じポスト・ページがもう保存されていたら知らせる（二重に保存しないため。保存は止めない）
    const dup = D.findSame(S.items, X ? `https://x.com/${X.main.handle}/status/${X.main.id}` : P.url);
    const dupLine = dup ? `<div class="dup">保存済み（${esc(dup.saved)}・${esc(tableName(dup.table))}）<a class="ghost" href="/?open=${encodeURIComponent(dup.id)}" target="_blank" rel="noopener">開く</a></div>` : "";
    if (X) {
      const posts = S.thread ? X.thread : [X.main];
      const m = X.main;
      const nums = [m.like && `いいね ${m.like}`, m.rt && `RT ${m.rt}`, m.view && `表示 ${m.view}`].filter(Boolean);
      return `<div class="box"><div class="box-h">このポストを保存<span>${dup ? "保存済み" : "自動で読み取った"}</span></div>${dupLine}
        <div class="xs-h"><div class="av" style="--c:var(--k-x)">${esc((m.name || m.handle || "X").slice(0, 1))}</div><div><div class="xs-n">${esc(m.name)}</div><div class="xs-u">@${esc(m.handle)}${m.time ? `・${esc(D.shortDate(m.time))}` : ""}</div></div></div>
        ${X.thread.length > 1 ? `<div class="thread"><div><b>スレッドを見つけた（本人の続きをあわせて ${X.thread.length} 件）</b></div>
          <div class="pick"><button class="pk ${S.thread ? "on" : ""}" data-thr="1">まとめて 1 件にする</button><button class="pk ${!S.thread ? "on" : ""}" data-thr="0">この 1 件だけ</button></div></div>` : ""}
        <div class="tparts">${posts.map((p, i) => `<div>${posts.length > 1 ? `<span>${i + 1}/${posts.length}</span>` : ""}${esc(p.text.length > 160 ? p.text.slice(0, 160) + "…" : p.text) || '<span>（本文なし・画像だけ）</span>'}</div>`).join("")}</div>
        ${nums.length ? `<div class="auto">${nums.map(n => `<span>${esc(n)}</span>`).join("")}</div>` : ""}
        <div><div class="dt-h">スクショの撮り方</div><div class="cap">${capBtn("post", "ポストだけ")}${capBtn("screen", "見えている範囲")}${capBtn("crop", "範囲を選ぶ")}</div><div class="dt-h" style="margin:6px 0 0;font-weight:500">${capNote[S.mode]}</div></div>
        ${fieldsHTML(true, P.url)}
        <button class="ink save" id="pnSave" ${S.busy ? "disabled" : ""}>${S.busy ? "保存しています…" : dup ? "もう一度保存する" : "保存する"}</button></div>`;
    }
    const mode = S.mode === "post" ? "screen" : S.mode;
    return `<div class="box"><div class="box-h">このページを保存<span>${esc(P.site)}</span></div>${dupLine}
      <div><div class="xs-n" style="font-size:13.5px">${esc(P.ogTitle || P.title || P.url)}</div>${P.desc ? `<div class="warnline" style="margin-top:4px">${esc(P.desc.slice(0, 140))}</div>` : ""}</div>
      <div><div class="dt-h">スクショの撮り方</div><div class="cap" style="grid-template-columns:repeat(2,1fr)">${capBtn("screen", "見えている範囲")}${capBtn("crop", "範囲を選ぶ")}</div><div class="dt-h" style="margin:6px 0 0;font-weight:500">${capNote[mode]}　ページ全体は GoFullPage で撮って下へ落とす。</div></div>
      ${fieldsHTML(false, P.url)}
      <button class="ink save" id="pnSave" ${S.busy ? "disabled" : ""}>${S.busy ? "保存しています…" : dup ? "もう一度保存する" : "保存する"}</button></div>`;
  }
  function dropBox() {
    const F = S.file;
    return `<div class="box"><div class="box-h">手元の画像や PDF を入れる<span>${S.ext && S.page ? "ページのリンクを付ける" : "どのページでも"}</span></div>
      <div class="drop ${F ? "has" : ""}" id="drop">${F ? `${IC.file}<span>${esc(F.name)}</span><button class="icon" id="pnFileX" aria-label="外す">${IC.x}</button>` : `GoFullPage の画像や PDF、⌘⇧4 で撮ったスクショを、ここへドラッグするか ⌘V で貼る。<br><label class="lnk">ファイルを選ぶ<input type="file" id="pnFile" accept="image/*,application/pdf" hidden></label>`}</div>
      ${F ? `<button class="ink save" id="pnFileSave" ${S.busy ? "disabled" : ""}>${S.busy ? "保存しています…" : "これを保存する"}</button>` : ""}</div>`;
  }
  function recentBox() {
    const todo = S.items.filter(it => !["why", "hypo", "idea"].some(k => (it.a[k] || "").trim())).length;
    const recent = S.items.slice(0, 5);
    if (!recent.length) return "";
    return `<div class="box"><div class="box-h">さっき保存したもの<span>未分析 ${todo} 件</span></div>
      <div class="pn-recent">${recent.map(it => `<a href="/?open=${encodeURIComponent(it.id)}" target="_blank" rel="noopener"><span class="t">${esc(it.title)}</span><span class="s">${esc(tableName(it.table))}・${esc(it.saved)}</span></a>`).join("")}</div></div>`;
  }
  function render() {
    const ta = document.activeElement?.id === "pnMemo" ? $("#pnMemo").selectionStart : null;
    pn.innerHTML = pageBox() + dropBox() + recentBox();
    $("#pnState").textContent = S.ext ? (S.page ? `${S.page.site} を見ています` : "") : "拡張機能の外";
    if (ta !== null) { const n = $("#pnMemo"); if (n) { n.focus(); n.setSelectionRange(ta, ta); } }
  }

  /* ── 保存 ─────────────────────────────────────────── */
  const dataUrlToFile = async (u, name) => new File([await (await fetch(u)).blob()], name, { type: "image/png" });
  function afterSave(it) {
    S.items.unshift(it); S.memo = ""; S.grade = 0; S.table = ""; S.busy = false;
    store.set("swipe.pn.refs", [...S.refs]); store.set("swipe.pn.mode", S.mode);
    render(); toast(`保存しました（${tableName(it.table)}）`);
  }
  async function savePage() {
    if (S.busy || !S.page) return;
    S.busy = true; render();
    try {
      const g = await ask("grab", { mode: S.page.x ? S.mode : (S.mode === "post" ? "screen" : S.mode), thread: S.thread }, 90000);
      const shotUrl = await D.uploadFile(await dataUrlToFile(g.shot, "shot.png"));
      const P = g.page || S.page, X = P.x;
      let f;
      if (X) {
        const posts = S.thread ? X.thread : [X.main], m = X.main;
        const ex = { "投稿日": m.time ? D.shortDate(m.time) : "", "いいね": m.like, "RT": m.rt, "表示": m.view };
        const props = { handle: "@" + m.handle, m: { like: m.like, rt: m.rt, view: m.view }, ex };
        if (posts.length > 1) props.thread = posts.map(p => p.text);
        f = { url: `https://x.com/${m.handle}/status/${m.id}`, body: posts.map(p => p.text).filter(Boolean).join("\n\n"), author: m.name, props, shu: "ポスト" };
      } else {
        f = { url: P.url, ogp: { title: P.ogTitle || P.title, description: P.desc } };
      }
      const table = S.table || autoTable({ isX: !!X, url: P.url });
      const it = await D.createItem({ ...f, why: S.memo, table, grade: S.grade, refs: [...S.refs], file: { kind: "img", url: shotUrl, name: "shot.png" } });
      S.saved = S.page.url; afterSave(it);
    } catch (e) { S.busy = false; render(); toast(e.message); }
  }
  async function saveFile() {
    if (S.busy || !S.fileObj) return;
    S.busy = true; render();
    try {
      const isPdf = S.fileObj.type === "application/pdf";
      const url = await D.uploadFile(S.fileObj);
      const P = S.ext ? S.page : null;
      const table = S.table || autoTable({ isX: false, url: P?.url, isPdf });
      const it = await D.createItem({ url: P?.url || "", ogp: P ? { title: P.ogTitle || P.title, description: P.desc } : null, why: S.memo, table, grade: S.grade, refs: [...S.refs], file: { kind: isPdf ? "pdf" : "img", url, name: S.fileObj.name } });
      S.file = null; S.fileObj = null; afterSave(it);
    } catch (e) { S.busy = false; render(); toast(e.message); }
  }
  function setFile(f) {
    if (!f) return;
    if (!(f.type.startsWith("image/") || f.type === "application/pdf")) { toast("入れられるのは画像か PDF です"); return; }
    S.fileObj = f; S.file = { name: f.name || "貼った画像" }; render();
  }

  /* ── 押したとき ───────────────────────────────────── */
  root.addEventListener("click", e => {
    const q = s => e.target.closest(s); let b;
    if (b = q("[data-cap]")) { S.mode = b.dataset.cap; store.set("swipe.pn.mode", S.mode); render(); return; }
    if (b = q("[data-thr]")) { S.thread = b.dataset.thr === "1"; render(); return; }
    if (b = q("[data-ref]")) { const v = b.dataset.ref; S.refs.has(v) ? S.refs.delete(v) : S.refs.add(v); render(); return; }
    if (q("#pnSave")) { savePage(); return; }
    if (q("#pnFileSave")) { saveFile(); return; }
    if (q("#pnFileX")) { S.file = null; S.fileObj = null; render(); return; }
    if (q("#pnRetry")) { peek(); return; }
  });
  root.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "pnGrade") { S.grade = +t.value || 0; render(); return; }
    if (t.id === "pnTable") { S.table = t.value; return; }
    if (t.id === "pnFile" && t.files[0]) setFile(t.files[0]);
  });
  root.addEventListener("input", e => { if (e.target.id === "pnMemo") S.memo = e.target.value; });
  root.addEventListener("dragover", e => { const d = e.target.closest?.("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  root.addEventListener("dragleave", e => { const d = e.target.closest?.("#drop"); if (d) d.classList.remove("over"); });
  root.addEventListener("drop", e => { const d = e.target.closest?.("#drop"); if (!d) return; e.preventDefault(); setFile([...e.dataTransfer.files][0]); });
  document.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith("image/") || x.type === "application/pdf"); if (f) { e.preventDefault(); setFile(f); } });

  /* ── 読み込み ─────────────────────────────────────── */
  (async () => {
    render();
    const hello = inFrame ? ask("hello", {}, 1500).then(() => true, () => false) : Promise.resolve(false);
    const [ext, items, cfg] = await Promise.all([hello, D.loadItems().catch(() => []), D.loadSettings().catch(() => null)]);
    S.ext = ext; S.items = items; S.cfg = cfg;
    if (S.ext) await peek();
    S.loading = false; render();
  })();
}
