import { supabase } from "shia2n-core";

/**
 * 原本ファイルの取り扱い（要件 v1.8 §F7）。
 * 保存先は Supabase Storage の swipe-files バケット。
 */

export const BUCKET    = "swipe-files";
export const MAX_BYTES = 10 * 1024 * 1024; // 10MB（§F7）

export const ACCEPT = ".pdf,.txt,.md,.markdown,.png,.jpg,.jpeg";

/** 拡張子とMIMEから、解析するかどうかと媒体を決める */
export function classifyFile(file) {
  const name = (file?.name ?? "").toLowerCase();
  const type = file?.type ?? "";

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return { kind: "pdf", parse: true, sourceType: "PDF" };
  }
  if (type.startsWith("text/") || /\.(txt|md|markdown)$/.test(name)) {
    return { kind: "text", parse: true, sourceType: "ノート" };
  }
  if (type.startsWith("image/") || /\.(png|jpe?g)$/.test(name)) {
    return { kind: "image", parse: false, sourceType: "その他" };
  }
  return { kind: "other", parse: false, sourceType: "その他" };
}

function extensionOf(name = "") {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "bin";
}

/**
 * 原本を保存して公開URLを返す。
 * @returns {Promise<{ok:boolean, file_url?:string, path?:string, reason?:string}>}
 */
export async function uploadFile(uid, file) {
  if (!file) return { ok: false, reason: "ファイルが選ばれていません" };
  if (file.size > MAX_BYTES) {
    return { ok: false, reason: `ファイルが大きすぎます（上限 10MB／このファイルは ${(file.size / 1024 / 1024).toFixed(1)}MB）` };
  }

  const path = `${uid}/${crypto.randomUUID()}.${extensionOf(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert:      false,
  });
  if (error) return { ok: false, reason: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, file_url: data.publicUrl, path };
}

/** 原本を消す。削除対象が無い場合は何もしない（要件 §F6） */
export async function removeFile(fileUrl) {
  if (!fileUrl) return { ok: true };
  const marker = `/${BUCKET}/`;
  const index  = fileUrl.indexOf(marker);
  if (index === -1) return { ok: true }; // このバケット以外のURLは触らない

  const path = decodeURIComponent(fileUrl.slice(index + marker.length));
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/**
 * 原本から本文を取り出す。失敗しても例外にしない（要件 §F7）。
 * @returns {Promise<{ok:boolean, body?:string, reason?:string}>}
 */
export async function parseFile(fileUrl, mediaType) {
  try {
    const res = await fetch("/api/file-parse", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ file_url: fileUrl, media_type: mediaType }),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
