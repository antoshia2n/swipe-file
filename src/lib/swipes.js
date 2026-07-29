import { supabase } from "shia2n-core";
import { removeFile } from "./files.js";
import { deriveTitle } from "./titling.js";
import { toJapanese } from "./errors.js";

/* ── 選択肢（要件 v1.5 §4.1 の値をそのまま） ───────────────────────────── */

export const SOURCE_TYPES  = ["X", "note", "YouTube", "ブログ", "ノート", "PDF", "その他"];
export const CONTENT_AXES  = ["思考系", "習慣系", "攻略系", "その他"];
export const STATUS_ACTIVE = "未活用";
export const STATUS_USED   = "活用済";
export const STATUS_DRAFT  = "reason未記入";
export const STATUSES      = [STATUS_ACTIVE, STATUS_USED, STATUS_DRAFT];

export const VIS_PRIVATE = "private";
export const VIS_SAMPLE  = "sample";
export const VISIBILITIES = [
  { value: VIS_PRIVATE, label: "自分用" },
  { value: VIS_SAMPLE,  label: "見本（将来 生徒に公開）" },
];

export const SORT_CREATED = "created";
export const SORT_REF     = "ref";

const TABLE   = "sw_swipes";
const ORPHANS = "sw_zeus_orphans";

/* ── URL から媒体を自動判定（要件 §4.1 source_type） ────────────────────── */

export function detectSourceType(url = "", { hasBody = false, isPdf = false } = {}) {
  const u = (url ?? "").toLowerCase();
  if (/(^|\/\/)(www\.)?(x\.com|twitter\.com)\//.test(u)) return "X";
  if (/(^|\/\/)(www\.)?note\.com\//.test(u))             return "note";
  if (/youtube\.com|youtu\.be/.test(u))                  return "YouTube";
  if (/^https?:\/\//.test(u))                            return "ブログ";
  // URL が無い場合は投入経路で決める（§4.1 source_type）
  if (isPdf)   return "PDF";
  if (hasBody) return "ノート";
  return "その他";
}

/**
 * 保存の最低条件（要件 v1.7 §5 F1）。
 * DB 側にも同じ制約を張ってあるが、画面で先に止めて分かりやすく伝える。
 * @returns {string} 問題があれば理由、無ければ空文字
 */
export function validateSwipe({ reason, title, source_url, body, file_url }, { allowDraft = false } = {}) {
  const hasReason    = (reason ?? "").trim().length > 0;
  const hasTitle     = (title ?? "").trim().length > 0;
  const hasSubstance =
    (source_url ?? "").trim().length > 0 ||
    (body ?? "").trim().length > 0 ||
    (file_url ?? "").trim().length > 0;

  if (!hasSubstance) return "URL・本文・ファイルのうち、少なくとも1つが必要です";
  // allowDraft は一括取り込みの仮登録だけの例外（一覧で赤く出る）
  if (!hasTitle  && !allowDraft) return "見出しが必要です";
  if (!hasReason && !allowDraft) return "「なぜ良いか・要約」の1行が必要です";
  return "";
}

/* ── 一覧・検索（要件 §F3） ─────────────────────────────────────────────── */

// PostgREST の or 条件を壊す文字を落とす（検索語はそのまま渡さない）
function safeKeyword(kw) {
  return kw.replace(/[,()%*\\"']/g, " ").trim();
}

export async function listSwipes(uid, opts = {}) {
  const {
    keyword = "",
    tags = [],
    sourceType = "",
    contentAxis = "",
    status = "",
    hideUsed = false,
    sort = SORT_CREATED,
    limit = 200,
  } = opts;

  let q = supabase.from(TABLE).select("*").eq("user_id", uid);

  const kw = safeKeyword(keyword);
  if (kw) {
    q = q.or(
      [
        `title.ilike.%${kw}%`,
        `reason.ilike.%${kw}%`,
        `body.ilike.%${kw}%`,
        `excerpt.ilike.%${kw}%`,
        `author.ilike.%${kw}%`,
      ].join(",")
    );
  }
  if (tags.length)  q = q.contains("topic_tags", tags);
  if (sourceType)   q = q.eq("source_type", sourceType);
  if (contentAxis)  q = q.eq("content_axis", contentAxis);
  if (status)       q = q.eq("status", status);
  if (hideUsed)     q = q.neq("status", STATUS_USED);

  // 既定は登録日降順。参照順を指定したときだけ重みづけを効かせる（§F3）
  if (sort === SORT_REF) {
    q = q.order("ref_count", { ascending: false }).order("created_at", { ascending: false });
  } else {
    q = q.order("created_at", { ascending: false });
  }

  const { data, error } = await q.limit(limit);
  if (error) throw new Error(toJapanese(error, "一覧を読み込めませんでした"));
  return data ?? [];
}

export async function getSwipe(id) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
  if (error) throw new Error(toJapanese(error, "この素材を読み込めませんでした"));
  return data;
}

/* ── 登録（要件 §F1） ───────────────────────────────────────────────────── */

export async function createSwipe(uid, fields) {
  const reason = (fields.reason ?? "").trim();
  const body   = (fields.body ?? "").trim();
  const url    = (fields.source_url ?? "").trim();
  const file   = (fields.file_url ?? "").trim();

  // 画面・MCP の入口で先に検査済み。ここは一括取り込みの仮登録も通すため allowDraft
  const problem = validateSwipe({ reason, title: fields.title, source_url: url, body, file_url: file }, { allowDraft: true });
  if (problem) throw new Error(problem);

  // 見出しは1か所の規則で決める（src/lib/titling.js）。
  // 呼び出し側が見出しを持っていればそれを使い、無ければここで作る。
  const provided = (fields.title ?? "").trim();
  const derived  = deriveTitle({ body, fileName: fields.file_name ?? "" });
  const title      = provided || derived.title;
  const title_auto = provided ? fields.title_auto === true : derived.auto;

  const row = {
    user_id:      uid,
    source_url:   url || null,
    body:         body || null,
    file_url:     file || null,
    reason,
    topic_tags:   fields.topic_tags ?? [],
    title,
    title_auto,
    source_type:  fields.source_type || detectSourceType(url, { hasBody: !!body }),
    author:       fields.author || null,
    excerpt:      fields.excerpt || null,
    content_axis: fields.content_axis || null,
    visibility:   fields.visibility || VIS_PRIVATE,
    // 理由が空のまま登録できるのは一括取り込みの仮登録だけ（§F2）
    status:       reason ? STATUS_ACTIVE : STATUS_DRAFT,
    zeus_synced:  false,
  };
  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) throw new Error(toJapanese(error, "保存できませんでした"));
  return data;
}

/* ── 更新（要件 §F4 swipe__update：参照回数は書き換え不可） ──────────────── */

const PROTECTED = ["id", "user_id", "ref_count", "last_referenced_at", "created_at", "updated_at"];

export async function updateSwipe(id, changes) {
  const safe = { ...changes };
  for (const key of PROTECTED) delete safe[key];

  if (Object.prototype.hasOwnProperty.call(safe, "reason")) {
    safe.reason = (safe.reason ?? "").trim();
    // 理由を消したら仮登録へ、書いたら仮登録から抜ける（DB の制約と必ず一致させる）
    if (!safe.reason) {
      safe.status = STATUS_DRAFT;
    } else if (safe.status === STATUS_DRAFT) {
      safe.status = STATUS_ACTIVE;
    }
  }

  const { error } = await supabase.from(TABLE).update(safe).eq("id", id);
  if (error) throw new Error(toJapanese(error, "更新できませんでした"));
}

export async function markUsed(id, usedIn) {
  return updateSwipe(id, { status: STATUS_USED, used_in: usedIn || null });
}

/* ── 削除（要件 §F6：退避成功を確認してから物理削除） ────────────────────── */

export async function deleteSwipe(swipe) {
  if (swipe.zeus_item_id) {
    // URL を持たない素材（本文・ファイルだけのもの）も退避できるようにしてある。
    // 何の素材だったかを後から追えるよう、見出しも一緒に残す。
    const { error: saveError } = await supabase.from(ORPHANS).insert({
      user_id:      swipe.user_id,
      zeus_item_id: swipe.zeus_item_id,
      source_url:   swipe.source_url ?? null,
      title:        swipe.title ?? null,
    });
    // 退避に失敗したら削除を中止する。索引IDを取りこぼすと Zeus 側に
    // 消せない索引が永久に残るため（§F6）
    if (saveError) {
      throw new Error(`索引IDの退避に失敗したため、削除を中止しました。${toJapanese(saveError, "原因は不明です")}`);
    }
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", swipe.id);
  if (error) throw new Error(toJapanese(error, "削除できませんでした"));

  // 原本ファイルも消す（§F6）。ここで失敗しても本体は削除済みなので中断しない
  if (swipe.file_url) await removeFile(swipe.file_url).catch(() => {});
}

/* ── 参照回数の加算（要件 §F4「1回」の定義） ────────────────────────────── */

export async function incrementRef(id) {
  const { data, error } = await supabase.rpc("sw_increment_ref", { p_id: id });
  if (error) throw new Error(toJapanese(error, "参照回数を更新できませんでした"));
  return Array.isArray(data) ? data[0] : data;
}

/* ── 使用中タグ一覧（表記ゆれ確認用・§F4 swipe__list_tags と同じ集計） ──── */

export async function listTags(uid) {
  const { data, error } = await supabase.from(TABLE).select("topic_tags").eq("user_id", uid);
  if (error) throw new Error(toJapanese(error, "タグを読み込めませんでした"));
  const counts = new Map();
  for (const row of data ?? []) {
    for (const tag of row.topic_tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ja"));
}
