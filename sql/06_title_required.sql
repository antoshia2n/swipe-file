-- 見出しを必須にする（2026-07-29 の方針変更）
--
-- 変更点：
--   ・見出しが空のまま保存できないようにする
--   ・「なぜ良いか・要約」はこれまでどおり必須のまま
--   ・例外は一括取り込みの仮登録（status = 'reason未記入'）だけ。一覧で赤く出る
--
-- 実行順：このSQL → コードの差し替え（先にコードを入れると、古い画面から
--         見出し無しで保存できてしまうため、SQLを先にする）

-- 1. 変更前の確認（見出しが空の行が残っていないか）
select
  count(*) filter (where btrim(coalesce(title, '')) = '') as 見出しが空の件数,
  count(*)                                                as 全件数
from sw_swipes;

-- 2. 万一、見出しが空の行があれば埋めておく（制約に引っかかって失敗しないように）
update sw_swipes
set title      = '見出し未設定',
    title_auto = true
where btrim(coalesce(title, '')) = '';

-- 3. 制約を張り直す
alter table sw_swipes drop constraint if exists sw_swipes_title_required_check;

alter table sw_swipes
  add constraint sw_swipes_title_required_check
  check (status = 'reason未記入' or length(btrim(title)) > 0);

-- 4. 変更後の確認（この2つが表示されれば成功）
select conname as 制約名, pg_get_constraintdef(oid) as 中身
from pg_constraint
where conrelid = to_regclass('public.sw_swipes')
  and conname in ('sw_swipes_title_required_check', 'sw_swipes_reason_required_check')
order by conname;

select
  left(coalesce(title, ''), 30) as 見出しの先頭,
  title_auto,
  left(coalesce(reason, ''), 20) as 理由の先頭
from sw_swipes
order by created_at desc;
