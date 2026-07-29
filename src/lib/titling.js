/**
 * 見出しと抜粋の決め方（唯一の規則）。
 *
 * ⚠️ このファイルは swipe-mcp リポジトリの src/titling.ts と対になっている。
 *    片方だけ直すと、画面から登録したときと AI から登録したときで見出しが変わる。
 *    規則を変えるときは必ず両方を同時に差し替えること。
 *
 * 決め方（上から順に見て、最初に取れたものを採用する）
 *   1. 人が入力した見出し
 *   2. リンク先のページ題名（OGP）
 *   3. 本文が Markdown なら、その1行目の見出し
 *   4. AI が付けた見出し
 *   5. 本文の書き出し（記号と改行を掃除し、最初の文の区切りまで）
 *   6. ファイル名（拡張子を除く）
 *   7. 「見出し未設定」
 *
 * URL そのものは見出しにしない（何の素材か分からないため）。
 * 2〜6 で決めた見出しは「自動」扱い（title_auto = true）にし、後からまとめて
 * 作り直せるようにする。人が1文字でも直したら自動扱いを外す。
 */

export const TITLE_UNSET  = "見出し未設定";
export const TITLE_MAX    = 40;   // 自動見出しの長さ（全角換算）
export const TITLE_LIMIT  = 120;  // 外から来た見出しの上限
export const EXCERPT_MAX  = 200;  // 一覧に出す抜粋（要件 §4.1）

/**
 * 表示に使えるように掃除する。
 * Markdown の記号・改行・連続空白を落とし、1行のふつうの文にする。
 */
export function cleanText(raw = "") {
  return String(raw ?? "")
    .replace(/```[\s\S]*?```/g, " ")          // コードブロックは丸ごと落とす
    .replace(/^\s{0,3}>+\s?/gm, "")           // 引用記号
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")       // 見出し記号
    .replace(/^\s{0,3}[-*+]\s+/gm, "")        // 箇条書き
    .replace(/^\s{0,3}\d+[.)]\s+/gm, "")      // 番号付き箇条書き
    .replace(/^\s{0,3}[-*_]{3,}\s*$/gm, " ")  // 区切り線
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")    // 画像
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")  // リンクは表示文字だけ残す
    .replace(/[*_`~]+/g, "")                  // 強調記号
    .replace(/\s+/g, " ")                     // 改行・連続空白をまとめる
    .trim();
}

/** 文章から見出しを作る。最初の文の区切りまで、長ければ切る。 */
export function titleFromText(raw = "", max = TITLE_MAX) {
  const clean = cleanText(raw);
  if (!clean) return "";

  const sentence = clean.match(/^[\s\S]*?[。！？!?]/);
  let head = (sentence ? sentence[0] : clean).replace(/[。！？!?]\s*$/, "").trim();
  if (head.length > max) head = `${head.slice(0, max)}…`;
  return head;
}

/** 本文が Markdown で、1行目が見出し行（# …）ならその行を返す */
export function headingFromMarkdown(body = "") {
  const first = String(body ?? "").split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? "";
  if (!/^#{1,6}\s+/.test(first)) return "";
  return cleanText(first).slice(0, TITLE_LIMIT);
}

/** ファイル名から拡張子を落とす */
export function fileBaseName(name = "") {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  return base.replace(/\.[A-Za-z0-9]{1,8}$/, "").trim();
}

/** 見出しが未設定（または空）かどうか */
export function isUnsetTitle(title) {
  const clean = cleanText(title);
  return !clean || clean === TITLE_UNSET;
}

/**
 * 見出しを決める。
 * @returns {{ title: string, auto: boolean }} auto=true は自動で付けた見出し
 */
export function deriveTitle({
  manualTitle = "",
  pageTitle   = "",
  aiTitle     = "",
  body        = "",
  fileName    = "",
} = {}) {
  const manual = cleanText(manualTitle);
  if (manual && manual !== TITLE_UNSET) {
    return { title: manual.slice(0, TITLE_LIMIT), auto: false };
  }

  const page = cleanText(pageTitle);
  if (page) return { title: page.slice(0, TITLE_LIMIT), auto: true };

  // 文書そのものの見出し行は、AI の言い換えより正確なので先に見る
  const heading = headingFromMarkdown(body);
  if (heading) return { title: heading, auto: true };

  const ai = cleanText(aiTitle);
  if (ai) return { title: ai.slice(0, TITLE_LIMIT), auto: true };

  const fromBody = titleFromText(body);
  if (fromBody) return { title: fromBody, auto: true };

  const fromFile = fileBaseName(fileName);
  if (fromFile) return { title: fromFile.slice(0, TITLE_LIMIT), auto: true };

  return { title: TITLE_UNSET, auto: true };
}

/** 一覧に出す短い抜粋を決める。中身は見出しと同じ掃除を通す。 */
export function deriveExcerpt({
  manualExcerpt   = "",
  aiExcerpt       = "",
  pageDescription = "",
  body            = "",
} = {}) {
  const picked = [manualExcerpt, aiExcerpt, pageDescription, body]
    .map(cleanText)
    .find(text => text.length > 0) ?? "";

  return picked.length > EXCERPT_MAX ? `${picked.slice(0, EXCERPT_MAX)}…` : picked;
}
