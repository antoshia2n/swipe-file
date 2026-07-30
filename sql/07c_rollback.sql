-- 07c：緊急時の戻し（07b を取り消す・1回の実行で1つの表）
--
-- 使うのは「出入り口が動かず、スワイプが一切使えない」ときだけ。
-- これを実行すると公開キーからまた届く状態に戻る（元の危険な状態）。
-- 実行したら、その日のうちに原因を直して 07b をやり直す。

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
    execute format(
      'grant select, insert, update, delete on public.%I to anon, authenticated',
      r.relname
    );
  end loop;
end $$;

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
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;

-- 確認：戻っていれば行が出る（最後の1文だけが結果として返る）
select
  c.relname                                                as テーブル,
  g.grantee                                                as 相手,
  string_agg(g.privilege_type, ', ' order by g.privilege_type) as 権限
from information_schema.role_table_grants g
join pg_class     c on c.relname = g.table_name
join pg_namespace n on n.oid     = c.relnamespace and n.nspname = g.table_schema
where g.table_schema = 'public'
  and c.relkind      = 'r'
  and c.relname like 'sw\_%'
  and g.grantee in ('anon', 'authenticated')
group by c.relname, g.grantee
order by c.relname, g.grantee;
