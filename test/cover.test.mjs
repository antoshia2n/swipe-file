import { test } from "node:test";
import assert from "node:assert/strict";
import { pickXCover, xToken } from "../functions/api/cover.js";

test("ポストの画像の 1 枚目を 680px の版で返す", () => {
  const j = { __typename: "Tweet", mediaDetails: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/HXNualhaEAAvGQv.jpg" }] };
  assert.equal(pickXCover(j), "https://pbs.twimg.com/media/HXNualhaEAAvGQv.jpg?name=small");
});
test("画像の無いポストは空", () => {
  assert.equal(pickXCover({ __typename: "Tweet", text: "文字だけ" }), "");
});
test("動画は動画の表紙", () => {
  const j = { __typename: "Tweet", mediaDetails: [{ type: "video", media_url_https: "https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg" }] };
  assert.equal(pickXCover(j), "https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg");
});
test("消えたポストは空", () => {
  assert.equal(pickXCover({ __typename: "TweetTombstone" }), "");
});
test("鍵は英数字だけ", () => {
  assert.match(xToken("2122165017969869271"), /^[0-9a-z]+$/);
});
