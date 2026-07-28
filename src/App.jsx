import { useState } from "react";
import { useAuthUid, T } from "shia2n-core";
import { APP_NAME, TABS, TAB_LIST, TAB_REGISTER } from "./constants.js";
import SwipeList from "./screens/SwipeList.jsx";
import SwipeForm from "./screens/SwipeForm.jsx";
import SwipeDetail from "./screens/SwipeDetail.jsx";

export default function App() {
  const uid = useAuthUid();
  const [tab, setTab]           = useState(TAB_LIST);
  const [openId, setOpenId]     = useState(null);
  const [reloadKey, setReload]  = useState(0);

  const bumpReload = () => setReload(k => k + 1);

  function goTab(next) {
    setOpenId(null);
    setTab(next);
  }

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", fontSize: 13, color: T.text }}>
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{APP_NAME}</div>
        <nav style={{ display: "flex", gap: 3 }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => goTab(t)}
              style={{ background: tab === t && !openId ? T.text : "transparent", color: tab === t && !openId ? "#fff" : T.muted, border: "none", borderRadius: 6, padding: "5px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      <div style={{ padding: "14px 16px", maxWidth: 680, margin: "0 auto" }}>
        {openId ? (
          <SwipeDetail
            id={openId}
            onBack={() => setOpenId(null)}
            onChanged={bumpReload}
          />
        ) : tab === TAB_REGISTER ? (
          <SwipeForm
            uid={uid}
            onSaved={() => { bumpReload(); setTab(TAB_LIST); }}
          />
        ) : (
          <SwipeList
            uid={uid}
            onOpen={setOpenId}
            reloadKey={reloadKey}
          />
        )}
      </div>
    </div>
  );
}
