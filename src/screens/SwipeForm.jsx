import { useState } from "react";
import { T, card, inp, solidBtn, ghostBtn } from "shia2n-core";
import { Field, Notice, TagChips } from "../components/ui.jsx";
import { enrichSwipe } from "../lib/enrich.js";
import { syncOneToZeus } from "../lib/zeus.js";
import { uploadFile, parseFile, classifyFile, ACCEPT, MAX_BYTES } from "../lib/files.js";
import {
  createSwipe, detectSourceType, validateSwipe,
  SOURCE_TYPES, CONTENT_AXES, VISIBILITIES, VIS_PRIVATE,
} from "../lib/swipes.js";

const EMPTY_EXTRA = {
  title: "", topic_tags: [], source_type: "その他",
  author: "", excerpt: "", content_axis: "", visibility: VIS_PRIVATE,
};

export default function SwipeForm({ uid, onSaved }) {
  const [url, setUrl]           = useState("");
  const [body, setBody]         = useState("");
  const [reason, setReason]     = useState("");
  const [extra, setExtra]       = useState(EMPTY_EXTRA);
  const [tagInput, setTagInput] = useState("");
  const [file, setFile]         = useState(null);
  const [fileUrl, setFileUrl]   = useState("");
  const [phase, setPhase]       = useState("input"); // input | loading | review
  const [notes, setNotes]       = useState([]);
  const [error, setError]       = useState("");
  const [saving, setSaving]     = useState(false);

  const problem = validateSwipe({ reason, source_url: url, body, file_url: file ? "pending" : fileUrl });

  async function handleEnrich() {
    setError("");
    if (problem) { setError(problem); return; }

    setPhase("loading");
    const collected = [];
    let uploadedUrl = fileUrl;
    let bodyText    = body.trim();
    let fileType    = "";

    // 1. 原本を保存して、可能なら本文を取り出す（§F7）
    if (file) {
      const info = classifyFile(file);
      fileType   = info.sourceType;

      const up = await uploadFile(uid, file);
      if (!up.ok) {
        setError(up.reason);
        setPhase("input");
        return;
      }
      uploadedUrl = up.file_url;
      setFileUrl(up.file_url);

      if (info.parse) {
        const parsed = await parseFile(up.file_url, file.type);
        if (parsed.ok && parsed.body) {
          if (!bodyText) { bodyText = parsed.body; setBody(parsed.body); }
        } else if (!parsed.skipped) {
          collected.push(`原本から本文を取り出せませんでした（${parsed.reason ?? "理由不明"}）。原本は保存済みなので、後から本文を貼れます`);
        }
      } else {
        collected.push("画像は本文の取り出しを行いません（原本のみ保存します）");
      }
    }

    // 2. 残りの項目を埋める
    const { values, notes: n } = await enrichSwipe({
      uid, url: url.trim(), body: bodyText, reason: reason.trim(),
    });
    if (fileType && fileType !== "その他") values.source_type = fileType;

    setExtra({ ...EMPTY_EXTRA, ...values });
    setNotes([...collected, ...n]);
    setPhase("review");
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      const saved = await createSwipe(uid, {
        source_url: url.trim(),
        body:       body.trim(),
        file_url:   fileUrl,
        reason:     reason.trim(),
        ...extra,
      });
      // Zeus 索引への登録（失敗しても保存自体は成功させる。§F5）
      syncOneToZeus(saved.id);
      setUrl(""); setBody(""); setReason("");
      setFile(null); setFileUrl("");
      setExtra(EMPTY_EXTRA); setNotes([]); setPhase("input");
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

      <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.7, marginBottom: 12 }}>
        「なぜ良いか」は必ず必要です。URL・本文・ファイルは、どれか1つあれば登録できます。
      </div>

      <Field label="URL（任意）">
        <input
          style={inp}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://..."
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </Field>

      <Field label="本文・書き起こし（任意・URLが無いときはこちら）">
        <textarea
          style={{ ...inp, minHeight: 110, resize: "vertical" }}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="お手本の中身をそのまま貼る／自分の言葉で書き起こす"
        />
      </Field>

      <Field label="ファイル（任意・PDF / テキスト / 画像・10MBまで）">
        <input
          type="file"
          accept={ACCEPT}
          onChange={e => {
            const f = e.target.files?.[0] ?? null;
            if (f && f.size > MAX_BYTES) {
              setError(`ファイルが大きすぎます（上限 10MB／このファイルは ${(f.size / 1024 / 1024).toFixed(1)}MB）`);
              setFile(null);
              e.target.value = "";
              return;
            }
            setError("");
            setFile(f);
          }}
          style={{ ...inp, padding: "7px 9px" }}
        />
        {file && (
          <div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>
            {file.name}（{(file.size / 1024).toFixed(0)}KB）／PDF・テキストは本文を自動で取り出します
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

      {(url || body) && (
        <div style={{ fontSize: 10, color: T.faint, marginBottom: 12 }}>
          媒体の判定：{detectSourceType(url, { hasBody: body.trim().length > 0 })}
        </div>
      )}

      {phase !== "review" && (
        <button
          onClick={handleEnrich}
          disabled={!!problem || phase === "loading"}
          style={{ ...solidBtn(problem ? T.faint : T.text), width: "100%", justifyContent: "center", padding: "9px 14px", fontSize: 12 }}
        >
          {phase === "loading" ? (file ? "ファイルを読み込んでいます…" : "残りを埋めています…") : "AI補完して保存へ"}
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

          <Field label="一覧に出す短い抜粋">
            <textarea
              style={{ ...inp, minHeight: 70, resize: "vertical" }}
              value={extra.excerpt}
              onChange={e => setExtra({ ...extra, excerpt: e.target.value })}
              placeholder="全角200字程度。長い中身は本文欄へ"
            />
          </Field>

          <Field label="扱い">
            <select style={inp} value={extra.visibility} onChange={e => setExtra({ ...extra, visibility: e.target.value })}>
              {VISIBILITIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
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
