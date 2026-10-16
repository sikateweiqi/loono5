import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * 密码哈希：scrypt（Node 内置），不引第三方库。
 *
 * 为什么是 scrypt 而不是 bcrypt/argon2
 * -----------------------------------
 *   * bcrypt 有 72 字节截断的坑，且需要原生编译 —— 这个项目在 Jenkins 里
 *     构建镜像，多一个原生依赖就多一处可能编不过的地方。
 *   * argon2 目前是首选，但 Node 内置没有，同样要原生模块。
 *   * scrypt 是**内存硬**的（攻击者要并行爆破必须付出同样的内存成本），
 *     参数在 OWASP 的推荐范围内，且 `node:crypto` 自带，零依赖。
 *
 * 参数 16384/8/1 是 OWASP 对交互式登录的建议下限，约 16MB 内存、几十毫秒。
 * 调高会更安全，但登录是用户按一次按钮等一次的操作，超过 200ms 就开始被感知。
 *
 * 存储格式 `scrypt$N$r$p$salt$hash`
 * -------------------------------
 * 参数与盐都写在串里，所以将来调参或换算法时，老密码照样能验；
 * 单列自描述也避免了"盐列还在、哈希列被清空"这种拦不住的坏状态。
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/** scrypt 在 N=16384/r=8 下需要约 16MB；显式给足，免得撞上默认的 maxmem。 */
const MAX_MEM = 64 * 1024 * 1024;

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);

  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * 校验密码。
 *
 * `stored` 为 null / 空表示这个账号**没有设置密码**（0006 之前用验证码
 * 注册的账号，以及全部种子数据），此时返回 false，由调用方区分"没设密码"
 * 与"密码错误"两种提示 —— 把前者说成后者，用户会一直试一直失败。
 *
 * 任何解析失败都返回 false 而不是抛异常：库里出现一个格式不对的串是
 * 运维问题，不该让登录接口 500。
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) {
    return false;
  }

  const parts = stored.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    N <= 0 ||
    r <= 0 ||
    p <= 0
  ) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;

  try {
    salt = Buffer.from(rawSalt, "base64");
    expected = Buffer.from(rawHash, "base64");
  } catch {
    return false;
  }

  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  let actual: Buffer;

  try {
    actual = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      // 按串里的参数复原内存上限：改过参数的账号（比如将来把 N 提到 32768）
      // 仍然能验，否则会以"密码错误"的面目失败。
      maxmem: Math.max(MAX_MEM, 128 * N * r * 2),
    });
  } catch {
    return false;
  }

  // 定长比较：长度不同时 timingSafeEqual 会抛，所以先挡一道。
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
