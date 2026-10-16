/**
 * 封面镜像（服务端）
 *
 * 为什么要把封面搬到自己的 Storage：
 *   页面上如果直接引用微信读书 CDN 的封面地址，就永远受制于对方的可用性、
 *   防盗链策略与 referer 校验。镜像一份之后，页面只依赖自己的 Storage。
 *
 * 幂等策略：对象名固定为 `<book_id>.<ext>`，上传时 upsert:true ——
 * 同一本书重复镜像只会覆盖同一个对象，不会累积垃圾文件。
 *
 * 失败不致命：调用方（syncOneBook）对镜像失败是 try/catch 兜底的 ——
 * 封面拉不到不该连带整本书的划线同步一起失败。
 */

import { admin } from "./supabaseAdmin";

const BUCKET = "wr-covers";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024; // 与 schema.sql 里的 file_size_limit 保持一致

/** 只放行常见图片扩展名，其余一律按 jpg 处理，避免把奇怪的后缀写进对象名 */
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp"]);

function storagePublicPrefix(): string {
  const base = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/`;
}

/** 这个地址是不是已经是我们自己 Storage 上的了 */
export function isMirrored(url: string | null | undefined): boolean {
  if (!url) return false;
  const prefix = storagePublicPrefix();
  return prefix.length > BUCKET.length && url.startsWith(prefix);
}

function pickExt(sourceUrl: string): string {
  try {
    const path = new URL(sourceUrl).pathname;
    const raw = path.split(".").pop()?.toLowerCase() ?? "";
    const ext = raw.replace(/[^a-z0-9]/g, "");
    return ALLOWED_EXT.has(ext) ? ext : "jpg";
  } catch {
    return "jpg";
  }
}

function pickContentType(headerValue: string | null, ext: string): string {
  const ct = (headerValue ?? "").split(";")[0].trim().toLowerCase();
  if (ct.startsWith("image/")) return ct;
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  return "image/jpeg";
}

type Downloaded = { bytes: ArrayBuffer; contentType: string; ext: string };

/** 下载源图；失败即抛错，由调用方决定兜底方式 */
async function download(sourceUrl: string): Promise<Downloaded> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      // 有些图床会看 referer，带上更容易拿到图（拿不到也不影响，失败由调用方兜底）
      headers: { Referer: "https://weread.qq.com/" },
    });
    if (!res.ok) throw new Error(`下载封面失败 HTTP ${res.status}`);

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new Error(`封面过大（${declared} 字节），跳过镜像`);

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) throw new Error("封面内容为空");
    if (bytes.byteLength > MAX_BYTES) throw new Error("封面过大，跳过镜像");

    const ext = pickExt(sourceUrl);
    return { bytes, contentType: pickContentType(res.headers.get("content-type"), ext), ext };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 下载源图并上传到 Storage，返回公开可访问的 URL。
 *
 * @param currentUrl 库里现有的 cover_url。已是 Storage 地址且未强制刷新时直接复用。
 */
export async function mirrorCover(
  bookId: string,
  sourceUrl: string,
  opts: { force?: boolean; currentUrl?: string | null } = {},
): Promise<string> {
  if (!opts.force && isMirrored(opts.currentUrl)) {
    return opts.currentUrl as string;
  }

  const { bytes, contentType, ext } = await download(sourceUrl);
  const objectPath = `${bookId}.${ext}`;
  const db = admin();

  const { error: upErr } = await db.storage.from(BUCKET).upload(objectPath, bytes, {
    contentType,
    upsert: true, // 同名覆盖 → 天然幂等
    cacheControl: "31536000", // 一年，封面基本不变
  });
  if (upErr) throw new Error(`上传封面失败：${upErr.message}`);

  const { data } = db.storage.from(BUCKET).getPublicUrl(objectPath);
  if (!data?.publicUrl) throw new Error("无法生成封面公开地址");
  return data.publicUrl;
}
