-- 09：スワイプくん 1便目（2026-10-23）
-- 実行は GPT への作業の 1 枚で行う（作業 25）：https://www.notion.so/4029c6c1c43981d9a128eeaa5c810e41
-- ここは記録用の写し。中身は作業 25 の手順 3・4・5 と同じ。戻し方も作業 25 の末尾にある。

alter table public.sw_swipes
  add column if not exists table_id   text,
  add column if not exists shu        text,
  add column if not exists refs       text[]   not null default '{}'::text[],
  add column if not exists grade      smallint not null default 0,
  add column if not exists genres     text[]   not null default '{}'::text[],
  add column if not exists labels     text[]   not null default '{}'::text[],
  add column if not exists an_hypo    text     not null default '',
  add column if not exists an_idea    text     not null default '',
  add column if not exists highlights jsonb    not null default '[]'::jsonb,
  add column if not exists used_log   jsonb    not null default '[]'::jsonb,
  add column if not exists props      jsonb    not null default '{}'::jsonb,
  add column if not exists ai_ask     boolean  not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sw_swipes_grade_check') then
    alter table public.sw_swipes add constraint sw_swipes_grade_check check (grade between 0 and 5);
  end if;
end $$;

-- 未分析のまま保存できるようにする（言語化は後で書ける）
alter table public.sw_swipes drop constraint if exists sw_swipes_reason_required_check;

create index if not exists sw_swipes_user_table_idx on public.sw_swipes (user_id, table_id);

create table if not exists public.sw_settings (
  user_id     text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.sw_settings enable row level security;
revoke all on public.sw_settings from anon, authenticated;

-- 今ある行の振り分け（作業 25 の手順 4。まだ振り分けていない行だけ）は作業 25 を見る

-- 置き場に公開キーで書ける決まりを外す（読むのは公開のまま）
drop policy if exists "allow_all swipe-files" on storage.objects;
