import { useCallback, useEffect, useState } from "react";
import { T, card, inp, ghostBtn, lb10 } from "shia2n-core";
import { Badge, Notice, statusColor } from "../components/ui.jsx";
import {
  listSwipes, listTags, SOURCE_TYPES, CONTENT_AXES, STATUSES,
  SORT_CREATED, SORT_REF,
} from "../lib/swipes.js";

export default function SwipeList({ uid, onOpen, reloadKey }) {
  const [keyword, setKeyword]         = useState("");
  const [tag, setTag]                 = useState("");
  const [sourceType, setSourceType]   = useState("");
  const [contentAxis, setContentAxis] = useState("");
  const [status, setStatus]           = useState("");
  const [hideUsed, setHideUsed]       = useState(false);
  const [sort, setSort]               = useState(SORT_CREATED);

  const [rows, setRows]       = useState([]);
  const [tags, setTags]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, tagList] = await Promise.all([
        listSwipes(uid, { keyword, tags: tag ? [tag] : [], sourceType, contentAxis, status, hideUsed, sort }),
        listTags(uid),
      ]);
      setRows(list);
      setTags(tagList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [uid, keyword, tag, sourceType, contentAxis, status, hideUsed, sort]);

  useEffect(() => { if (uid) load(); }, [uid, load, reloadKey]);

  return (
    <div>
      <div style={{ ...card, padding: "12px 14px", marginBottom: 12 }}>
        <input
          style={inp}
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="タイトル・理由・本文・発信者から探す"
        />

        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <select style={{ ...inp, width: "auto", flex: "1 1 30%" }} value={tag} onChange={e => setTag(e.target.value)}>
            <option value="">タグ：すべて</option>
            {tags.map(t => <option key={t.tag} value={t.tag}>{t.tag}（{t.count}）</option>)}
          </select>
          <select style={{ ...inp, width: "auto", flex: "1 1 30%" }} value={sourceType} onChange={e => setSourceType(e.target.value)}>
            <option value="">媒体：すべて</option>
            {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={{ ...inp, width: "auto", flex: "1 1 30%" }} value={contentAxis} onChange={e => setContentAxis(e.target.value)}>
            <option value="">軸：すべて</option>
            {CONTENT_AXES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={{ ...inp, width: "auto", flex: "1 1 45%" }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">状態：すべて</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={{ ...inp, width: "auto", flex: "1 1 45%" }} value={sort} onChange={e => setSort(e.target.value)}>
            <option value={SORT_CREATED}>並び：登録日順</option>
            <option value={SORT_REF}>並び：参照が多い順</option>
          </select>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9, fontSize: 11, color: T.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={hideUsed} onChange={e => setHideUsed(e.target.checked)} />
          活用済を隠す
        </label>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <div style={{ ...lb10, marginBottom: 8 }}>
        {loading ? "読み込み中…" : `${rows.length} 件`}
      </div>

      {!loading && rows.length === 0 && (
        <div style={{ ...card, padding: 22, textAlign: "center", color: T.muted, fontSize: 12 }}>
          まだ登録がありません。「登録」タブから URL と一言を入れてください。
        </div>
      )}

      {rows.map(row => <SwipeCard key={row.id} row={row} onOpen={onOpen} />)}
    </div>
  );
}

/* カードは親の外側に定義する（技術鉄則 §4.2） */
function SwipeCard({ row, onOpen }) {
  const isDraft = row.status === "reason未記入";
  return (
    <div
      onClick={() => onOpen(row.id)}
      style={{
        ...card,
        padding: "12px 14px",
        marginBottom: 8,
        cursor: "pointer",
        borderColor: isDraft ? T.red : T.border,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.5, wordBreak: "break-word" }}>
          {row.title || "（無題）"}
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <Badge text={row.status} color={statusColor(row.status)} />
        </div>
      </div>

      <div style={{ fontSize: 11, color: isDraft ? T.red : T.muted, marginTop: 5, lineHeight: 1.6 }}>
        {isDraft ? "理由が未記入です。開いて1行足してください" : row.reason}
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        <Badge text={row.source_type} />
        {row.content_axis && <Badge text={row.content_axis} />}
        {(row.topic_tags ?? []).map(t => (
          <span key={t} style={{ fontSize: 10, color: T.muted, background: T.s2, borderRadius: 10, padding: "1px 7px" }}>{t}</span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: T.faint, fontFamily: "'DM Mono',monospace" }}>
          参照 {row.ref_count}
        </span>
      </div>
    </div>
  );
}
