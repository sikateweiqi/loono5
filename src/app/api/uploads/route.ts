import { fail, ok } from "@/app/api/_lib/http";
import { getViewerProfile } from "@/lib/db/viewer";
import { MAX_UPLOAD_BYTES, saveImage } from "@/lib/uploads";

/**
 * POST /api/uploads — 上传一张会员照片。
 *
 * 与项目里其它写接口不同，这里是 **multipart/form-data** 而不是 JSON：
 * 图片是二进制，Base64 塞进 JSON 会白白放大 33%，而且要在内存里多走一遍编解码。
 *
 * 为什么要校验身份：这是一个会往磁盘写东西的公开端点。不校验的话，
 * 任何人都能把它当成免费图床，几小时就能把磁盘写满。
 * 判据与其它写接口一致 —— **解析出来的必须是一个真实会员**，
 * 浏览态账号（未登录时的种子展示账号）不算，上传属于写操作。
 *
 * 注意这里**不写数据库** —— 上传成功只返回 URL，由表单提交时一起落库。
 * 分成两步是因为用户可能在几张照片之间删删改改，
 * 每改一次就写一次库会让"取消"这个动作变得无法表达。
 */
export async function POST(request: Request) {
  const viewer = await getViewerProfile();

  if (!viewer || viewer.handle === "u_current") {
    return fail(401, "请先登录后再上传照片。");
  }

  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return fail(400, "请求格式不正确，请重新选择照片。");
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return fail(400, "没有收到文件。");
  }

  // 先按声明的大小快速拒绝：真正的大小检查在 saveImage 里按字节数再做一次，
  // 这一层只是让明显超限的请求不必把 5MB+ 读进内存。
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(413, "照片不能超过 5MB，请压缩后再试。");
  }

  const saved = await saveImage(file);

  if (!saved.ok) {
    switch (saved.error) {
      case "empty":
        return fail(400, "照片是空文件，请重新选择。");
      case "tooLarge":
        return fail(413, "照片不能超过 5MB，请压缩后再试。");
      case "unsupportedType":
        return fail(415, "只支持 JPG / PNG / WebP / AVIF 格式的图片。");
    }
  }

  return ok({ url: saved.url, name: saved.name, mime: saved.mime });
}
