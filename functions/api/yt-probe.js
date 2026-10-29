// 一時：Cloudflare から YouTube の字幕が読めるかを確かめるだけ（main には入れない）
import { readTranscript } from "../_lib/yt-transcript.js";
export async function onRequestGet({ request }) {
  const id = new URL(request.url).searchParams.get("v") || "";
  const r = await readTranscript(id);
  return new Response(JSON.stringify({ ...r, lines: r.lines.slice(0, 3), n: r.lines.length }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
