/**
 * データベース・ストレージが返す英語のエラーを、日本語の説明に置き換える。
 *
 * 背景（2026-07-29）：削除が止まったとき、画面に
 * 「null value in column "source_url" ... violates not-null constraint」
 * がそのまま出て、何が起きたのか読めなかった。
 * 画面に英語を出さないこと自体を仕組みにする。
 */

/** データベースの列名 → 画面での呼び名 */
const COLUMN_LABELS = {
  reason:       "「なぜ良いか」",
  source_url:   "URL",
  body:         "本文",
  file_url:     "ファイル",
  title:        "見出し",
  topic_tags:   "タグ",
  zeus_item_id: "索引ID",
  user_id:      "利用者",
};

/** すでに日本語が含まれているか（自前のメッセージはそのまま通す） */
function looksJapanese(text) {
  return /[ぁ-んァ-ヶ一-龥]/.test(text);
}

/**
 * @param {unknown} err      Error オブジェクト・Supabase のエラー・文字列のいずれか
 * @param {string}  fallback 種類が分からなかったときの一言
 * @returns {string} 画面にそのまま出せる日本語
 */
export function toJapanese(err, fallback = "処理できませんでした") {
  const raw = (typeof err === "string" ? err : err?.message ?? "").trim();
  if (!raw) return fallback;
  if (looksJapanese(raw)) return raw;

  const notNull = raw.match(/null value in column "([^"]+)"/i);
  if (notNull) {
    const label = COLUMN_LABELS[notNull[1]] ?? notNull[1];
    return `${label}が空のままなので保存できませんでした`;
  }

  if (/violates check constraint/i.test(raw)) {
    return "保存の条件を満たしていません（「なぜ良いか」は必須です。URL・本文・ファイルのどれか1つも必要です）";
  }
  if (/duplicate key value|already exists/i.test(raw)) {
    return "同じものがすでに登録されています";
  }
  if (/violates foreign key/i.test(raw)) {
    return "関連づけ先が見つかりませんでした";
  }
  if (/permission denied|row-level security|not authorized|jwt|401|403/i.test(raw)) {
    return "アクセスが許可されていません。一度ログインし直してみてください";
  }
  if (/failed to fetch|networkerror|network error|timeout|aborted/i.test(raw)) {
    return "通信できませんでした。電波の良いところでもう一度お試しください";
  }
  if (/payload too large|exceeded the maximum|too large/i.test(raw)) {
    return "サイズが大きすぎます";
  }
  if (/not found|does not exist/i.test(raw)) {
    return "対象が見つかりませんでした（すでに削除された可能性があります）";
  }

  // 分類できなかったときも、英語をそのままは出さない。原文は末尾に小さく添える
  return `${fallback}（詳細：${raw.slice(0, 80)}）`;
}
