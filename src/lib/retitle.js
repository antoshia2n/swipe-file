import { supabase } from "shia2n-core";
import { deriveTitle, deriveExcerpt } from "./titling.js";
import { toJapanese } from "./errors.js";

/**
 * 自動で付いた見出し・抜粋を、今の規則で付け直す（要件 §F1 の埋め合わせ）。
 *
 * 人が直した見出し（title_auto = false）には触らない。
 * AI の残高が戻ったあとや、規則を変えたあとに、一覧から1回押すだけで揃う。
 */

const TABLE = "sw_swipes";

/** リンク先のページ題名と説明を取る（同梱の /api/ogp を使う。AI は使わない） */
async function fetchPageMeta(url) {
  try {
    const res = await fetch("/api/ogp", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!data?.fetched) return { title: "", description: "" };
    return { title: data.title ?? "", description: data.description ?? "" };
  } catch {
    return { title: "", description: "" };
  }
}

/**
 * @returns {Promise<{ target: number, changed: number, failed: number }>}
 */
export async function retitleAuto(uid) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, title, excerpt, body, source_url, title_auto")
    .eq("user_id", uid)
    .eq("title_auto", true);

  if (error) throw new Error(toJapanese(error, "作り直す対象を読み込めませんでした"));

  const rows = data ?? [];
  let changed = 0;
  let failed  = 0;

  for (const row of rows) {
    const meta = row.source_url ? await fetchPageMeta(row.source_url) : { title: "", description: "" };

    const { title } = deriveTitle({
      pageTitle: meta.title,
      body:      row.body ?? "",
    });
    const excerpt = deriveExcerpt({
      pageDescription: meta.description,
      body:            row.body ?? "",
    });

    const sameTitle   = title === (row.title ?? "");
    const sameExcerpt = excerpt === (row.excerpt ?? "");
    if (sameTitle && sameExcerpt) continue;

    const { error: upError } = await supabase
      .from(TABLE)
      .update({ title, excerpt: excerpt || null })
      .eq("id", row.id);

    if (upError) failed += 1;
    else         changed += 1;
  }

  return { target: rows.length, changed, failed };
}
