/**
 * ガイドの「？」（2026-11-08・コンテンツくんと同じ形。共通の外枠 shia2n-core 1.17.0 の shell/guide.js）
 * 右上の「ガイド」が「あり」のとき、押す場所の横に小さな「？」を出す。押すと（マウスなら乗せると）題と説明の小窓。
 * 文の正本はここ 1 か所（右上の「？」のマニュアルと言い方をそろえる）。
 */
import { guideOn, onGuide, ensureGuideCss } from "shia2n-core/shell/guide.js";

ensureGuideCss();
export { guideOn, onGuide };

export const GUIDE = {
  add: ["スワイプを足す", "リンク・本文・画像か PDF のどれか 1 つがあれば保存できます。画像や PDF は窓に落とすか貼り付けます"],
  folder: ["フォルダと表", "フォルダの中に表を作り、スワイプは表ごとに入ります。「＋」でフォルダを足せます"],
  view: ["ビュー", "表・ギャラリー・分析の段・ラベルごと などの見せ方を切り替えます。「＋ ビュー」で、いまの絞り込みを残せます"],
  filter: ["絞り込み", "種類・ラベル・評価・ジャンル・分析で絞ります。付けた条件は横の札の × で外せます"],
  row: ["開いて分析する", "行やカードを押すと右にくわしくの窓が開きます。j と k で前後へ移れます"],
  analysis: ["3 段で分析する", "言語化（なぜ良いか）→ 仮説（ほかでも効きそうな型）→ 用途抽出（どこで・どう使うか）。書いた段の数で印が進みます"],
  pack: ["素材パック", "見本を集め、GPT や Claude に渡す文をまとめてコピーできます"],
  share: ["共有ページ", "選んだスワイプを並べたページを作り、リンクで見せます。止める・期限・開かれた数を持てます"],
};

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** 「？」の HTML。ガイドが「なし」なら空 */
export function qh(key, style = "") {
  const g = GUIDE[key];
  if (!g || !guideOn()) return "";
  return `<button type="button" class="s2-qh" data-t="${esc(g[0])}" data-d="${esc(g[1])}" aria-label="${esc(g[0])}とは" aria-expanded="false"${style ? ` style="${style}"` : ""}>?</button>`;
}
