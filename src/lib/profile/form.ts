/**
 * 表单字段解析：把 `FormData` 里的字符串收敛到服务端认可的取值。
 *
 * 为什么单独成模块（而不是留在 `lib/profile/actions.ts` 里）
 * -----------------------------------------------------
 * 那个文件带 `"use server"`，意味着**每一个导出都会被当成可被客户端
 * 远程调用的端点**。往里塞纯函数有两个坏处：一是导出常量/辅助函数会让
 * 构建直接失败（`"use server"` 只允许 async 函数），二是这个文件会越来越长，
 * 而"哪些是端点、哪些只是内部工具"变得看不出来。
 *
 * 本工程既有的约定就是把纯逻辑分出去：`lib/auth/password.ts`（规则）
 * 与 `lib/auth/password-hash.ts`（存储）、`lib/profile/age.ts`、
 * `lib/profile/name.ts`、`lib/geo.ts` 都是这个形状。
 * 分出来还有个直接好处：它们可以在没有 Next.js 运行时的环境里被测试。
 */

/** 读一个文本字段：去首尾空白并截断到上限。 */
export function readText(
  formData: FormData,
  key: string,
  maxLength: number,
): string {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, maxLength);
}

/**
 * 读一个单值字段，只接受白名单里的取值。
 *
 * 不认识的值返回 `null`（即"没填"）而不是原样保留：这些字段最终会落进
 * `profile_attributes` 的裸 `text` 列（没有 check 约束），
 * 若不在这一层把住，任何人都能给自己的学历塞进任意字符串 ——
 * 而展示层拿到不认识的值会渲染成空白或 key 原文。
 */
export function readChoice<T extends string>(
  formData: FormData,
  key: string,
  allowed: readonly T[],
): T | null {
  const value = String(formData.get(key) ?? "").trim();

  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** 读一个多值字段：逐个过白名单，并去重（同一标签点两次不该存两条）。 */
export function readChoiceList<T extends string>(
  formData: FormData,
  key: string,
  allowed: readonly T[],
): T[] {
  const values = formData.getAll(key).map((value) => String(value).trim());

  return values
    .filter((value): value is T =>
      (allowed as readonly string[]).includes(value),
    )
    .filter((value, index, all) => all.indexOf(value) === index);
}

/**
 * 读一个整数字段并校验区间。
 *
 * 越界的值返回 `null` 而不是夹到边界：身高栏里出现 300 说明这是脏数据
 * 或者被改过的表单，悄悄存成"250"会让用户以为填对了。
 * 返回 `null` 等于"没填"，用户可以再改一次。
 */
export function readInteger(
  formData: FormData,
  key: string,
  min: number,
  max: number,
): number | null {
  const raw = String(formData.get(key) ?? "").trim();

  if (raw === "") {
    return null;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) {
    return null;
  }

  return value;
}

/**
 * 照片 URL 只接受本站上传接口产出的形状。
 *
 * 这不是多此一举：`photo_urls` 会被渲染成 `<img src>`。如果直接信任表单里的值，
 * 任何人都能往这个字段塞一个站外 URL（把别人的资料页变成追踪像素）
 * 或者 `javascript:` 开头的串。校验放在服务端，因为前端校验永远可以绕过。
 */
export const UPLOAD_URL_PATTERN =
  /^\/api\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$/;

/**
 * 读取照片 URL 列表：去重、限长、逐个验形状。
 *
 * 去重是必要的：同一张照片被提交两次会让"第几张是主图"变得不确定。
 */
export function readPhotoUrls(
  formData: FormData,
  key: string,
  max: number,
): { urls: string[]; invalid: boolean } {
  const urls = formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, max);

  return {
    urls,
    invalid: !urls.every((url) => UPLOAD_URL_PATTERN.test(url)),
  };
}
