/**
 * /api/db/* — データの出入り口の受け皿
 *
 * 判断（本人の確認・絞り込み・鍵の付け替え）は shia2n-core 側に集約してある。
 * このファイルは「このアプリが触ってよい表と関数」を渡すだけ。
 *
 * 正本：2026-07-30 決定「画面は公開キーでデータベースに直接触らない」
 */

import { createDbGateway } from "shia2n-core/server/db-gateway.js";

export const onRequest = createDbGateway({
  basePath: "/api/db",
  tables: {
    sw_swipes:       { owner: "user_id" },
    sw_zeus_orphans: { owner: "user_id" },
  },
  functions: {
    // 参照回数の加算。送信内容の p_user_id を、サーバーで確定した本人の印で上書きする。
    // 関数の側（sql/08_increment_ref_owner.sql）も、その印と一致する行だけを対象にしている。
    sw_increment_ref: { owner: "p_user_id" },
  },
});
