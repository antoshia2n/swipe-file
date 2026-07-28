import { T, card, lb10, solidBtn } from "shia2n-core";

/**
 * Block1 時点の着地画面。
 * ログインが通ったこと・診断ページへ飛べることだけを担保する。
 * Block2（UI基本）で「一覧」「登録」の実画面に置き換える。
 */
export default function Home({ uid, tab }) {
  return (
    <div style={{ ...card, padding: "20px 22px" }}>
      <div style={{ ...lb10, marginBottom: 8 }}>{tab}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
        土台の設置が完了しました
      </div>
      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, marginBottom: 14 }}>
        この画面が見えていれば、ログインとポータル登録は正常です。<br />
        接続まわりの状態は診断ページで確認できます。
      </div>

      <a href="/diag" style={{ textDecoration: "none" }}>
        <button style={solidBtn()}>診断ページを開く</button>
      </a>

      <div style={{ fontSize: 11, color: T.faint, marginTop: 16, fontFamily: "'DM Mono',monospace" }}>
        uid: {uid}
      </div>
    </div>
  );
}
