# swipe-file（スワイプファイルアプリ）

参考にしたい他者コンテンツを「URL・理由・タグ」の3点セットで貯め、AI が制作時に1発で参照できる状態を作るアプリ。

- 要件：スワイプファイルアプリ 要件定義 v1.5（シアニン担当 S3 成果物・本書が唯一の正）
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

`sql/01_pre_check.sql`（事前確認）→ `sql/02_create_tables.sql`（作成）の順に
Supabase SQL Editor で実行する。どちらも何回実行しても同じ結果になる。

- `sw_swipes`：スワイプ本体（参照回数 `ref_count` / 最終参照日時 `last_referenced_at` を含む）
- `sw_zeus_orphans`：削除済みスワイプの Zeus 索引ID（掃除待ち）
- `sw_increment_ref(uuid)`：参照回数を1つ増やす関数（詳細画面表示・`swipe__get` から呼ぶ）

---

## 実装ブロック

| ブロック | 内容 | 状態 |
|---|---|---|
| 1 | DB ＋ /diag | 完了 |
| 2 | F1/F3/F6（UI基本） | 未着手 |
| 3 | F4（MCP・独立Worker） | 未着手 |
| 4 | F5（Zeus索引連携） | 未着手 |
| 5 | F2（一括取り込み） | 未着手 |
