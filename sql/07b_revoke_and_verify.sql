-- 07b：公開キーからの到達を閉じる（変更あり・1回の実行で1つの表）
-- 正本：2026-07-30 決定「画面は公開キーでデータベースに直接触らない」
--
-- 前提：先に画面が「出入り口を経由」で正常に動いていることを確認してから実行する。
--       （/diag で「データの出入り口」が OK ／ 一覧・登録・削除が動く）
--
-- やること：sw_ で始まる表と関数から、公開キー（anon）とログイン済みキー
--           （authenticated）の権限を外す。データは1件も変更しない。
--           サーバー側（出入り口・MCP・Zeus同期）は管理者キーで動くため影響なし。
--
-- 使い方：このファイルの中身だけを貼って1回実行する。最後に確認用の表が1つ出る。

-- 表：接頭辞の条件で全件走査する（名前を並べて消さない）
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'sw\_%'
  loop
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

-- 関数：同じ条件で走査する（sw_increment_ref など）
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'sw\_%'
  loop
    execute format('revoke all on function %s from anon, authenticated', r.sig);
  end loop;
end $$;

-- 確認：ここが 0 行なら閉じ切れている（最後の1文だけが結果として返る）
select
  c.relname                                                as テーブル,
  g.grantee                                                as 残っている相手,
  string_agg(g.privilege_type, ', ' order by g.privilege_type) as 残っている権限
from information_schema.role_table_grants g
join pg_class     c on c.relname = g.table_name
join pg_namespace n on n.oid     = c.relnamespace and n.nspname = g.table_schema
where g.table_schema = 'public'
  and c.relkind      = 'r'
  and c.relname like 'sw\_%'
  and g.grantee in ('anon', 'authenticated')
group by c.relname, g.grantee
order by c.relname, g.grantee;
