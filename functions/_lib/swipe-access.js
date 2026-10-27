import { verifyIdToken } from "shia2n-core/server/db-gateway.js";

const gateCache = new Map();
const CACHE_MS = 60_000;

export async function canUseSwipe({ request, env, allowUids = [], verify = verifyIdToken, fetchFn = fetch }) {
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return "no_token";
  try {
    const projectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
    const uid = await verify(token, projectId);
    if (allowUids.includes(uid)) return "allowed";
    const key = JSON.stringify([projectId, uid]);
    const cached = gateCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    gateCache.delete(key);

    const response = await fetchFn("https://shia2n-mcp.gameister1.workers.dev/gate/resolve", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return "denied";
    const body = await response.json();
    const result = body?.ok === true && Array.isArray(body.apps) && body.apps.includes("swipe-file")
      ? "allowed" : "denied";
    const now = Date.now();
    for (const [cacheKey, entry] of gateCache) {
      if (entry.expiresAt <= now) gateCache.delete(cacheKey);
    }
    gateCache.set(key, { result, expiresAt: now + CACHE_MS });
    return result;
  } catch {
    return "denied";
  }
}
