# swipe-file（スワイプくん）

X の参考ポスト・note・情報商材・自分の資料を、リンク・本文・画像・分析と一緒に貯め、
種類・参考ポイント・評価・ジャンル・分析・ラベルで探せるようにするアプリ。AI からは swipe-mcp で読む・足す。

- 住所：https://swipe.shia2n.jp（Cloudflare Pages。main に結合すると自動で出る）
- 基盤：shia2n-core（AuthGuard・データの出入り口・置き場の出入り口）＋ Vite
- 画面：`src/engine/app.js`（デモ 8 の形をそのまま本物のデータにつないだもの。React は入口だけ）

## 環境変数（Cloudflare Pages → Settings → Environment variables）

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_DB_GATEWAY            /api/db
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_DATABASE_ID
SUPABASE_SERVICE_ROLE_KEY
SWIPE_ALLOW_UID            任意。ファイルを上げられる人（カンマ区切り）。未設定なら Naoki 1 人
```

`ANTHROPIC_API_KEY`・`ZEUS_EXTERNAL_SECRET`・`ZEUS_USER_ID` はもう使わない（Claude の口と Zeus 連携は外した）。

## 診断ページ

`/diag`（`/diag?json=1` で JSON）。表 2 つの実在、公開キーで表にも置き場にも届かないことを 1 画面で見る。

## Supabase

- `sw_swipes`：1 件 1 行。スワイプくんで足した列は `table_id`（置き場）・`shu`（種類）・`refs`（参考ポイント）・`grade`（評価 0〜5）・`genres`・`labels`・`reason`（言語化）・`an_hypo`（仮説）・`an_idea`（用途抽出）・`highlights`（本文の線）・`used_log`（使った記録）・`props`（種類ごとの欄・保存時の数字・画像の住所）・`ai_ask`（Claude に分析を頼む印）
- `sw_settings`：1 人 1 行。フォルダ・表・ビュー・列の並び・ラベルの選べる値
- 置き場 `swipe-files`：読むのは公開の住所。書くのは `/api/storage/upload` だけ（公開キーでは書けない）
- 表を変える SQL は GPT への作業の 1 枚で渡す（作業 25：https://www.notion.so/4029c6c1c43981d9a128eeaa5c810e41）

## 1便目に入れていないもの

- X 上のサイドパネル（2便目）
- 素材パック・共有ページ（3便目）

## 拡張機能「スワイプくんパネル」（2便目・2026-10-23）

- 置き場：このリポジトリの `swipe-kun-panel/`。Chrome の「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選ぶ
- 枠（`panel.html`）がスワイプくんの細い画面 `/panel` を開き、`panel.js` が見ているタブを読む・撮る（押したときだけ）
- 撮り方：ポストだけ（スレッドは 1 件ずつ切り抜いて縦に並べる）／見えている範囲／範囲をなぞる
- 画面側の直しは結合だけで届く。拡張機能を入れ直すのは `swipe-kun-panel/` を変えたときだけ
