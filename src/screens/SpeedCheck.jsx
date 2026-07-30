import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase, dbGatewayEnabled, T, card, lb10, solidBtn } from "shia2n-core";

/**
 * 速さと経路の確認（?speed=1 で開く）
 *
 * 2026-07-30 決定「画面は公開キーでデータベースに直接触らない」の完了条件
 * 「移設の前後で速さを測った数字がある」を、URL を1つ開くだけで満たすための画面。
 *
 * 同じ一覧取得を2つの経路で3回ずつ実行し、中央値を出す。
 *   出入り口経由 … 画面 → 自分のアプリのサーバー → Supabase
 *   公開キー直結 … 画面 → Supabase（閉じたあとは失敗する。それが閉じた証拠）
 */

const TABLE = "sw_swipes";
const RUNS  = 3;

// 直結の計測用。ログインの保存は共有しない（接続が二重に立ち上がるのを避ける）
const directClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measure(client, uid) {
  const times = [];
  let count   = 0;
  let failure = "";

  for (let i = 0; i < RUNS; i += 1) {
    const startedAt = performance.now();
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(200);
    times.push(Math.round(performance.now() - startedAt));
    if (error) { failure = error.message || "取得できませんでした"; break; }
    count = data?.length ?? 0;
  }
  return { times, count, failure };
}

function ResultRow({ label, note, result }) {
  if (!result) return null;
  const failed = Boolean(result.failure);
  return (
    <div style={{ ...card, padding: 12, marginBottom: 8 }}>
      <div style={lb10}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: failed ? T.muted : T.text, margin: "3px 0" }}>
        {failed ? "取得できませんでした" : `${median(result.times)} ミリ秒`}
      </div>
      <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
        {failed
          ? result.failure
          : `${RUNS} 回の中央値（各回 ${result.times.join(" / ")} ミリ秒）・取得 ${result.count} 件`}
        <br />{note}
      </div>
    </div>
  );
}

export default function SpeedCheck({ uid }) {
  const [busy, setBusy]         = useState(false);
  const [gateway, setGateway]   = useState(null);
  const [direct, setDirect]     = useState(null);

  async function run() {
    if (!uid) return;
    setBusy(true);
    setGateway(null);
    setDirect(null);
    try {
      setGateway(await measure(supabase, uid));
      setDirect(await measure(directClient, uid));
    } finally {
      setBusy(false);
    }
  }

  const diff =
    gateway && direct && !gateway.failure && !direct.failure
      ? median(gateway.times) - median(direct.times)
      : null;

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>速さと経路の確認</div>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 12, lineHeight: 1.7 }}>
        同じ一覧取得を2つの経路で {RUNS} 回ずつ実行して中央値を出します。
        <br />いまの設定：{dbGatewayEnabled ? "出入り口を経由する" : "公開キーで直結する（出入り口はまだ未設定）"}
      </div>

      <button style={{ ...solidBtn(), marginBottom: 14 }} onClick={run} disabled={busy || !uid}>
        {busy ? "計測中…" : "計測する"}
      </button>

      <ResultRow
        label="出入り口を経由"
        note="画面 → 自分のアプリのサーバー → Supabase"
        result={gateway}
      />
      <ResultRow
        label="公開キーで直結"
        note="閉じたあとは失敗するのが正常です（公開キーで届かなくなった証拠）"
        result={direct}
      />

      {diff !== null && (
        <div style={{ ...card, padding: 12, background: T.surface }}>
          <div style={lb10}>差（経由 − 直結）</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{diff >= 0 ? `+${diff}` : diff} ミリ秒</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
            サーバーを1回はさむぶんの増加分です。
          </div>
        </div>
      )}
    </div>
  );
}
