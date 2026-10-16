import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 会员照片的落盘存储。
 *
 * 为什么先落文件系统而不是对象存储
 * ------------------------------
 * 生产选型里照片最终要进对象存储（只存 key + 签名 URL），但那需要一个
 * 已经存在的桶、一份密钥和一套上传凭证签发流程。原型阶段用文件系统能让
 * "点上传就有反应"这件事**今天就成立**，而且接口形状（返回一个 URL）与
 * 对象存储一致 —— 换过去只需要改这一个文件。
 *
 * 三条安全约定
 * ------------
 *   1. **文件名由服务端生成**（uuid + 按真实类型推断的扩展名），
 *      绝不采用客户端传来的文件名。用户上传的 `../.env` 这种名字
 *      是路径穿越最经典的载体。
 *   2. **类型按文件头判断**，不信 `Content-Type`。浏览器给的 MIME 是
 *      客户端可控的字符串，把 `.html` 改名成 `.jpg` 就能骗过它；
 *      而文件头是内容本身。这一步顺带挡住了"上传一个能被当作脚本执行的
 *      文件"这类存储型 XSS 的前置条件。
 *   3. 读取时**再次校验文件名形状**（严格正则）。写入路径安全不等于读取路径安全，
 *      两者是各自独立的入口。
 */

/** 单张照片上限 5MB。手机直出照片一般在 2–4MB，留一点余量。 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 允许的图片类型 → 落盘扩展名。 */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

/**
 * 存储根目录。
 *
 * 默认放在项目下的 `var/uploads`（已加进 .gitignore）而不是 `public/`：
 * standalone 构建时 `public/` 是**构建产物的一部分**，运行期往里写的东西
 * 在容器重建后就没了；而且由 route handler 读回时，我们能顺手控制
 * 缓存头与类型，不依赖 Next 的静态文件服务。
 */
export function uploadRoot(): string {
  const configured = process.env.UPLOAD_DIR?.trim();

  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), "var", "uploads");
}

/**
 * 文件头嗅探。
 *
 * 只覆盖我们允许的四种格式。返回 null 表示"这不是一张我们能收的图片"，
 * 与"是图片但格式不支持"在调用方那里是同一种结果 —— 都拒绝。
 */
export function sniffImageExtension(buffer: Buffer): string | null {
  if (buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: "RIFF" ____ "WEBP"
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  // AVIF: 前 4 字节是 box 长度，接着是 "ftyp"，品牌为 "avif" 或 "avis"
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") {
      return "avif";
    }
  }

  return null;
}

/** 落盘后的文件名形状。读与写都以它为准。 */
const STORED_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$/;

export function isStoredName(name: string): boolean {
  return STORED_NAME_PATTERN.test(name);
}

export type SaveImageResult =
  | { ok: true; name: string; url: string; mime: string; bytes: number }
  | { ok: false; error: "empty" | "tooLarge" | "unsupportedType" };

/**
 * 保存一张图片。
 *
 * 文件名用 uuid 而不是"时间戳+原名"：uuid 天然不可猜，所以别人拿到
 * 一个 URL 也无法枚举出其他会员的照片；同时它也避免了同名覆盖。
 */
export async function saveImage(file: File): Promise<SaveImageResult> {
  if (file.size === 0) {
    return { ok: false, error: "empty" };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "tooLarge" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = sniffImageExtension(bytes);

  if (!extension) {
    return { ok: false, error: "unsupportedType" };
  }

  const name = `${randomUUID()}.${extension}`;
  const root = uploadRoot();

  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, name), bytes);

  return {
    ok: true,
    name,
    url: `/api/uploads/${name}`,
    mime: MIME_BY_EXTENSION[extension],
    bytes: bytes.byteLength,
  };
}

export interface StoredImage {
  bytes: Buffer;
  mime: string;
}

/** 读回一张图片。文件名形状不对或文件不存在都返回 null。 */
export async function readImage(name: string): Promise<StoredImage | null> {
  if (!isStoredName(name)) {
    return null;
  }

  const extension = name.split(".").pop() ?? "";
  const mime = MIME_BY_EXTENSION[extension];

  if (!mime) {
    return null;
  }

  try {
    return { bytes: await readFile(path.join(uploadRoot(), name)), mime };
  } catch {
    // 文件被手工删掉、或磁盘挂了：对调用方来说与"没这张图"没有区别。
    return null;
  }
}
