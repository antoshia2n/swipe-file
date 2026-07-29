-- 見出しの決め方を1本化するための下準備（2026-07-29）
--
-- 目的：
--   ・見出しが「自動で付いたもの」か「人が決めたもの」かを覚えておく
--   ・すでに機械的に入ってしまった見出しに印を立て、画面から一括で作り直せるようにする
--
-- 実行順：このSQL → コードの差し替え（列が無いと登録でエラーになるため、必ずSQLが先）

-- 1. 変更前の状態
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'sw_swipes' and column_name in ('title', 'title_auto')
order by column_name;

-- 2. 列を足す（既にあれば何もしない）
alter table sw_swipes
  add column if not exists title_auto boolean not null default false;

-- 3. すでに入っている「機械的な見出し」に印を立てる
--    条件：空 ／ URLがそのまま入っている ／ 改行を含む ／ Markdown記号で始まる ／ 本文の先頭40字と一致
update sw_swipes
set title_auto = true
where title is null
   or btrim(title) = ''
   or (source_url is not null and title = source_url)
   or position(chr(10) in title) > 0
   or position(chr(13) in title) > 0
   or title like '#%'
   or title like '>%'
   or (body is not null and title = left(body, 40));

-- 4. 変更後の確認（title_auto = true の行が、作り直しの対象になる）
select
  title_auto,
  count(*) as 件数
from sw_swipes
group by title_auto
order by title_auto;

select
  left(coalesce(title, ''), 30) as 見出しの先頭,
  title_auto,
  case when source_url is null then 'URLなし' else 'URLあり' end as 出典
from sw_swipes
order by created_at desc;
