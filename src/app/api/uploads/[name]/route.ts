import { fail } from "@/app/api/_lib/http";
import { readImage } from "@/lib/uploads";

/**
 * GET /api/uploads/[name] — 读回一张照片。
 *
 * 为什么用 route handler 而不是把文件放进 `public/`：
 *   * standalone 构建的产物里，`public/` 是构建期快照，运行期写进去的文件
 *     在容器重建后就没了；
 *   * 这里可以显式给出缓存头。文件名是 uuid，内容永不改变，
 *     所以可以放心标成 immutable —— 头像这种高频资源省下的往返很可观。
 *
 * 安全：`readImage` 内部用严格正则校验文件名形状，
 * 路径穿越（`../`、绝对路径、非法扩展名）在进到 fs 之前就被挡掉。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const image = await readImage(decodeURIComponent(name));

  if (!image) {
    return fail(404, "图片不存在。");
  }

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.mime,
      "content-length": String(image.bytes.byteLength),
      // 文件名是随机 uuid，同一个 URL 的内容不会变，所以可以长期缓存。
      "cache-control": "public, max-age=31536000, immutable",
      // 明确禁止浏览器把未知类型猜成可执行内容。
      "x-content-type-options": "nosniff",
    },
  });
}
