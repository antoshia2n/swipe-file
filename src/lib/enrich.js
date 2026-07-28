import { CONTENT_AXES, SOURCE_TYPES, detectSourceType } from "./swipes.js";

const MODEL = "claude-haiku-4-5-20251001";

/**
 * URL と理由から、登録に必要な残りの項目を自動で埋める。
 *
 * 要件 v1.5 §F1：
 *   - Claude 呼び出しは同梱の /api/claude プロキシを使う（新規実装しない）
 *   - OGP は自前の /api/ogp を使う
 *   - 取得できなくても登録は通す
 *
 * 補完に失敗しても例外は投げない。埋められた分だけ返し、
 * 何が埋まらなかったかを notes で伝える。
 */
export async function enrichFromUrl(url, reason) {
  const notes = [];
  const values = {
    title:        "",
    topic_tags:   [],
    source_type:  detectSourceType(url),
    author:       "",
    excerpt:      "",
    content_axis: "",
  };

  // 1. ページのメタ情報
  let ogp = null;
  try {
    const res = await fetch("/api/ogp", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url }),
    });
    ogp = await res.json();
  } catch {
    ogp = null;
  }

  if (ogp?.fetched) {
    if (ogp.title)       values.title   = ogp.title;
    if (ogp.author)      values.author  = ogp.author;
    if (ogp.description) values.excerpt = ogp.description;
  } else {
    notes.push("ページの情報を取得できませんでした（X などは非公開のため通常です）");
  }

  // 2. Claude で見出し・タグ・軸を整える
  try {
    const ai = await askClaude(url, reason, ogp);
    if (ai) {
      if (ai.title && !values.title)         values.title        = ai.title;
      if (Array.isArray(ai.topic_tags))      values.topic_tags   = ai.topic_tags.slice(0, 5);
      if (ai.author && !values.author)       values.author       = ai.author;
      if (ai.excerpt && !values.excerpt)     values.excerpt      = ai.excerpt;
      if (CONTENT_AXES.includes(ai.content_axis)) values.content_axis = ai.content_axis;
      if (SOURCE_TYPES.includes(ai.source_type))  values.source_type  = ai.source_type;
    }
  } catch (err) {
    notes.push(`AI 補完は使えませんでした（${err.message}）。手で埋めても保存できます`);
  }

  if (!values.title) values.title = url;

  return { values, notes };
}

async function askClaude(url, reason, ogp) {
  const system = `あなたはスワイプファイル（参考になる他者コンテンツの保管庫）の整理係です。
渡された情報から、保管に必要な項目を推定して JSON だけを返してください。

## 出力形式（コードブロックや前置きは不要）
{"title":"見出し","topic_tags":["タグ1","タグ2","タグ3"],"author":"発信者名","excerpt":"内容の要約120文字以内","content_axis":"思考系","source_type":"X"}

## ルール
- title：内容が一目で分かる短い見出し（40文字以内）
- topic_tags：内容を表すキーワードを1〜3個。既存の表記に揃えやすい短い名詞にする
- author：分かる場合のみ。不明なら空文字
- excerpt：本文が分かる場合のみ要約。分からなければ空文字。推測で内容を作らない
- content_axis：思考系 / 習慣系 / 攻略系 / その他 から1つ
- source_type：X / note / YouTube / ブログ / その他 から1つ
- 分からない項目は空文字にする。事実を創作しない`;

  const content = [
    `URL：${url}`,
    `保存したい理由：${reason || "（未記入）"}`,
    ogp?.title       ? `ページ見出し：${ogp.title}` : null,
    ogp?.site_name   ? `サイト名：${ogp.site_name}` : null,
    ogp?.description ? `ページ説明：${String(ogp.description).slice(0, 1000)}` : null,
  ].filter(Boolean).join("\n");

  const res = await fetch("/api/claude", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      model:      MODEL,
      max_tokens: 512,
      system,
      messages:   [{ role: "user", content }],
    }),
  });

  const data = await res.json();
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `${res.status}`;
    throw new Error(msg.includes("credit") ? "利用残高が不足しています" : msg.slice(0, 80));
  }

  const raw = (data.content ?? []).filter(c => c.type === "text").map(c => c.text).join("");
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("応答を読み取れませんでした");
  }
}
