/**
 * /api/db/* — データの出入り口の受け皿
 *
 * 判断（本人の確認・絞り込み・鍵の付け替え）は shia2n-core 側に集約してある。
 * このファイルは「このアプリが触ってよい表と関数」を渡すだけ。
 *
 * 正本：2026-07-30 決定「画面は公開キーでデータベースに直接触らない」
 */

import { createDbGateway } from "shia2n-core/server/db-gateway.js";
import { canUseSwipe } from "../../_lib/swipe-access.js";

// 使える人：SWIPE_ALLOW_UID（無ければ Naoki）に加えて、門番が swipe-file を開けると答えた人（2026-10-27 作業 58）
const NAOKI_UID = "VrMwzeSceqWeXVQOrm8kpu4uVR33";
let gw = null, gwKey = "";
export const onRequest = async context => {
  const allowUids = (context.env.SWIPE_ALLOW_UID ?? NAOKI_UID).split(",").map(s => s.trim()).filter(Boolean);
  const access = await canUseSwipe({ request: context.request, env: context.env, allowUids });
  if (access === "denied") return Response.json({ message: "この利用者にはスワイプくんを使う許可がありません。" }, { status: 403 });
  const gatewayUids = access === "allowed" ? [] : allowUids;
  const key = gatewayUids.join(",");
  if (!gw || gwKey !== key) { gw = makeGateway(gatewayUids); gwKey = key; }
  return gw(context);
};
const makeGateway = allowUids => createDbGateway({
  allowUids,
  basePath: "/api/db",
  tables: {
    sw_swipes:   { owner: "user_id" },
    sw_settings: { owner: "user_id" },  // フォルダ・表・ビュー・列・ラベルの値（1 人 1 行）
    sw_packs:    { owner: "user_id" },  // 素材パック（3便目・作業 27）
    sw_shares:   { owner: "user_id" },  // 共有ページ（3便目・作業 27）。生徒が見るのは /s/{token}（サーバーが鍵つきで読む）
  },
  functions: {
    // 参照回数の加算。送信内容の p_user_id を、サーバーで確定した本人の印で上書きする。
    sw_increment_ref: { owner: "p_user_id" },
  },
});
