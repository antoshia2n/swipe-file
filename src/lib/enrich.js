import { CONTENT_AXES, SOURCE_TYPES, detectSourceType, listTags } from "./swipes.js";

const MODEL = "claude-haiku-4-5-20251001";
const EXCERPT_MAX = 200; // 一覧カード用の短い抜粋（要件 v1.7 §4.1）

/**
 * URL・本文から、登録に必要な残りの項目を自動で埋める。
 *
 * 要件 v1.7 §5 F1：
 *   - Claude 呼び出しは同梱の /api/claude プロキシを使う（新規実装しない）
 *   - OGP は自前の /api/ogp を使う
 *   - タグを提案させる前に既存タグ一覧を渡し、同義語があれば新語を作らず寄せる
 *   - 取得・補完に失敗しても登録は通す
 *
 * 例外は投げない。埋められた分だけ返し、埋まらなかった理由を notes で伝える。
 */
export async function enrichSwipe({ uid, url = "", body = "", reason = "" }) {
  const notes = [];
  const hasUrl  = url.trim().length > 0;
  const hasBody = body.trim().length > 0;

  const values = {
    title:        "",
    topic_tags:   [],
    source_type:  detectSourceType(url, { hasBody }),
    author:       "",
    excerpt:      "",
    content_axis: "",
  };

  // 1. 既存タグ（表記ゆれを増やさないための材料）
  let existingTags = [];
  try {
    existingTags = (await listTags(uid)).slice(0, 60).map(t => t.tag);
  } catch {
    // 取れなくても補完自体は続ける
  }

  // 2. URL がある場合はページのメタ情報を取る
  let ogp = null;
  if (hasUrl) {
    try {
      const res = await fetch("/api/ogp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ url: url.trim() }),
      });
      ogp = await res.json();
    } catch {
      ogp = null;
    }

    if (ogp?.fetched) {
      if (ogp.title)  values.title  = ogp.title;
      if (ogp.author) values.author = ogp.author;
    } else {
      notes.push("ページの情報を取得できませんでした（X などは非公開のため通常です）");
    }
  }

  // 3. Claude で見出し・タグ・軸・抜粋を整える
  try {
    const ai = await askClaude({ url, body, reason, ogp, existingTags });
    if (ai) {
      if (ai.title && !values.title)              values.title        = ai.title;
      if (Array.isArray(ai.topic_tags))           values.topic_tags   = ai.topic_tags.slice(0, 5);
      if (ai.author && !values.author)            values.author       = ai.author;
      if (ai.excerpt)                             values.excerpt      = String(ai.excerpt).slice(0, EXCERPT_MAX);
      if (CONTENT_AXES.includes(ai.content_axis)) values.content_axis = ai.content_axis;
      if (SOURCE_TYPES.includes(ai.source_type))  values.source_type  = ai.source_type;
    }
  } catch (err) {
    notes.push(`AI 補完は使えませんでした（${err.message}）。手で埋めても保存できます`);
  }

  // 4. 補完が効かなかったときの最低限の埋め合わせ
  if (!values.excerpt) {
    if (hasBody)                  values.excerpt = body.trim().slice(0, EXCERPT_MAX);
    else if (ogp?.description)    values.excerpt = String(ogp.description).slice(0, EXCERPT_MAX);
  }
  if (!values.title) {
    values.title = hasUrl ? url.trim() : (values.excerpt || "（無題）").slice(0, 40);
  }

  return { values, notes };
}

async function askClaude({ url, body, reason, ogp, existingTags }) {
  const tagGuide = existingTags.length
    ? `## すでに使われているタグ（この中に意味の近いものがあれば、新しい言い方を作らずこの表記をそのまま使う）
${existingTags.join(" / ")}`
    : "## すでに使われているタグ\n（まだありません。短く一般的な言い方を選んでください）";

  const system = `あなたはスワイプファイル（お手本・見本データの保管庫）の整理係です。
渡された情報から、保管に必要な項目を推定して JSON だけを返してください。

${tagGuide}

## 出力形式（コードブロックや前置きは不要）
{"title":"見出し","topic_tags":["タグ1","タグ2"],"author":"発信者名","excerpt":"内容の要約","content_axis":"思考系","source_type":"X"}

## ルール
- title：内容が一目で分かる短い見出し（40文字以内）
- topic_tags：内容を表すキーワードを1〜3個。**既存タグに意味が近いものがあれば必ずその表記をそのまま使う**。無い場合だけ新しい語を作る
- author：分かる場合のみ。不明なら空文字
- excerpt：一覧に出す短い抜粋。**全角${EXCERPT_MAX}文字以内**。分からなければ空文字。事実を創作しない
- content_axis：${CONTENT_AXES.join(" / ")} から1つ
- source_type：${SOURCE_TYPES.join(" / ")} から1つ（URLが無く本文だけならノート）
- 分からない項目は空文字にする`;

  const content = [
    url          ? `URL：${url}` : null,
    `保存したい理由：${reason || "（未記入）"}`,
    ogp?.title       ? `ページ見出し：${ogp.title}` : null,
    ogp?.site_name   ? `サイト名：${ogp.site_name}` : null,
    ogp?.description ? `ページ説明：${String(ogp.description).slice(0, 1000)}` : null,
    body             ? `本文：\n${body.slice(0, 6000)}` : null,
  ].filter(Boolean).join("\n");

  const res = await fetch("/api/claude", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      model:      MODEL,
      max_tokens: 700,
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
