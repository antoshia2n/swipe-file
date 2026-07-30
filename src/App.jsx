import { useEffect, useState } from "react";
import { useAuthUid, T } from "shia2n-core";
import { APP_NAME, TABS, TAB_LIST, TAB_REGISTER } from "./constants.js";
import SwipeList from "./screens/SwipeList.jsx";
import Register from "./screens/Register.jsx";
import SwipeDetail from "./screens/SwipeDetail.jsx";
import SpeedCheck from "./screens/SpeedCheck.jsx";
import { retryPendingZeusSync } from "./lib/zeus.js";

export default function App() {
  const uid = useAuthUid();
  const [tab, setTab]           = useState(TAB_LIST);
  // Zeus の正本リンク（?id=...）から開かれた場合は、その詳細を最初に表示する
  const [openId, setOpenId]     = useState(() => new URLSearchParams(window.location.search).get("id"));
  const [reloadKey, setReload]  = useState(0);
  // ?speed=1 のときだけ、速さと経路の確認画面を出す（通常の操作には出てこない）
  const [speedMode]             = useState(() => new URLSearchParams(window.location.search).get("speed") === "1");

  // 起動時に、未同期のスワイプをまとめて Zeus へ送り直す（§F5）
  useEffect(() => { retryPendingZeusSync(); }, []);

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
              style={{ background: tab === t && !openId && !speedMode ? T.text : "transparent", color: tab === t && !openId && !speedMode ? "#fff" : T.muted, border: "none", borderRadius: 6, padding: "5px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      <div style={{ padding: "14px 16px", maxWidth: 680, margin: "0 auto" }}>
        {speedMode ? (
          <SpeedCheck uid={uid} />
        ) : openId ? (
          <SwipeDetail
            id={openId}
            onBack={() => setOpenId(null)}
            onChanged={bumpReload}
          />
        ) : tab === TAB_REGISTER ? (
          <Register
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
