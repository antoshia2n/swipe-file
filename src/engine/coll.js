/**
 * 素材パックと共有ページ（3便目・デモ 8 の形）。
 * どちらもスワイプと同じく「フォルダ＋表」で持ち、1 件を開くと編集の画面になる。
 *   素材パック：選んだスワイプと目的を 1 枚にまとめ、GPT や Claude へ渡す（swipe-mcp からも名前で読める）
 *   共有ページ：選んだスワイプにシアニンのコメントを付け、生徒にリンクで見せる（/s/{token}・ログインなし）
 * フォルダと表の並びは sw_settings の data.coll に、中身は sw_packs・sw_shares に置く。
 */
import * as D from "./data.js";

export const MAKES = ["X記事", "ポスト", "スレッド", "note", "セミナー資料", "販売ページ", "メルマガ", "動画の台本", "その他"];
export const DEFAULT_COLL = () => ({
  pack: {
    folders: [{ id: "pf-x", name: "X", parent: null }, { id: "pf-edu", name: "教材・セミナー", parent: null }],
    tables: [{ id: "pt-article", name: "X記事", folder: "pf-x" }, { id: "pt-post", name: "ポスト", folder: "pf-x" }, { id: "pt-seminar", name: "セミナー資料", folder: "pf-edu" }],
  },
  share: {
    folders: [{ id: "sf-lab", name: "しあらぼ", parent: null }, { id: "sf-course", name: "講座", parent: null }],
    tables: [{ id: "st-weekly", name: "毎週の見本", folder: "sf-lab" }, { id: "st-course", name: "教材の補足", folder: "sf-course" }],
  },
});

/** 素材パックを AI へ渡す文にする（swipe-mcp の swipe__get_pack と同じ並び） */
export function packText(pk, items, GRADE) {
  const its = pk.items.map(id => items.find(x => x.id === id)).filter(Boolean);
  const one = (it, i) => [
    `\n■ 見本 ${i + 1}：${it.title}`,
    `種類：${it.shu || "なし"}／参考ポイント：${it.ref.join("・") || "なし"}／評価：${GRADE[it.star] || "なし"}／ジャンル：${it.genre.join("・") || "なし"}`,
    it.url && `元のページ：${it.url}`,
    /^https?:/.test(it.shot || "") && `画像：${it.shot}`,
    it.file && `ファイル：${it.file.url}`,
    (it.body || it.excerpt) && `本文：${(it.body || it.excerpt).replace(/\n+/g, " ")}`,
    ...it.hl.filter(h => h.t).map(h => `線（${h.r}）：${h.t}`),
    ...it.hl.filter(h => h.box).map(h => `画像の印（${h.r}）${h.p ? `：${h.p} ページ目` : ""}`),
    it.a.why && `言語化：${it.a.why}`, it.a.hypo && `仮説：${it.a.hypo}`, it.a.idea && `用途抽出：${it.a.idea}`,
  ].filter(Boolean).join("\n");
  return [
    `【素材パック】${pk.name}`, `作るもの：${pk.make || "未設定"}`, `目的：${pk.goal || "未設定"}`, ``,
    `以下の ${its.length} 件を見本にする。見本の文をそのまま写さず、参考ポイントに書いた部分だけを借りること。`,
    ...its.map(one), ``,
    `Claude のチャットなら、swipe-mcp の swipe__get_pack でこの素材パック（${pk.name}）を名前で読める。`,
  ].join("\n");
}

const jstDate = iso => { if (!iso) return ""; const p = D.jstParts(iso); return `${p.y}-${p.m}-${p.d}`; };

/**
 * @param {object} x 画面の本体から借りる道具（ITEMS・設定・描き直し・部品の HTML など）
 */
export function createColl(x) {
  const { esc, IC, GRADE } = x;
  const DATA = { pack: [], share: [] };
  const missing = { pack: false, share: false };
  const CS = { pack: { loc: "all", table: null, open: null }, share: { loc: "all", table: null, open: null } };
  const U = { drawer: false, shTab: "edit", shSet: false, pick: null, mq: "", mf: {}, cedit: null, delArm: false };
  const LABEL = { pack: "素材パック", share: "共有ページ" };
  const LEAD = { pack: "選んだスワイプと目的をまとめ、GPT や Claude へ渡す。", share: "選んだスワイプにシアニンのコメントを付けて、生徒に見せる。" };

  const conf = k => x.cfg().coll[k];
  const items = () => x.items();
  const byId = id => items().find(i => i.id === id);
  const one = k => DATA[k].find(p => p.id === CS[k].open);
  const tableOf = (k, id) => conf(k).tables.find(t => t.id === id);
  const folderOf = (k, id) => conf(k).folders.find(f => f.id === id);
  const tablesIn = (k, fid) => { const out = conf(k).tables.filter(t => t.folder === fid); conf(k).folders.filter(f => f.parent === fid).forEach(f => out.push(...tablesIn(k, f.id))); return out; };
  const where = (k, tid) => { const t = tableOf(k, tid); if (!t) return "未整理"; const f = folderOf(k, t.folder); return `${f ? f.name + " / " : ""}${t.name}`; };
  const tableOpts = (k, cur) => `${tableOf(k, cur) ? "" : '<option value="" selected>未整理</option>'}${conf(k).tables.map(t => `<option value="${t.id}" ${t.id === cur ? "selected" : ""}>${esc(where(k, t.id))}</option>`).join("")}`;
  const shareUrl = s => `${location.origin}/s/${s.token}`;
  const expired = s => !!s.expire && new Date(s.expire) < new Date();

  /* ── 保存（打つたびに送らず、まとめて送る） ── */
  const timers = new Map();
  function queue(k, obj, wait = 700) {
    const key = k + obj.id; clearTimeout(timers.get(key));
    timers.set(key, setTimeout(async () => {
      timers.delete(key); x.setSaving(1);
      try { await (k === "pack" ? D.savePack(obj) : D.saveShare(obj)); obj.upd = D.shortDate(new Date().toISOString()); }
      catch (e) { x.toast(e.message); } finally { x.setSaving(-1); }
    }, wait));
  }
  const pending = () => timers.size > 0;

  async function load() {
    const [p, s] = await Promise.all([D.loadPacks(), D.loadShares()]);
    DATA.pack = p.rows; DATA.share = s.rows; missing.pack = p.missing; missing.share = s.missing;
  }

  async function create(k, table, itemsIn = []) {
    if (missing[k]) { x.toast(`${LABEL[k]}の表がまだありません（作業 27 のあとで使えます）`); return null; }
    x.setSaving(1);
    try {
      const t = table && tableOf(k, table) ? table : (CS[k].loc.startsWith("f:") && CS[k].table) || conf(k).tables[0]?.id || null;
      const obj = k === "pack" ? await D.createPack({ table: t, items: itemsIn }) : await D.createShare({ table: t, items: itemsIn.map(id => ({ id, c: "" })) });
      DATA[k].unshift(obj); return obj;
    } catch (e) { x.toast(e.message); return null; } finally { x.setSaving(-1); }
  }

  /** スワイプの表の「素材パックに入れる」「共有ページに入れる」から呼ぶ */
  async function addTo(k, id, ids) {
    let obj = id === "new" ? await create(k, null, []) : DATA[k].find(p => p.id === id);
    if (!obj) return;
    let n = 0;
    ids.forEach(sid => {
      if (k === "pack") { if (!obj.items.includes(sid)) { obj.items.push(sid); n++; } }
      else if (!obj.items.some(i => i.id === sid)) { obj.items.push({ id: sid, c: "" }); n++; }
    });
    queue(k, obj, 0);
    x.toast(`${n} 件を「${obj.name}」に入れました${n < ids.length ? `（${ids.length - n} 件は入っていた）` : ""}`);
    return obj;
  }
  const memberOf = (k, sid) => DATA[k].filter(o => k === "pack" ? o.items.includes(sid) : o.items.some(i => i.id === sid));
  function toggleMember(k, oid, sid) {
    const o = DATA[k].find(p => p.id === oid); if (!o) return;
    if (k === "pack") o.items = o.items.includes(sid) ? o.items.filter(i => i !== sid) : [...o.items, sid];
    else o.items = o.items.some(i => i.id === sid) ? o.items.filter(i => i.id !== sid) : [...o.items, { id: sid, c: "" }];
    queue(k, o, 0);
  }

  /* ── 左のメニュー ── */
  function navHTML(k) {
    const st = CS[k];
    const cntT = tid => DATA[k].filter(o => o.table === tid).length;
    const nv = (key, label, n, icon, cls = "") => `<button class="nv ${st.loc === key ? "on" : ""} ${cls}" data-cloc="${key}">${icon || '<span class="nv-dot" style="--c:var(--accent)"></span>'}<span class="nv-l">${esc(label)}</span><span class="nv-n">${n}</span></button>`;
    const tree = (p, d) => conf(k).folders.filter(f => f.parent === p).map(f => nv("f:" + f.id, f.name, tablesIn(k, f.id).reduce((s, t) => s + cntT(t.id), 0), IC.folder, "d" + Math.min(d, 2)) + tree(f.id, d + 1)).join("");
    const un = DATA[k].filter(o => !tableOf(k, o.table)).length;
    return `<nav class="nav ${x.S.navOn ? "" : "off"}" aria-label="${LABEL[k]}のメニュー"><div class="nav-list">${nv("all", "すべての" + LABEL[k], DATA[k].length)}
      ${un ? nv("unsorted", "未整理（置き場なし）", un, '<span class="nv-dot" style="--c:var(--k-lp)"></span>') : ""}
      <div class="nh"><span>フォルダ</span><button id="cAddFolder" aria-label="フォルダを足す" title="フォルダを足す">＋</button></div>${tree(null, 0)}</div>
      <div class="nav-foot">${esc(LEAD[k])}</div></nav>`;
  }

  /* ── 一覧 ── */
  const HEAD = { pack: ["名前", "作るもの", "見本", "更新"], share: ["名前", "公開", "件数", "開かれた数", "更新"] };
  const ROW = {
    pack: p => [`<span class="nm">${esc(p.name)}</span>`, p.make ? `<span class="chip" style="--c:var(--k-doc)">${esc(p.make)}</span>` : '<span class="num">―</span>', `<span class="num">${p.items.length} 件</span>`, `<span class="num">${esc(p.upd)}</span>`],
    share: s => [`<span class="nm">${esc(s.name)}</span>`, `<span class="live ${s.live && !expired(s) ? "on" : "off"}">${!s.live ? "止めている" : expired(s) ? "期限切れ" : "公開中"}</span>`, `<span class="num">${s.items.length} 件</span>`, `<span class="num">${s.opens} 回</span>`, `<span class="num">${esc(s.upd)}</span>`],
  };
  function listHTML(k) {
    const st = CS[k];
    let rows = DATA[k], title = "すべての" + LABEL[k], tabs = "", lead = LEAD[k];
    if (st.loc === "unsorted") { rows = DATA[k].filter(o => !tableOf(k, o.table)); title = "未整理（置き場なし）"; lead = "どの表にも入っていないもの。開いて「置き場」から表を選ぶと、ここから消える。"; }
    if (st.loc.startsWith("f:")) {
      const fid = st.loc.slice(2), ts = conf(k).tables.filter(t => t.folder === fid);
      if (!ts.some(t => t.id === st.table)) st.table = ts[0]?.id || null;
      title = folderOf(k, fid)?.name || ""; lead = ""; rows = DATA[k].filter(o => o.table === st.table);
      tabs = `<div class="ttabs" role="tablist" aria-label="このフォルダの表">${ts.map(t => `<button class="ttab ${t.id === st.table ? "on" : ""}" data-ctable="${t.id}" title="ダブルクリックで名前を変える">${esc(t.name)}<span class="n">${DATA[k].filter(o => o.table === t.id).length}</span></button>`).join("")}<button class="ttab add" id="cAddTable" data-folder="${esc(fid)}">＋ 表</button></div>`;
    }
    const all = st.loc === "all";
    const warn = missing[k] ? `<div class="card empty">${LABEL[k]}の表がまだありません。作業 27（表を作る SQL）が終わると使えます。</div>` : "";
    const body = warn || (rows.length ? `<div class="card"><div class="tw"><table class="ctab"><thead><tr>${HEAD[k].map(h => `<th>${h}</th>`).join("")}${all ? "<th>場所</th>" : ""}</tr></thead><tbody>
      ${rows.map(o => `<tr class="clickrow" data-copen="${o.id}">${ROW[k](o).map(v => `<td>${v}</td>`).join("")}${all ? `<td class="num">${esc(where(k, o.table))}</td>` : ""}</tr>`).join("")}</tbody></table></div></div>`
      : `<div class="card empty">${st.loc.startsWith("f:") && !st.table ? "このフォルダにはまだ表がありません。「＋ 表」から作ってください。" : `まだありません。「＋ 新しい${LABEL[k]}」か、スワイプの表で選んで「${LABEL[k]}に入れる」で作れます。`}</div>`);
    return `<div class="wrap gut">${x.headHTML([LABEL[k]], title, lead)}${tabs}
      <div class="vrow"><button class="ink" id="cNew" ${missing[k] ? "disabled" : ""}>＋ 新しい${LABEL[k]}</button><span class="lsub" style="margin-left:auto">${rows.length} 件</span></div>${body}</div>`;
  }

  /* ── 編集の画面 ── */
  const backHTML = k => { const o = one(k); return `<button class="backlink" id="cBack">${IC.up.replace('m6 15 6-6 6 6', 'm15 6-6 6 6 6')}${esc(LABEL[k])} / ${esc(where(k, o.table))}</button>`; };
  function rowItHTML(it, k, extra = "") {
    return `<div class="row-it">${x.gradeHTML(it, true) || '<span class="gchip">―</span>'}<div class="w"><button class="t namebtn" data-swopen="${it.id}" title="スワイプを開く">${esc(it.title)}</button><span class="s">${esc(it.shu || "種類なし")}${it.ref.length ? "・参考：" + esc(it.ref.join("・")) : ""}・${esc(x.pathOf(it.table).join(" / "))}</span>${extra}</div>
      <span class="acts"><button data-cmv="${it.id}:-1" aria-label="上へ">${IC.up}</button><button data-cmv="${it.id}:1" aria-label="下へ">${IC.down}</button><button data-crm="${it.id}" aria-label="外す">${IC.x}</button></span></div>`;
  }
  const delBtn = k => `<button class="ghost ${U.delArm ? "danger" : ""}" id="cDel">${U.delArm ? "もう一度押すと消える" : `この${LABEL[k]}を消す`}</button>`;
  function packEditor() {
    const pk = one("pack"), its = pk.items.map(byId).filter(Boolean), gone = pk.items.length - its.length;
    return `<div class="ed gut">${backHTML("pack")}
      <div class="ed-head"><input class="ttl" id="pkName" value="${esc(pk.name)}" aria-label="名前">
        <div class="ed-acts"><button class="ghost" id="pkDrawer">渡す文を見る</button><button class="ink" id="pkCopy">渡す文をコピー</button></div></div>
      <dl class="eprops"><dt>作るもの</dt><dd><select class="plain" id="pkMake"><option value="" ${pk.make ? "" : "selected"}>選ぶ</option>${MAKES.map(m => `<option ${m === pk.make ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></dd>
        <dt>置き場</dt><dd><select class="plain" id="cMove">${tableOpts("pack", pk.table)}</select></dd>
        <dt>目的</dt><dd><textarea class="plain-ta" id="pkGoal" rows="2" placeholder="何を、誰に向けて作るか">${esc(pk.goal)}</textarea></dd></dl>
      <div class="sec-h"><span>見本 ${its.length} 件${gone ? `（消したスワイプ ${gone} 件は外して出す）` : ""}</span><button class="ghost" id="cPick">＋ 見本を足す</button></div>
      <div class="rows">${its.map(it => rowItHTML(it, "pack")).join("") || '<div class="empty">まだ見本がありません。「＋ 見本を足す」から選ぶか、スワイプの表で選んで「素材パックに入れる」。</div>'}</div>
      <div class="ed-foot">${delBtn("pack")}</div>
    </div>
    ${U.drawer ? `<div class="scrim" id="pkDrawerX"></div><aside class="detail" aria-label="渡す文"><div class="dt-top"><div class="dt-title">渡す文</div><button class="ghost" id="pkCopy2">コピー</button><button class="icon" id="pkDrawerX2" aria-label="閉じる">${IC.close}</button></div>
      <div class="dt-body"><div class="lsub">GPT のプロジェクトへ貼るか、Claude に「素材パック『${esc(pk.name)}』で書いて」と言う。</div><pre class="handoff" id="pkText">${esc(packText(pk, items(), GRADE))}</pre></div></aside>` : ""}`;
  }
  function setPopHTML(sh) {
    return `<div class="pop" role="dialog" aria-label="共有の設定">
      <div class="pop-r"><span class="live ${sh.live && !expired(sh) ? "on" : "off"}">${!sh.live ? "止めている" : expired(sh) ? "期限切れ" : "公開中"}</span><span class="stat">開かれた数 <b>${sh.opens}</b> 回${sh.last ? `・最後 ${esc(sh.last)}` : ""}</span></div>
      <div class="pop-r"><span class="url">${esc(shareUrl(sh))}</span><button class="ghost" id="shCopy">コピー</button><a class="ghost" href="${esc(shareUrl(sh))}" target="_blank" rel="noopener">開く</a></div>
      <div class="pop-r"><button class="ghost" id="shLive">${sh.live ? "リンクを止める" : "公開を再開する"}</button>
        <label>期限 <input type="date" class="lsel" id="shExp" style="height:28px" value="${esc(jstDate(sh.expire))}"></label>${sh.expire ? '<button class="ghost" id="shExpX">期限なし</button>' : ""}</div>
      <div class="pop-h">生徒に見せるもの</div>
      <label class="pop-c"><input type="checkbox" id="shHypo" ${sh.showHypo ? "checked" : ""}>仮説</label>
      <label class="pop-c"><input type="checkbox" id="shIdea" ${sh.showIdea ? "checked" : ""}>用途抽出</label>
      <label class="pop-c"><input type="checkbox" id="shFile" ${sh.showFile ? "checked" : ""}>PDF などのファイル</label>
      <label class="pop-c"><input type="checkbox" id="shCta" ${sh.cta ? "checked" : ""}>最後にしあらぼの案内</label>
      ${sh.cta ? `<textarea class="plain-ta" id="shCtaText" rows="2" style="border:1px solid var(--line)" placeholder="案内の文">${esc(sh.ctaText)}</textarea>
        <div class="pop-r"><input class="plain" id="shCtaBtn" style="border:1px solid var(--line);flex:1" value="${esc(sh.ctaBtn)}" placeholder="ボタンの文字"></div>
        <input class="plain" id="shCtaUrl" style="border:1px solid var(--line)" value="${esc(sh.ctaUrl)}" placeholder="ボタンの行き先 https://…（空ならボタンを出さない）">` : ""}</div>`;
  }
  function shareEditor() {
    const sh = one("share"), its = sh.items.map(i => ({ it: byId(i.id), c: i.c })).filter(v => v.it);
    const edit = `<dl class="eprops"><dt>置き場</dt><dd><select class="plain" id="cMove">${tableOpts("share", sh.table)}</select></dd>
        <dt>はじめに</dt><dd><textarea class="plain-ta" id="shIntro" rows="2" placeholder="ページの最初に出すシアニンのコメント">${esc(sh.intro)}</textarea></dd></dl>
      <div class="sec-h"><span>スワイプ ${its.length} 件</span><button class="ghost" id="cPick">＋ 足す</button></div>
      <div class="rows">${its.map(({ it, c }) => rowItHTML(it, "share", U.cedit === it.id || c ? `<textarea class="plain-ta cmt-in" data-shc="${it.id}" rows="1" placeholder="シアニンのコメント（空なら出さない）">${esc(c)}</textarea>` : `<button class="addcmt" data-cedit="${it.id}">＋ コメント</button>`)).join("") || '<div class="empty">まだ何も入っていません。「＋ 足す」から選ぶか、スワイプの表で選んで「共有ページに入れる」。</div>'}</div>
      <div class="ed-foot">${delBtn("share")}</div>`;
    return `<div class="ed gut">${backHTML("share")}
      <div class="ed-head"><input class="ttl" id="shName" value="${esc(sh.name)}" aria-label="ページの題名">
        <div class="ed-acts"><div class="tabs"><button class="tab ${U.shTab === "edit" ? "on" : ""}" data-shtab="edit">編集</button><button class="tab ${U.shTab === "view" ? "on" : ""}" data-shtab="view">生徒の見え方</button></div>
          <span class="setwrap"><button class="ink" id="shSet" aria-expanded="${U.shSet}">共有${sh.live ? "" : "（止めている）"}</button>${U.shSet ? setPopHTML(sh) : ""}</span></div></div>
      ${U.shTab === "edit" ? edit : previewHTML(sh, its)}</div>`;
  }
  // 生徒の見え方。本物の /s/{token} と同じ並び（functions/s/[token].js）
  function previewHTML(sh, its) {
    if (!sh.live || expired(sh)) return `<div class="stopped">${!sh.live ? "このページは公開を止めています。" : "このページは期限が切れています。"}<br>生徒がリンクを開くと、この文だけが出ます。</div>`;
    return `<div class="sh-wrap" style="padding-block:8px 40px"><header class="sh-head"><div class="sh-k">シアニンのスワイプ</div><h1 class="sh-t">${esc(sh.name)}</h1>${sh.intro ? `<p class="sh-d">${esc(sh.intro)}</p>` : ""}<div class="sh-by">${its.length} 件</div></header>
      ${its.map(({ it, c }, i) => `<article class="sh-item"><div>${x.shotHTML(it)}</div><div style="min-width:0"><span class="sh-no">${String(i + 1).padStart(2, "0")} / ${String(its.length).padStart(2, "0")}</span>
        <h2 class="sh-it">${esc(it.title)}</h2>${c ? `<div class="cmt"><div class="cmt-l">シアニンのコメント</div>${esc(c)}</div>` : ""}
        ${it.hl.some(h => h.t) ? `<div class="sh-lab">見てほしい所</div>${it.hl.filter(h => h.t).map(h => `<p class="sh-txt"><mark class="hl">${esc(h.t)}</mark>（${esc(h.r)}）</p>`).join("")}` : ""}
        ${it.a.why ? `<div class="sh-lab">言語化</div><p class="sh-txt">${esc(it.a.why)}</p>` : ""}
        ${sh.showHypo && it.a.hypo ? `<div class="sh-lab">仮説</div><p class="sh-txt">${esc(it.a.hypo)}</p>` : ""}
        ${sh.showIdea && it.a.idea ? `<div class="sh-lab">用途抽出</div><p class="sh-txt">${esc(it.a.idea)}</p>` : ""}
        ${sh.showFile && it.file ? `<a class="filelink" href="${esc(it.file.url)}" target="_blank" rel="noopener">${IC.file}${esc(it.file.name || "ファイル")} を開く</a>` : ""}
        ${it.url ? `<a class="filelink" href="${esc(it.url)}" target="_blank" rel="noopener">${IC.link}元のページを開く</a>` : ""}
      </div></article>`).join("")}
      ${sh.cta ? `<div class="cta"><div class="cta-t">${esc(sh.ctaText)}</div>${sh.ctaUrl ? `<span class="cta-b">${esc(sh.ctaBtn || "くわしく見る")}</span>` : ""}</div>` : ""}</div>`;
  }

  /* ── 探して足す窓 ── */
  function pickHTML(k) {
    const o = one(k); if (!o) return "";
    const inIds = new Set(k === "pack" ? o.items : o.items.map(i => i.id));
    const q = U.mq.trim().toLowerCase();
    const hits = x.labelFilter(items().filter(it => !q || x.matchQ(it, q)), U.mf).slice(0, 300);
    return `<div class="mscrim" id="cmScrim"></div><div class="modal" role="dialog" aria-label="スワイプを足す">
      <div class="m-top"><label class="lq" style="margin:0;width:100%;height:40px">${IC.search}<input id="cmq" placeholder="探して足す（本文・分析・投稿者）" value="${esc(U.mq)}" aria-label="探す"></label><button class="icon" id="cmClose" aria-label="閉じる">${IC.x}</button></div>
      <div class="frow m-f">${x.labelSels(U.mf, "mf")}</div>
      <div class="m-list">${hits.map(it => `<button class="m-it ${inIds.has(it.id) ? "in" : ""}" data-madd="${it.id}">${x.gradeHTML(it, true) || '<span class="gchip">―</span>'}<span class="w"><span class="t">${esc(it.title)}</span><span class="s">${esc(x.pathOf(it.table).join(" / "))}${it.shu ? "・" + esc(it.shu) : ""}</span></span><span class="mk">${inIds.has(it.id) ? "入っている" : "＋ 足す"}</span></button>`).join("") || '<div class="empty">当てはまるものがありません</div>'}</div>
      <div class="m-foot"><span class="lsub">${inIds.size} 件が入っている</span><button class="ink" id="cmClose2">閉じる</button></div></div>`;
  }

  function mainHTML(k) {
    const st = CS[k];
    if (st.open && !one(k)) st.open = null;
    if (st.loc.startsWith("f:") && !folderOf(k, st.loc.slice(2))) st.loc = "all";
    const main = st.open ? (k === "pack" ? packEditor() : shareEditor()) : listHTML(k);
    return (st.open ? "" : navHTML(k)) + `<main class="main" id="main">${main}</main>` + (U.pick ? pickHTML(k) : "");
  }

  /* ── 押したとき（扱ったら true） ── */
  async function copy(text, msg) { try { await navigator.clipboard.writeText(text); x.toast(msg); } catch { x.toast("コピーできませんでした。文を選んでコピーしてください"); } }
  function onClick(k, t) {
    const q = s => t.closest(s); let b;
    const st = CS[k], o = one(k);
    if (U.shSet && !q(".setwrap")) { U.shSet = false; x.render(); if (!q("button,a,input,select,textarea,label")) return true; }
    if (!q("#cDel") && U.delArm) { U.delArm = false; }
    if (b = q("[data-cloc]")) { st.loc = b.dataset.cloc; st.open = null; if (innerWidth <= 860) x.S.navOn = false; x.render(); return true; }
    if (b = q("[data-ctable]")) { st.table = b.dataset.ctable; x.render(); return true; }
    if (b = q("[data-copen]")) { st.open = b.dataset.copen; U.drawer = false; U.shTab = "edit"; U.delArm = false; x.render(); return true; }
    if (q("#cBack")) { st.open = null; U.drawer = false; x.render(); return true; }
    if (q("#cNew")) { create(k).then(n => { if (n) { st.open = n.id; x.render(); } }); return true; }
    if (b = q("#cAddTable")) {
      const name = prompt("表の名前"); if (!name || !name.trim()) return true;
      const id = (k === "pack" ? "pt-" : "st-") + Date.now().toString(36); conf(k).tables.push({ id, name: name.trim(), folder: b.dataset.folder });
      st.table = id; x.saveCfg(); x.render(); return true;
    }
    if (q("#cAddFolder")) {
      const name = prompt("フォルダの名前"); if (!name || !name.trim()) return true;
      const id = (k === "pack" ? "pf-" : "sf-") + Date.now().toString(36); conf(k).folders.push({ id, name: name.trim(), parent: null });
      st.loc = "f:" + id; x.saveCfg(); x.render(); return true;
    }
    if (b = q("[data-swopen]")) { x.openSwipe(b.dataset.swopen); return true; }
    if (q("#cPick")) { U.pick = true; U.mq = ""; U.mf = {}; x.render(); setTimeout(() => document.getElementById("cmq")?.focus(), 0); return true; }
    if (q("#cmClose") || q("#cmClose2") || t.id === "cmScrim") { U.pick = null; x.render(); return true; }
    if (b = q("[data-madd]")) { toggleMember(k, o.id, b.dataset.madd); x.render(); return true; }
    if (b = q("[data-cmv]")) {
      const [id, d] = b.dataset.cmv.split(":"); const ids = k === "pack" ? o.items : o.items.map(i => i.id);
      const i = ids.indexOf(id), j = i + +d; if (j < 0 || j >= ids.length) return true;
      [o.items[i], o.items[j]] = [o.items[j], o.items[i]]; queue(k, o, 0); x.render(); return true;
    }
    if (b = q("[data-crm]")) { toggleMember(k, o.id, b.dataset.crm); x.render(); return true; }
    if (q("#cDel")) {
      if (!U.delArm) { U.delArm = true; x.render(); return true; }
      clearTimeout(timers.get(k + o.id)); timers.delete(k + o.id); x.setSaving(1);
      (k === "pack" ? D.deletePack(o.id) : D.deleteShare(o.id)).then(() => { DATA[k] = DATA[k].filter(p => p.id !== o.id); st.open = null; U.delArm = false; x.render(); x.toast("消しました"); })
        .catch(e => x.toast(e.message)).finally(() => x.setSaving(-1));
      return true;
    }
    if (q("#pkDrawer")) { U.drawer = true; x.render(); return true; }
    if (q("#pkDrawerX") || q("#pkDrawerX2")) { U.drawer = false; x.render(); return true; }
    if (q("#pkCopy") || q("#pkCopy2")) { copy(packText(o, items(), GRADE), "渡す文をコピーしました"); return true; }
    if (b = q("[data-shtab]")) { U.shTab = b.dataset.shtab; x.render(); return true; }
    if (q("#shSet")) { U.shSet = !U.shSet; x.render(); return true; }
    if (q("#shCopy")) { copy(shareUrl(o), "リンクをコピーしました"); return true; }
    if (q("#shLive")) { o.live = !o.live; queue(k, o, 0); x.render(); x.toast(o.live ? "公開を再開しました" : "リンクを止めました。生徒が開くと「止めています」とだけ出ます"); return true; }
    if (q("#shExpX")) { o.expire = ""; queue(k, o, 0); x.render(); return true; }
    if (b = q("[data-cedit]")) { U.cedit = b.dataset.cedit; x.render(); setTimeout(() => document.querySelector(`[data-shc="${b.dataset.cedit}"]`)?.focus(), 0); return true; }
    return false;
  }
  function onInput(k, t) {
    const o = one(k);
    if (t.id === "cmq") { U.mq = t.value; return "keep:cmq"; }
    if (!o) return false;
    if (t.id === "pkName" || t.id === "shName") { o.name = t.value; queue(k, o); return true; }
    if (t.id === "pkGoal") { o.goal = t.value; queue(k, o); return true; }
    if (t.id === "shIntro") { o.intro = t.value; queue(k, o); return true; }
    if (t.dataset.shc) { const i = o.items.find(v => v.id === t.dataset.shc); if (i) { i.c = t.value; queue(k, o); } return true; }
    if (t.id === "shCtaText") { o.ctaText = t.value; queue(k, o); return true; }
    if (t.id === "shCtaBtn") { o.ctaBtn = t.value; queue(k, o); return true; }
    if (t.id === "shCtaUrl") { o.ctaUrl = t.value; queue(k, o); return true; }
    return false;
  }
  function onChange(k, t) {
    const o = one(k);
    if (t.dataset.mf) { U.mf[t.dataset.mf] = t.dataset.mf === "star" ? +t.value : t.value; x.render(); return true; }
    if (!o) return false;
    if (t.id === "pkMake") { o.make = t.value; queue(k, o, 0); return true; }
    if (t.id === "cMove") { o.table = t.value || null; queue(k, o, 0); x.render(); x.toast(`「${where(k, o.table)}」へ移しました`); return true; }
    if (t.id === "shExp") { o.expire = t.value ? `${t.value}T23:59:59+09:00` : ""; queue(k, o, 0); x.render(); return true; }
    const flag = { shHypo: "showHypo", shIdea: "showIdea", shFile: "showFile", shCta: "cta" }[t.id];
    if (flag) { o[flag] = t.checked; queue(k, o, 0); x.render(); return true; }
    return false;
  }
  function onDblClick(k, t) {
    const b = t.closest("[data-ctable]"); if (!b) return false;
    const tb = tableOf(k, b.dataset.ctable); if (!tb) return true;
    const n = DATA[k].filter(o => o.table === tb.id).length;
    const name = prompt(n ? "表の名前を変える" : "表の名前を変える（空にして決定すると、この空の表を消す）", tb.name);
    if (name === null) return true;
    if (!name.trim()) { if (n) { x.toast("中身がある表は消せません"); return true; } conf(k).tables = conf(k).tables.filter(v => v.id !== tb.id); CS[k].table = null; }
    else tb.name = name.trim();
    x.saveCfg(); x.render(); return true;
  }
  function onEscape() {
    if (U.pick) { U.pick = null; return true; }
    if (U.shSet) { U.shSet = false; return true; }
    if (U.drawer) { U.drawer = false; return true; }
    return false;
  }

  return { load, DATA, missing, LABEL, mainHTML, addTo, memberOf, toggleMember, onClick, onInput, onChange, onDblClick, onEscape, pending, open: (k, id) => { CS[k].open = id; } };
}
