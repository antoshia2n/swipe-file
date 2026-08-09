-- ============================================================================
-- 08：参照回数の加算関数に持ち主の確認を入れる（2026-08-09）
-- 正本のタスク：参照回数の加算処理に本人確認を入れる
--
-- やること：sw_increment_ref に「持ち主の印」を受け取る引数を足し、
--           その印と一致する行だけを加算するようにする。
--           出入り口（shia2n-core の db-gateway）が、この引数を
--           サーバーで確定した本人の印で必ず上書きして呼ぶ。
--
-- 破壊的変更：なし（データは1件も変更しない）
-- 冪等性    ：DROP ... IF EXISTS / CREATE OR REPLACE / REVOKE のため、
--             何回実行しても同じ結果になる。
--
-- 引数を1つ足すと Postgres の上では別の関数になる。古い1引数の関数を残すと、
-- p_id だけで呼んだときにどちらを使うか決まらずエラーになるため、先に外す。
--
-- p_user_id を省いて呼んだ場合は、これまでどおり持ち主を見ずに加算する。
-- 管理者キーを持つサーバー側（MCP の swipe__get など）が p_id だけで
-- 呼んでいるため、その経路を止めないための入口。画面からの呼び出しは
-- 出入り口が必ず印を入れるので、ここを素通りできない。
-- ============================================================================

DROP FUNCTION IF EXISTS public.sw_increment_ref(uuid);

CREATE OR REPLACE FUNCTION public.sw_increment_ref(p_id uuid, p_user_id text DEFAULT NULL)
RETURNS TABLE (ref_count integer, last_referenced_at timestamptz)
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.sw_swipes AS s
     SET ref_count          = s.ref_count + 1,
         last_referenced_at = now()
   WHERE s.id = p_id
     AND (p_user_id IS NULL OR s.user_id = p_user_id)
  RETURNING s.ref_count, s.last_referenced_at;
$$;

-- 新しく作った関数には既定の実行許可が自動で付くため、その場で外す。
REVOKE ALL ON FUNCTION public.sw_increment_ref(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sw_increment_ref(uuid, text) FROM anon, authenticated;
