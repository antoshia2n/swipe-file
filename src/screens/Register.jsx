import { useState } from "react";
import { T } from "shia2n-core";
import SwipeForm from "./SwipeForm.jsx";
import BulkImport from "./BulkImport.jsx";

const MODE_SINGLE = "1件ずつ";
const MODE_BULK   = "まとめて";
const MODES = [MODE_SINGLE, MODE_BULK];

export default function Register({ uid, onSaved }) {
  const [mode, setMode] = useState(MODE_SINGLE);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {MODES.map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              background: mode === m ? T.s2 : "transparent",
              color:      mode === m ? T.text : T.muted,
              border:     `1px solid ${mode === m ? T.border2 : "transparent"}`,
              borderRadius: 6, padding: "4px 12px", fontSize: 11,
              fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === MODE_SINGLE
        ? <SwipeForm uid={uid} onSaved={onSaved} />
        : <BulkImport uid={uid} onDone={onSaved} />}
    </div>
  );
}
