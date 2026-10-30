/**
 * 構造的な箇条書きの入力（2026-10-30・サイドパネルの「メモ」）。
 * Enter で次の行も同じ印で続く／中身の無い行で Enter を押すと印が外れる／Tab で一段下げる／Shift+Tab で戻す。
 * 文字は素のテキスト（「- 」と 2 つの空白の字下げ）のまま保存する。AI がそのまま読める形にするため。
 */
const BULLET = /^(\s*)([-・*]|\d+\.)\s(.*)$/;

/** textarea の値と選んでいる範囲から、Enter / Tab / Shift+Tab を押した後の値と位置を返す。何もしないときは null */
export function bulletEdit(value, start, end, key, shift) {
  const ls = value.lastIndexOf("\n", start - 1) + 1;
  if (key === "Enter") {
    if (start !== end) return null;
    const le = value.indexOf("\n", start); const lineEnd = le < 0 ? value.length : le;
    const line = value.slice(ls, lineEnd); const m = line.match(BULLET);
    if (!m) return null;
    if (!m[3].trim() && start === lineEnd) { // 中身の無い印の行 → 印を外して一段戻す
      const out = m[1].length >= 2 ? m[1].slice(2) + m[2] + " " : "";
      const v = value.slice(0, ls) + out + value.slice(lineEnd);
      return { value: v, pos: ls + out.length };
    }
    const mark = /^\d+\.$/.test(m[2]) ? `${parseInt(m[2], 10) + 1}.` : m[2];
    const ins = "\n" + m[1] + mark + " ";
    return { value: value.slice(0, start) + ins + value.slice(end), pos: start + ins.length };
  }
  if (key === "Tab") {
    const le = value.indexOf("\n", end); const blockEnd = le < 0 ? value.length : le;
    const lines = value.slice(ls, blockEnd).split("\n");
    let d0 = 0, dAll = 0;
    const out = lines.map((l, i) => {
      let r;
      if (shift) { const n = l.startsWith("  ") ? 2 : l.startsWith(" ") ? 1 : 0; r = l.slice(n); if (i === 0) d0 = -n; dAll -= n; }
      else { r = "  " + (BULLET.test(l) || !l.trim() ? l : "- " + l); const n = r.length - l.length; if (i === 0) d0 = n; dAll += n; }
      return r;
    }).join("\n");
    const v = value.slice(0, ls) + out + value.slice(blockEnd);
    return { value: v, pos: Math.max(ls, start + d0), posEnd: Math.max(ls, end + dAll) };
  }
  return null;
}

/** 印だけで中身の無い行を落とす（「- 」だけ残ったメモを「書いた」扱いにしない） */
export const cleanBullets = (text = "") =>
  text.split("\n").filter(l => !/^\s*([-・*]|\d+\.)?\s*$/.test(l)).join("\n").trim();
