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
  functions: ["sw_increment_ref"],
});
