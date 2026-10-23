/**
 * ファイルの置き場の出入り口（受け皿）。判断はすべて shia2n-core の storage-gateway に集約されている。
 * 置けるのは入れ物 swipe-files の shots/ の下だけ・画像と PDF だけ・50MB まで（入れ物の上限と同じ・作業 26）。
 * 使える人は SWIPE_ALLOW_UID（カンマ区切り）。未設定なら Naoki 1 人。
 * 見るときはこの口を通らない（入れ物は公開。名前はサーバーが決める推測できない名前）。
 */
import { createStorageGateway } from "shia2n-core/server/storage-gateway.js";

const NAOKI_UID = "VrMwzeSceqWeXVQOrm8kpu4uVR33";

const BUCKETS = {
  "swipe-files": {
    prefix: "shots/",
    maxBytes: 50 * 1024 * 1024, // 入れ物の上限と同じ（作業 26 で 50MB）
    extensions: ["jpg", "jpeg", "png", "webp", "gif", "pdf"],
    contentTypePrefix: "", // 画像と PDF の両方を通すため種類の頭では絞らない（拡張子で絞る）
  },
};

export async function onRequest(context) {
  const allowUids = (context.env.SWIPE_ALLOW_UID ?? NAOKI_UID)
    .split(",").map(s => s.trim()).filter(Boolean);
  const handler = createStorageGateway({ buckets: BUCKETS, allowUids });
  return handler(context);
}
