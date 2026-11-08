/**
 * 名前を入れる・どちらかを選ぶ、の小さな窓（2026-11-08・全アプリの点検 claude/app-review-2026-11-08.md の直す順 3）
 * ブラウザの入力窓（prompt）と確かめの窓（confirm）をやめて、アプリの見た目のままその場で聞く。
 *
 *   ask({ title, value, placeholder, check: { label, checked }, ok, danger: { label } })
 *     → Promise<null | { value, checked, danger }>   キャンセル・Esc・外側を押すと null
 *   value を渡さないと入力欄なしの「選ぶだけ」の窓になる（message で説明を出す）
 * Enter で決定、Esc でキャンセル、閉じたら押したボタンへフォーカスを戻す。
 */
const CSS = `.sw-ask-bg{position:fixed;inset:0;z-index:2147482500;background:rgba(15,23,42,.32);display:flex;align-items:flex-start;justify-content:center;padding:14vh 12px 12px}
.sw-ask{width:min(420px,100%);background:#fff;color:#1d2433;border-radius:14px;box-shadow:0 18px 48px rgba(15,23,42,.28);padding:18px;font:14px/1.6 "Geist","Noto Sans JP",system-ui,sans-serif}
.sw-ask h2{margin:0 0 10px;font-size:15px;font-weight:700}
.sw-ask p{margin:0 0 12px;color:#475569}
.sw-ask input[type=text]{box-sizing:border-box;width:100%;font:inherit;min-height:40px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px}
.sw-ask input[type=text]:focus{outline:2px solid #93c5fd;outline-offset:1px;border-color:#3b82f6}
.sw-ask label.ck{display:flex;gap:8px;align-items:center;margin-top:10px;color:#334155}
.sw-ask .row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
.sw-ask button{font:inherit;font-weight:600;min-height:36px;padding:6px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#1d2433;cursor:pointer}
.sw-ask button.ok{background:#1d2433;border-color:#1d2433;color:#fff}
.sw-ask button.dg{margin-right:auto;color:#b91c1c;border-color:#fecaca}
.sw-ask button:focus-visible{outline:2px solid #93c5fd;outline-offset:2px}`;
function ensureCss() {
  if (document.querySelector("style[data-sw-ask]")) return;
  const s = document.createElement("style"); s.dataset.swAsk = "1"; s.textContent = CSS; document.head.appendChild(s);
}
export function ask({ title, message, value, placeholder = "", check, ok = "決定", danger } = {}) {
  ensureCss();
  const back = document.activeElement;
  return new Promise(resolve => {
    const bg = document.createElement("div"); bg.className = "sw-ask-bg";
    const box = document.createElement("div"); box.className = "sw-ask"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    const h = document.createElement("h2"); h.id = "swAskT" + Date.now(); h.textContent = title; box.setAttribute("aria-labelledby", h.id); box.append(h);
    if (message) { const p = document.createElement("p"); p.textContent = message; box.append(p); }
    let inp = null, cb = null;
    if (value !== undefined) { inp = document.createElement("input"); inp.type = "text"; inp.value = value || ""; inp.placeholder = placeholder; inp.maxLength = 80; inp.setAttribute("aria-label", title); box.append(inp); }
    if (check) { const l = document.createElement("label"); l.className = "ck"; cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!check.checked; l.append(cb, document.createTextNode(check.label)); box.append(l); }
    const row = document.createElement("div"); row.className = "row";
    const mk = (txt, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = txt; if (cls) b.className = cls; b.addEventListener("click", fn); row.append(b); return b; };
    const done = r => { bg.remove(); try { back?.focus?.(); } catch { /* 戻せなくてもよい */ } resolve(r); };
    if (danger) mk(danger.label, "dg", () => done({ value: inp ? inp.value : "", checked: !!cb?.checked, danger: true }));
    mk("キャンセル", "", () => done(null));
    const okB = mk(ok, "ok", () => done({ value: inp ? inp.value : "", checked: !!cb?.checked, danger: false }));
    box.append(row); bg.append(box); document.body.append(bg);
    bg.addEventListener("mousedown", e => { if (e.target === bg) done(null); });
    box.addEventListener("keydown", e => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); done(null); }
      else if (e.key === "Enter" && e.target.tagName !== "BUTTON") { e.preventDefault(); okB.click(); }
      else if (e.key === "Tab") { const f = [...box.querySelectorAll("input,button")]; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    });
    (inp || okB).focus(); inp?.select();
  });
}
