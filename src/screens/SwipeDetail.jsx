import { useEffect, useRef, useState } from "react";
import { T, card, inp, lb10, solidBtn, ghostBtn } from "shia2n-core";
import { Field, Badge, TagChips, Notice, statusColor } from "../components/ui.jsx";
import {
  getSwipe, updateSwipe, deleteSwipe, incrementRef, markUsed, validateSwipe,
  SOURCE_TYPES, CONTENT_AXES, VISIBILITIES, STATUS_ACTIVE, STATUS_USED, STATUS_DRAFT,
} from "../lib/swipes.js";

export default function SwipeDetail({ id, onBack, onChanged }) {
  const [row, setRow]         = useState(null);
  const [draft, setDraft]     = useState(null);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 同じ画面で二重に加算しないための目印（開くたびに1回だけ）
  const countedFor = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // 画面を開いた＝読んだ、として参照回数を1つ増やす（要件 §F4「1回」の定義）
        if (countedFor.current !== id) {
          countedFor.current = id;
          await incrementRef(id).catch(() => {});
        }
        const data = await getSwipe(id);
        if (!alive) return;
        setRow(data);
        setDraft(data);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  async function handleSave() {
    const problem = validateSwipe(draft, { allowDraft: true });
    if (problem) { setError(problem); return; }

    setSaving(true);
    setError("");
    try {
      await updateSwipe(id, {
        source_url:   draft.source_url || null,
        body:         draft.body || null,
        file_url:     draft.file_url || null,
        visibility:   draft.visibility,
        reason:       draft.reason,
        title:        draft.title,
        topic_tags:   draft.topic_tags,
        source_type:  draft.source_type,
        author:       draft.author || null,
        excerpt:      draft.excerpt || null,
        content_axis: draft.content_axis || null,
        used_in:      draft.used_in || null,
        status:       draft.status,
      });
      const fresh = await getSwipe(id);
      setRow(fresh);
      setDraft(fresh);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleUsed() {
    setSaving(true);
    setError("");
    try {
      if (draft.status === STATUS_USED) {
        await updateSwipe(id, { status: STATUS_ACTIVE });
      } else {
        await markUsed(id, draft.used_in);
      }
      const fresh = await getSwipe(id);
      setRow(fresh);
      setDraft(fresh);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError("");
    try {
      await deleteSwipe(row);
      onChanged?.();
      onBack();
    } catch (err) {
      setError(err.message);
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || draft.topic_tags.includes(tag)) { setTagInput(""); return; }
    setDraft({ ...draft, topic_tags: [...draft.topic_tags, tag] });
    setTagInput("");
  }

  if (loading) {
    return <div style={{ ...card, padding: 22, textAlign: "center", color: T.muted, fontSize: 12 }}>読み込み中…</div>;
  }
  if (!row || !draft) {
    return (
      <div style={{ ...card, padding: 20 }}>
        <Notice kind="error">{error || "見つかりませんでした"}</Notice>
        <button onClick={onBack} style={ghostBtn}>一覧に戻る</button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onBack} style={{ ...ghostBtn, marginBottom: 10 }}>← 一覧に戻る</button>

      {error && <Notice kind="error">{error}</Notice>}
      {draft.status === STATUS_DRAFT && (
        <Notice kind="warn">理由が未記入です。1行書いて保存すると通常の状態に戻ります。</Notice>
      )}

      {/* 出典と本文を上に大きく（要件 §6） */}
      <div style={{ ...card, padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ ...lb10, marginBottom: 5 }}>出典</div>
        {row.source_url ? (
          <a
            href={row.source_url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: T.blue, wordBreak: "break-all", lineHeight: 1.6 }}
          >
            {row.source_url}
          </a>
        ) : (
          <div style={{ fontSize: 12, color: T.faint }}>URL なし（本文またはファイルの素材）</div>
        )}

        {row.file_url && (
          <div style={{ marginTop: 10 }}>
            <div style={{ ...lb10, marginBottom: 5 }}>原本ファイル</div>
            <a
              href={row.file_url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: T.blue, wordBreak: "break-all", lineHeight: 1.6 }}
            >
              原本を開く
            </a>
          </div>
        )}

        <div style={{ ...lb10, margin: "14px 0 5px" }}>本文</div>
        <div style={{ fontSize: 12, lineHeight: 1.9, whiteSpace: "pre-wrap", color: row.body ? T.text : T.faint }}>
          {row.body || "未保存（下の編集欄から貼り付けられます）"}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <Badge text={row.status} color={statusColor(row.status)} />
          <span style={{ fontSize: 10, color: T.faint, fontFamily: "'DM Mono',monospace" }}>
            参照 {row.ref_count} 回
            {row.last_referenced_at && ` ／ 最終 ${new Date(row.last_referenced_at).toLocaleString("ja-JP")}`}
          </span>
        </div>
      </div>

      {/* 編集 */}
      <div style={{ ...card, padding: "14px 16px", marginBottom: 12 }}>
        <Field label="タイトル">
          <input style={inp} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
        </Field>

        <Field label="なぜ良いか・1行">
          <input style={inp} value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} />
        </Field>

        <Field label="タグ">
          <TagChips tags={draft.topic_tags} onRemove={t => setDraft({ ...draft, topic_tags: draft.topic_tags.filter(x => x !== t) })} />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              style={inp}
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addTag(); }
              }}
              placeholder="タグを足す"
            />
            <button onClick={addTag} style={{ ...ghostBtn, whiteSpace: "nowrap" }}>追加</button>
          </div>
        </Field>

        <div style={{ display: "flex", gap: 10 }}>
          <Field label="媒体">
            <select style={inp} value={draft.source_type} onChange={e => setDraft({ ...draft, source_type: e.target.value })}>
              {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="発信の軸">
            <select style={inp} value={draft.content_axis ?? ""} onChange={e => setDraft({ ...draft, content_axis: e.target.value })}>
              <option value="">未設定</option>
              {CONTENT_AXES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="発信者">
          <input style={inp} value={draft.author ?? ""} onChange={e => setDraft({ ...draft, author: e.target.value })} />
        </Field>

        <Field label="出典URL">
          <input style={inp} value={draft.source_url} onChange={e => setDraft({ ...draft, source_url: e.target.value })} />
        </Field>

        <Field label="本文（全文・検索対象）">
          <textarea
            style={{ ...inp, minHeight: 160, resize: "vertical" }}
            value={draft.body ?? ""}
            onChange={e => setDraft({ ...draft, body: e.target.value })}
          />
        </Field>

        <Field label="一覧に出す短い抜粋">
          <textarea
            style={{ ...inp, minHeight: 70, resize: "vertical" }}
            value={draft.excerpt ?? ""}
            onChange={e => setDraft({ ...draft, excerpt: e.target.value })}
            placeholder="全角200字程度"
          />
        </Field>

        <Field label="扱い">
          <select style={inp} value={draft.visibility ?? "private"} onChange={e => setDraft({ ...draft, visibility: e.target.value })}>
            {VISIBILITIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </Field>

        <Field label="活用先（記事のURLやID・カンマ区切り）">
          <input style={inp} value={draft.used_in ?? ""} onChange={e => setDraft({ ...draft, used_in: e.target.value })} />
        </Field>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={handleSave} disabled={saving} style={{ ...solidBtn(), flex: 1, justifyContent: "center", padding: "9px 14px", fontSize: 12 }}>
            {saving ? "保存中…" : "保存する"}
          </button>
          <button onClick={handleToggleUsed} disabled={saving} style={{ ...ghostBtn, whiteSpace: "nowrap" }}>
            {draft.status === STATUS_USED ? "未活用に戻す" : "活用済にする"}
          </button>
        </div>
      </div>

      {/* 削除 */}
      <div style={{ ...card, padding: "14px 16px", borderColor: T.border2 }}>
        <div style={{ ...lb10, marginBottom: 8 }}>削除</div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{ ...ghostBtn, color: T.red, borderColor: T.red }}>
            このスワイプを削除する
          </button>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: T.red, marginBottom: 9, lineHeight: 1.6 }}>
              元に戻せません。本当に削除しますか？
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleDelete} disabled={saving} style={{ ...solidBtn(T.red), justifyContent: "center", padding: "8px 14px", fontSize: 12 }}>
                {saving ? "削除中…" : "削除する"}
              </button>
              <button onClick={() => setConfirmDelete(false)} style={ghostBtn}>やめる</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
