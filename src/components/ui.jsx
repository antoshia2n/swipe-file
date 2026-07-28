import { T, lb10 } from "shia2n-core";

/* サブコンポーネントは必ず親の外側に置く（技術鉄則 §4.2：
   親の中で定義すると再描画のたびに入力欄からフォーカスが外れる） */

export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...lb10, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

export function Badge({ text, color = T.muted }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 700, color,
      border: `1px solid ${color}`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  );
}

export function TagChips({ tags = [], onRemove }) {
  if (!tags.length) return <div style={{ fontSize: 11, color: T.faint }}>タグなし</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {tags.map(tag => (
        <span key={tag} style={{
          background: T.s2, border: `1px solid ${T.border2}`, borderRadius: 12,
          padding: "2px 9px", fontSize: 11, display: "flex", alignItems: "center", gap: 5,
        }}>
          {tag}
          {onRemove && (
            <button
              onClick={() => onRemove(tag)}
              aria-label={`${tag} を外す`}
              style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 13, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

export function Notice({ kind = "info", children }) {
  const color = kind === "error" ? T.red : kind === "warn" ? T.amber : T.blue;
  return (
    <div style={{
      border: `1px solid ${color}`, borderRadius: 8, padding: "8px 11px",
      fontSize: 11, color, lineHeight: 1.6, marginBottom: 12, background: T.surface,
    }}>
      {children}
    </div>
  );
}

export function statusColor(status) {
  if (status === "活用済")      return T.green;
  if (status === "reason未記入") return T.red;
  return T.blue;
}
