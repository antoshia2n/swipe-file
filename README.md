# swipe-file（スワイプファイルアプリ）

参考にしたい他者コンテンツを「URL・理由・タグ」の3点セットで貯め、AI が制作時に1発で参照できる状態を作るアプリ。

- 要件：Notion「スワイプファイルアプリ 要件定義 v1.7」が唯一の正
  https://app.notion.com/p/3ab9c6c1c439817abee4ee95f6a8a906
  （チャットへのMD貼付での受け渡しは廃止。改訂は常に上記ページ）
- 基盤：shia2n-app-template ＋ shia2n-core（React + Vite + Supabase + Cloudflare Pages）

---

## 環境変数（Cloudflare Pages → Settings → Environment variables）

既存アプリからコピペできるもの：

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_DATABASE_ID
ANTHROPIC_API_KEY
```

このアプリだけで新しく必要なもの：

```
ZEUS_EXTERNAL_SECRET   Zeus v2 外部API の合言葉（Zeus 側と同じ値）
ZEUS_USER_ID           Zeus v2 側のユーザーID（索引の登録先）
```

Production / Preview の両方に設定する。

---

## 診断ページ

デプロイ後、`https://<アプリのURL>/diag` を開くと、環境変数・Supabase 接続・
テーブル実在・Zeus 疎通・Claude 疎通を1画面で確認できる。
生の JSON が欲しいときは `/diag?json=1`。

---

## Supabase

`sql/01_pre_check.sql`（事前確認）→ `sql/02_create_tables.sql`（作成）→
`sql/03_v17_columns.sql`（v1.7 のカラム追加）の順に Supabase SQL Editor で実行する。
いずれも何回実行しても同じ結果になる。

- `sw_swipes`：スワイプ本体（本文 `body` / 原本 `file_url` / 公開区分 `visibility` / 参照回数 `ref_count` を含む）
- `sw_zeus_orphans`：削除済みスワイプの Zeus 索引ID（掃除待ち）
- `sw_increment_ref(uuid)`：参照回数を1つ増やす関数（詳細画面表示・`swipe__get` から呼ぶ）

---

## 画面

| 画面 | 中身 |
|---|---|
| 一覧 | 検索・絞り込み（タグ／媒体／軸／状態）・並び替え（登録日順／参照が多い順）・活用済を隠すトグル |
| 登録 | URL と理由の2項目 → AI補完 → 内容を確認して保存 |
| 詳細 | 全項目の編集・活用済切替・削除。開いた時点で参照回数が1つ増える |

## 実装ブロック

| ブロック | 内容 | 状態 |
|---|---|---|
| 1 | DB ＋ /diag | 完了 |
| 2 | F1/F3/F6（UI基本） | 完了 |
| 2.5 | v1.7 カラム追加＋保存条件の修正 | 完了 |
| 3 | F4（MCP・独立Worker） | 未着手 |
| 3.5 | F7（ファイル取り込み） | 未着手 |
| 4 | F5（Zeus索引連携） | 未着手 |
| 5 | F2（一括取り込み） | 未着手 |
