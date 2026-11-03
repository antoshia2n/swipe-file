/**
 * note の記事の本文（HTML）を、スワイプくんの本文の欄に入れる文字に直す（2026-11-03 開発部）
 * 画面側（src/engine/data.js）と裏側（functions/api/note-body.js）の両方から使う。外の部品には頼らない。
 */

/** note の記事の住所から、記事の番号（n で始まる英数字）を取る。note の記事でなければ "" */
export function noteKey(url = "") {
  let u;
  try { u = new URL(String(url)); } catch { return ""; }
  if (!/(^|\.)note\.com$/i.test(u.hostname)) return "";
  const m = u.pathname.match(/\/n\/(n[0-9a-z]{6,})\/?$/i);
  return m ? m[1] : "";
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENT[e.toLowerCase()] ?? all;
  });
}
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decode(m[2] ?? m[3] ?? "") : "";
};

/**
 * @param {string} html note の本文
 * @returns {{ text: string, images: number }}
 */
export function noteHtmlToText(html = "") {
  let images = 0;
  let s = String(html);
  // 埋め込み（X のポスト・YouTube など）：住所だけ残す
  s = s.replace(/<figure\b[^>]*embedded-service[^>]*>[\s\S]*?<\/figure>/gi, tag => {
    const src = attr(tag, "data-src") || attr(tag.match(/<a\b[^>]*>/i)?.[0] || "", "href");
    return src ? `\n［埋め込み］${src}\n` : "\n";
  });
  // 画像：その位置に「［画像］住所」。figure の中の説明（figcaption）は、続けて残す
  s = s.replace(/<img\b[^>]*>/gi, tag => {
    const src = attr(tag, "src") || attr(tag, "data-src");
    if (!src) return "";
    images++;
    return `\n［画像］${src}\n`;
  });
  // 見出し・区切り・箇条書き
  s = s.replace(/<h[1-3]\b[^>]*>/gi, "\n\n■ ").replace(/<\/h[1-6]>/gi, "\n");
  s = s.replace(/<h[4-6]\b[^>]*>/gi, "\n\n");
  s = s.replace(/<li\b[^>]*>/gi, "\n- ");
  s = s.replace(/<hr\b[^>]*>/gi, "\n―――\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|figure|figcaption|blockquote|pre|ul|ol|table|tr)>/gi, "\n");
  s = s.replace(/<(p|div|blockquote|pre|ul|ol|table|tr)\b[^>]*>/gi, "\n");
  // 残りの印は外す（リンクは文字だけ残る）
  s = s.replace(/<[^>]+>/g, "");
  s = decode(s);
  const text = s
    .split("\n")
    .map(l => l.replace(/[ \t　]+$/g, "").replace(/^[ \t]+/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, images };
}
