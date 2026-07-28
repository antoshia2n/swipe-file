-- ============================================================================
-- スワイプファイルアプリ Block1 DDL（要件定義 v1.5 §4 準拠）
-- 実行環境：Supabase SQL Editor（Run 1 の事前確認を先に実行すること）
--
-- 破壊的変更：なし（DROP TABLE / TRUNCATE を一切含まない）
-- 冪等性    ：IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS で担保。
--             何回実行しても同じ結果になる。
--             ★ 前回配布した v1.4 版の SQL を既に実行していても、していなくても、
--               このファイル1本を実行すれば v1.5 の状態に揃う。
-- 技術鉄則  ：§3.5 SQL 変更プロトコル v1.2（1ファイル統合・冪等性・破壊的変更明示）
--             RLS 全体方針（暫定全許可 + アプリ層で user_id 分離／
--             ポリシー名は allow_all <table_name> で統一）
-- ============================================================================


-- ── 1. sw_swipes（本体） ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sw_swipes (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text        NOT NULL,
  source_url         text        NOT NULL,
  reason             text        NOT NULL DEFAULT '',
  topic_tags         text[]      NOT NULL DEFAULT '{}',
  title              text        NOT NULL DEFAULT '',
  source_type        text        NOT NULL DEFAULT 'その他',
  author             text,
  excerpt            text,
  content_axis       text,
  status             text        NOT NULL DEFAULT '未活用',
  used_in            text,
  screenshot_url     text,
  zeus_synced        boolean     NOT NULL DEFAULT false,
  zeus_item_id       text,
  ref_count          integer     NOT NULL DEFAULT 0,
  last_referenced_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- 旧版（v1.4）で作成済みだった場合に不足カラムを補う
ALTER TABLE public.sw_swipes ADD COLUMN IF NOT EXISTS zeus_item_id       text;
ALTER TABLE public.sw_swipes ADD COLUMN IF NOT EXISTS ref_count          integer NOT NULL DEFAULT 0;
ALTER TABLE public.sw_swipes ADD COLUMN IF NOT EXISTS last_referenced_at timestamptz;

-- 値の取りうる範囲を DB 側で固定する（アプリのバグでゴミ値が入るのを防ぐ）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sw_swipes_status_check') THEN
    ALTER TABLE public.sw_swipes
      ADD CONSTRAINT sw_swipes_status_check
      CHECK (status IN ('未活用', '活用済', 'reason未記入'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sw_swipes_source_type_check') THEN
    ALTER TABLE public.sw_swipes
      ADD CONSTRAINT sw_swipes_source_type_check
      CHECK (source_type IN ('X', 'note', 'YouTube', 'ブログ', 'その他'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sw_swipes_content_axis_check') THEN
    ALTER TABLE public.sw_swipes
      ADD CONSTRAINT sw_swipes_content_axis_check
      CHECK (content_axis IS NULL OR content_axis IN ('思考系', '習慣系', '攻略系', 'その他'));
  END IF;

  -- 登録3点セット強制（受け入れ基準5）を DB 層でも担保する。
  -- F2 一括取り込みの「reason未記入」仮登録だけを明示的な例外として許可する。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sw_swipes_reason_required_check') THEN
    ALTER TABLE public.sw_swipes
      ADD CONSTRAINT sw_swipes_reason_required_check
      CHECK (status = 'reason未記入' OR length(btrim(reason)) > 0);
  END IF;

  -- 参照回数は負にならない（受け入れ基準8の前提）
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sw_swipes_ref_count_check') THEN
    ALTER TABLE public.sw_swipes
      ADD CONSTRAINT sw_swipes_ref_count_check
      CHECK (ref_count >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sw_swipes_user_created_idx
  ON public.sw_swipes (user_id, created_at DESC);

-- F3「参照が多い順」用（同数は登録日降順＝並び順仕様どおりの複合インデックス）
CREATE INDEX IF NOT EXISTS sw_swipes_user_refcount_idx
  ON public.sw_swipes (user_id, ref_count DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS sw_swipes_topic_tags_idx
  ON public.sw_swipes USING gin (topic_tags);

-- F5 リトライ対象（未同期）だけを高速に拾うための部分インデックス
CREATE INDEX IF NOT EXISTS sw_swipes_zeus_pending_idx
  ON public.sw_swipes (user_id)
  WHERE zeus_synced = false;


-- ── 2. sw_zeus_orphans（索引の掃除待ち置き場） ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.sw_zeus_orphans (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL,
  zeus_item_id  text        NOT NULL,
  source_url    text        NOT NULL,
  deleted_at    timestamptz NOT NULL DEFAULT now()
);

-- 旧版（v1.4）では source_url が任意だったため、v1.5 の必須へ揃える
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sw_zeus_orphans'
      AND column_name = 'source_url' AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.sw_zeus_orphans WHERE source_url IS NULL
  ) THEN
    ALTER TABLE public.sw_zeus_orphans ALTER COLUMN source_url SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sw_zeus_orphans_user_idx
  ON public.sw_zeus_orphans (user_id, deleted_at DESC);


-- ── 3. updated_at 自動更新トリガー ──────────────────────────────────────────
-- shia2n-core の updateOne は updated_at を更新しないため、DB 側で担保する。
-- ただし「参照されただけ」（ref_count / last_referenced_at のみの変化）では
-- 更新日時を動かさない。閲覧で更新日時が動くと「いつ内容を直したか」が
-- 分からなくなるため。
CREATE OR REPLACE FUNCTION public.sw_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'ref_count' - 'last_referenced_at' - 'updated_at')
     = (to_jsonb(OLD) - 'ref_count' - 'last_referenced_at' - 'updated_at') THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sw_swipes_set_updated_at ON public.sw_swipes;
CREATE TRIGGER sw_swipes_set_updated_at
  BEFORE UPDATE ON public.sw_swipes
  FOR EACH ROW EXECUTE FUNCTION public.sw_set_updated_at();


-- ── 4. 参照回数の加算関数 ───────────────────────────────────────────────────
-- 「読み取って +1 して書き戻す」をアプリ側でやると、同時に開いたときに
-- 数え落ちが起きる。DB 側の1文で加算して数え落ちを構造的に防ぐ。
-- 呼び出し元：MCP の swipe__get／アプリの詳細画面（要件 v1.5 §F4「1回」の定義）
CREATE OR REPLACE FUNCTION public.sw_increment_ref(p_id uuid)
RETURNS TABLE (ref_count integer, last_referenced_at timestamptz)
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.sw_swipes AS s
     SET ref_count          = s.ref_count + 1,
         last_referenced_at = now()
   WHERE s.id = p_id
  RETURNING s.ref_count, s.last_referenced_at;
$$;


-- ── 5. RLS（暫定全許可 + アプリ層で user_id 分離） ──────────────────────────
-- shia2n-core は Firebase JWT を Supabase に渡さないため auth.uid() は常に空。
-- uid 一致ポリシーにすると全拒否になる（技術鉄則：Supabase RLS 全体方針）。
ALTER TABLE public.sw_swipes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sw_zeus_orphans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all sw_swipes" ON public.sw_swipes;
CREATE POLICY "allow_all sw_swipes" ON public.sw_swipes
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all sw_zeus_orphans" ON public.sw_zeus_orphans;
CREATE POLICY "allow_all sw_zeus_orphans" ON public.sw_zeus_orphans
  FOR ALL USING (true) WITH CHECK (true);


-- ── 6. 事後確認（この結果が最後に1つ表示される） ────────────────────────────
SELECT jsonb_pretty(jsonb_build_object(
  'tables', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', tablename) ORDER BY tablename), '[]'::jsonb)
    FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'sw\_%'
  ),
  'sw_swipes_columns', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type, 'nullable', is_nullable) ORDER BY ordinal_position), '[]'::jsonb)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sw_swipes'
  ),
  'sw_zeus_orphans_columns', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type, 'nullable', is_nullable) ORDER BY ordinal_position), '[]'::jsonb)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sw_zeus_orphans'
  ),
  'constraints', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', conname, 'definition', pg_get_constraintdef(oid)) ORDER BY conname), '[]'::jsonb)
    FROM pg_constraint
    WHERE conrelid IN (to_regclass('public.sw_swipes'), to_regclass('public.sw_zeus_orphans'))
  ),
  'functions', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', proname) ORDER BY proname), '[]'::jsonb)
    FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'sw\_%'
  ),
  'triggers', (
    SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('name', trigger_name, 'table', event_object_table)), '[]'::jsonb)
    FROM information_schema.triggers
    WHERE event_object_schema = 'public' AND event_object_table LIKE 'sw\_%'
  ),
  'indexes', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', indexname) ORDER BY indexname), '[]'::jsonb)
    FROM pg_indexes WHERE schemaname = 'public' AND tablename LIKE 'sw\_%'
  ),
  'rls_policies', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'command', cmd) ORDER BY tablename), '[]'::jsonb)
    FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'sw\_%'
  )
)) AS post_check;
