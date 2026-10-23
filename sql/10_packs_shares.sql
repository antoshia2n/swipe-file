-- 10：スワイプくん 3便目（2026-10-23）素材パックと共有ページの表
-- 実行は GPT への作業の 1 枚で行う（作業 27）。ここは記録用の写し。中身は作業 27 の手順 3 と同じ。
-- 今ある表（sw_swipes・sw_settings）には触らない。

-- 素材パック：選んだスワイプ（items にスワイプの id を並べる）と目的を 1 枚にまとめ、AI へ渡す
create table if not exists public.sw_packs (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  table_id    text,
  name        text not null default '新しい素材パック',
  make        text not null default '',
  goal        text not null default '',
  items       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sw_packs_user_idx on public.sw_packs (user_id);
alter table public.sw_packs enable row level security;
revoke all on public.sw_packs from anon, authenticated;

-- 共有ページ：選んだスワイプ（items に { id, c } を並べる。c はシアニンのコメント）を、生徒にリンクで見せる
-- 生徒側はログインなし。/s/{token} をサーバーが鍵つきで読み、公開中で期限内のときだけ出す
create table if not exists public.sw_shares (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  table_id        text,
  token           text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  name            text not null default '新しい共有ページ',
  intro           text not null default '',
  items           jsonb not null default '[]'::jsonb,
  show_hypo       boolean not null default false,
  show_idea       boolean not null default false,
  show_file       boolean not null default false,
  live            boolean not null default true,
  expire_at       timestamptz,
  cta             boolean not null default true,
  cta_text        text not null default 'しあらぼでは、この型を使った投稿を毎週添削しています。',
  cta_btn         text not null default 'しあらぼの説明を見る',
  cta_url         text not null default '',
  opens           integer not null default 0,
  last_opened_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists sw_shares_user_idx on public.sw_shares (user_id);
alter table public.sw_shares enable row level security;
revoke all on public.sw_shares from anon, authenticated;

-- 戻し方（開発部用）
-- drop table if exists public.sw_shares;
-- drop table if exists public.sw_packs;
