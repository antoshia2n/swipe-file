-- ============================================================================
-- スワイプファイルアプリ Block1 事前確認（Run 1）
-- 技術鉄則 §3.5 第1条「スキーマ事前確認義務」／§3.6 A-3 テンプレ準拠
--
-- 読み取りのみ（書き込みなし）。何回実行しても安全。
-- 期待する結果：tables / functions / triggers / rls_policies が全て空配列 []
--               → 未作成なので Run 2（02_create_tables.sql）へ進んでよい
-- 空でない場合：既に何かが存在している。開発部へ結果をそのまま貼って停止すること
-- ============================================================================

WITH t AS (SELECT 'sw'::text AS app_prefix)
SELECT jsonb_pretty(jsonb_build_object(
  'app_prefix', (SELECT app_prefix FROM t),
  'tables', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', tablename)), '[]'::jsonb)
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE (SELECT app_prefix FROM t) || '\_%'
  ),
  'functions', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', proname, 'return_type', pg_get_function_result(oid))), '[]'::jsonb)
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname LIKE (SELECT app_prefix FROM t) || '\_%'
  ),
  'triggers', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', trigger_name, 'table', event_object_table)), '[]'::jsonb)
    FROM information_schema.triggers
    WHERE event_object_schema = 'public' AND event_object_table LIKE (SELECT app_prefix FROM t) || '\_%'
  ),
  'rls_policies', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'command', cmd)), '[]'::jsonb)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename LIKE (SELECT app_prefix FROM t) || '\_%'
  )
)) AS pre_check;
