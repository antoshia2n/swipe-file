import { useState } from "react";
import { T, card, inp, solidBtn, ghostBtn } from "shia2n-core";
import { Field, Notice } from "../components/ui.jsx";
import { enrichSwipe } from "../lib/enrich.js";
import { createSwipe } from "../lib/swipes.js";
import { syncOneToZeus } from "../lib/zeus.js";

const MAX_LINES = 50;

/**
 * 1行の書き方（要件 v1.8 §F2）
 *   URL だけ                  → 理由なしの仮登録になる（一覧で赤表示）
 *   URL␣理由 / URL,理由 / URL⇥理由 → 理由つきで登録される
 */
export function parseLines(text) {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(\S+)[\s,、]+(.*)$/);
      if (match) return { url: match[1], reason: match[2].trim() };
      return { url: line, reason: "" };
    });
}

export default function BulkImport({ uid, onDone }) {
  const [text, setText]       = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [error, setError]     = useState("");

  const rows = parseLines(text);
  const tooMany = rows.length > MAX_LINES;

  async function handleRun() {
    setError("");
    if (!rows.length) { setError("URL を1行以上入れてください"); return; }
    if (tooMany)      { setError(`一度に取り込めるのは ${MAX_LINES} 行までです`); return; }

    setRunning(true);
    setResults([]);
    setProgress({ done: 0, total: rows.length });

    const collected = [];
    for (const [index, row] of rows.entries()) {
      try {
        if (!/^https?:\/\//i.test(row.url)) {
          throw new Error("URL として読めません");
        }
        // 単発登録と同じ補完処理を通す（§F2）
        const { values } = await enrichSwipe({
          uid, url: row.url, body: "", reason: row.reason,
        });
        const saved = await createSwipe(uid, {
          source_url: row.url,
          reason:     row.reason,
          ...values,
        });
        syncOneToZeus(saved.id);
        collected.push({
          ok:    true,
          url:   row.url,
          draft: !row.reason,
        });
      } catch (err) {
        collected.push({ ok: false, url: row.url, reason: err.message });
      }
      setProgress({ done: index + 1, total: rows.length });
      setResults([...collected]);
    }

    setRunning(false);
    onDone?.();
  }

  const okCount    = results.filter(r => r.ok).length;
  const draftCount = results.filter(r => r.ok && r.draft).length;
  const ngCount    = results.filter(r => !r.ok).length;

  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      {error && <Notice kind="error">{error}</Notice>}

      <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.8, marginBottom: 12 }}>
        1行に1件ずつ貼ってください。<br />
        URL だけの行は「理由未記入」として仮登録され、一覧で赤く出ます。<br />
        URL のあとに空白かカンマを置いて理由を書くと、そのまま理由として入ります。
      </div>

      <Field label={`URLリスト（改行区切り・${MAX_LINES}行まで）`}>
        <textarea
          style={{ ...inp, minHeight: 170, resize: "vertical", fontFamily: "'DM Mono',monospace", fontSize: 11 }}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"https://x.com/aaa/status/1 冒頭のフックが強い\nhttps://note.com/bbb/n/xxx\nhttps://example.com/article"}
          disabled={running}
        />
        <div style={{ fontSize: 10, color: tooMany ? T.red : T.faint, marginTop: 3 }}>
          {rows.length} 行{tooMany ? `（${MAX_LINES} 行を超えています）` : ""}
        </div>
      </Field>

      <button
        onClick={handleRun}
        disabled={running || !rows.length || tooMany}
        style={{ ...solidBtn(running || !rows.length || tooMany ? T.faint : T.text), width: "100%", justifyContent: "center", padding: "9px 14px", fontSize: 12 }}
      >
        {running ? `取り込み中… ${progress.done} / ${progress.total}` : "まとめて登録する"}
      </button>

      {results.length > 0 && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            登録 {okCount} 件{draftCount ? `（うち理由未記入 ${draftCount} 件）` : ""}
            {ngCount ? ` ／ 失敗 ${ngCount} 件` : ""}
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {results.map((r, i) => (
              <ResultRow key={i} row={r} />
            ))}
          </div>
          {draftCount > 0 && (
            <div style={{ fontSize: 11, color: T.muted, marginTop: 9, lineHeight: 1.7 }}>
              理由未記入の分は一覧で赤く出ます。開いて1行足すと通常の状態に戻ります。
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* 行は親の外側に定義する（技術鉄則 §4.2） */
function ResultRow({ row }) {
  const color = !row.ok ? T.red : row.draft ? T.amber : T.green;
  const label = !row.ok ? "失敗" : row.draft ? "理由未記入" : "登録";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0", fontSize: 11, lineHeight: 1.6 }}>
      <span style={{ color, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.muted, wordBreak: "break-all" }}>
        {row.url}
        {!row.ok && <span style={{ color: T.red }}>（{row.reason}）</span>}
      </span>
    </div>
  );
}
