-- ============================================================================
-- スワイプファイル：原本ファイルの保存先を用意する（要件 v1.8 §F7 / §7）
-- 実行環境：Supabase SQL Editor
--
-- 破壊的変更：なし（作るだけ。既存データは触りません）
-- 冪等性    ：何回実行しても同じ結果になります
-- ============================================================================

-- ── 1. 保存先（バケット）を作る ────────────────────────────────────────────
-- public = true：原本を開くリンクをそのまま使えるようにするため
-- 上限 10MB（要件 §F7）
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('swipe-files', 'swipe-files', true, 10485760)
ON CONFLICT (id) DO UPDATE
  SET public = true, file_size_limit = 10485760;


-- ── 2. アクセス許可（技術鉄則の RLS 全体方針に合わせる） ────────────────────
DROP POLICY IF EXISTS "allow_all swipe-files" ON storage.objects;
CREATE POLICY "allow_all swipe-files" ON storage.objects
  FOR ALL
  USING      (bucket_id = 'swipe-files')
  WITH CHECK (bucket_id = 'swipe-files');


-- ── 3. 事後確認 ────────────────────────────────────────────────────────────
SELECT jsonb_pretty(jsonb_build_object(
  'バケット', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      '名前', id, '公開', public, '上限バイト', file_size_limit
    )), '[]'::jsonb)
    FROM storage.buckets WHERE id = 'swipe-files'
  ),
  'ポリシー', (
    SELECT COALESCE(jsonb_agg(policyname), '[]'::jsonb)
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%swipe-files%'
  )
)) AS post_check;
