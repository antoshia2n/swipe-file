import { useState } from "react";
import { T, card, inp, solidBtn, ghostBtn } from "shia2n-core";
import { Field, Notice, TagChips } from "../components/ui.jsx";
import { enrichFromUrl } from "../lib/enrich.js";
import { createSwipe, detectSourceType, SOURCE_TYPES, CONTENT_AXES } from "../lib/swipes.js";

const EMPTY = {
  title: "", topic_tags: [], source_type: "その他",
  author: "", excerpt: "", content_axis: "",
};

export default function SwipeForm({ uid, onSaved }) {
  const [url, setUrl]         = useState("");
  const [reason, setReason]   = useState("");
  const [extra, setExtra]     = useState(EMPTY);
  const [tagInput, setTagInput] = useState("");
  const [phase, setPhase]     = useState("input"); // input | loading | review
  const [notes, setNotes]     = useState([]);
  const [error, setError]     = useState("");
  const [saving, setSaving]   = useState(false);

  const canSubmit = url.trim().length > 0 && reason.trim().length > 0;

  async function handleEnrich() {
    setError("");
    if (!canSubmit) {
      setError("URL と理由の両方が必要です（理由のない素材は保存できません）");
      return;
    }
    setPhase("loading");
    const { values, notes: n } = await enrichFromUrl(url.trim(), reason.trim());
    setExtra({ ...EMPTY, ...values });
    setNotes(n);
    setPhase("review");
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      await createSwipe(uid, { source_url: url.trim(), reason: reason.trim(), ...extra });
      setUrl(""); setReason(""); setExtra(EMPTY); setNotes([]); setPhase("input");
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || extra.topic_tags.includes(tag)) { setTagInput(""); return; }
    setExtra({ ...extra, topic_tags: [...extra.topic_tags, tag] });
    setTagInput("");
  }

  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      {error && <Notice kind="error">{error}</Notice>}

      <Field label="URL（必須）">
        <input
          style={inp}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://..."
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
        />
        {url && (
          <div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>
            媒体の判定：{detectSourceType(url)}
          </div>
        )}
      </Field>

      <Field label="なぜ良いか・1行（必須）">
        <input
          style={inp}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="冒頭のフックが強い、など"
        />
      </Field>

      {phase !== "review" && (
        <button
          onClick={handleEnrich}
          disabled={!canSubmit || phase === "loading"}
          style={{ ...solidBtn(canSubmit ? T.text : T.faint), width: "100%", justifyContent: "center", padding: "9px 14px", fontSize: 12 }}
        >
          {phase === "loading" ? "残りを埋めています…" : "AI補完して保存へ"}
        </button>
      )}

      {phase === "review" && (
        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 6, paddingTop: 14 }}>
          {notes.map((n, i) => <Notice key={i} kind="warn">{n}</Notice>)}

          <Field label="タイトル">
            <input style={inp} value={extra.title} onChange={e => setExtra({ ...extra, title: e.target.value })} />
          </Field>

          <Field label="タグ">
            <TagChips tags={extra.topic_tags} onRemove={tag => setExtra({ ...extra, topic_tags: extra.topic_tags.filter(t => t !== tag) })} />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input
                style={inp}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  // 日本語変換の確定 Enter で誤発火させない（技術鉄則 §4.3）
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addTag(); }
                }}
                placeholder="タグを足す"
              />
              <button onClick={addTag} style={{ ...ghostBtn, whiteSpace: "nowrap" }}>追加</button>
            </div>
          </Field>

          <div style={{ display: "flex", gap: 10 }}>
            <Field label="媒体">
              <select style={inp} value={extra.source_type} onChange={e => setExtra({ ...extra, source_type: e.target.value })}>
                {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="発信の軸">
              <select style={inp} value={extra.content_axis} onChange={e => setExtra({ ...extra, content_axis: e.target.value })}>
                <option value="">未設定</option>
                {CONTENT_AXES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label="発信者">
            <input style={inp} value={extra.author} onChange={e => setExtra({ ...extra, author: e.target.value })} />
          </Field>

          <Field label="本文の控え（消えても残るように）">
            <textarea
              style={{ ...inp, minHeight: 90, resize: "vertical" }}
              value={extra.excerpt}
              onChange={e => setExtra({ ...extra, excerpt: e.target.value })}
              placeholder="X の投稿は削除されると消えるため、本文を貼っておくと安全です"
            />
          </Field>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ ...solidBtn(), flex: 1, justifyContent: "center", padding: "9px 14px", fontSize: 12 }}
            >
              {saving ? "保存中…" : "保存する"}
            </button>
            <button onClick={() => setPhase("input")} style={ghostBtn}>戻る</button>
          </div>
        </div>
      )}
    </div>
  );
}
