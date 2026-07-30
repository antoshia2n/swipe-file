-- 07a：閉じる前の現状確認（読み取りのみ・1回の実行で1つの表）
-- 正本：2026-07-30 決定「画面は公開キーでデータベースに直接触らない」
--
-- 使い方：Supabase → SQL Editor に「このファイルの中身だけ」を貼って実行する。
--         結果表をそのまま Claude に貼り戻してください。
--
-- 見方：ここに行が出ている＝まだ公開キーで届く状態。
--       07b を実行したあとは 0 行になるのが正しい。

select
  c.relname                                                as テーブル,
  g.grantee                                                as 相手,
  string_agg(g.privilege_type, ', ' order by g.privilege_type) as 権限
from information_schema.role_table_grants g
join pg_class     c on c.relname = g.table_name
join pg_namespace n on n.oid     = c.relnamespace and n.nspname = g.table_schema
where g.table_schema = 'public'
  and c.relkind      = 'r'
  and c.relname like 'sw\_%'          -- 名前を並べず、接頭辞の条件で全件走査する
  and g.grantee in ('anon', 'authenticated')
group by c.relname, g.grantee
order by c.relname, g.grantee;
