/**
 * 真实姓名校验。
 *
 * 为什么是一个独立模块而不是写在 server action 里
 * --------------------------------------------
 * 与密码规则（`lib/auth/password.ts`）同一套理由：**规则必须只有一份**。
 * 客户端要在用户还在敲字时就给出提示（不然要等提交才知道格式不对），
 * 服务端要做最终裁决（前端校验永远可以绕过）。这个文件刻意**不带**
 * `server-only`，两端都能 import；带 `server-only` 的是数据层。
 *
 * 采集口径："真实姓名"，不是昵称。这条规则的分寸很难拿捏：
 * 太松等于没要求（`abc123` 也能过），太严会把正常名字挡在门外
 * （阿拉伯语姓名带连字符、越南语带多个空格、冰岛语带 ð/þ、藏语带间隔点）。
 * 所以这里只拦**明确不像人名**的输入，不试图判断"这是不是真名" ——
 * 真伪校验属于实名认证步骤（`/onboarding/kyc`）的职责。
 */

export const REAL_NAME_MIN_LENGTH = 2;
export const REAL_NAME_MAX_LENGTH = 40;

export type RealNameProblem =
  | "empty"
  | "tooShort"
  | "tooLong"
  | "hasDigit"
  | "hasSymbol"
  | "noLetter"
  | "tooManyWords";

/**
 * 名字里允许出现的非字母字符。
 *
 * - `\p{L}` 任何文字的字母（拉丁 / 中日韩 / 西里尔 / 阿拉伯 / 藏文……）
 * - `\p{M}` 组合记号（带声调的越南语、梵文标音等）
 * - 空白（下面会归一化并单独校验数量）
 * - `·` `・` 间隔点：维吾尔、哈萨克、藏族等姓名的常见分隔
 * - `-` `'` `’` `.` 双姓、姓氏前缀（O'Brien、van der、Al-Sayed）
 */
const ALLOWED_CHARS = /^[\p{L}\p{M}\s·・\-'’.]*$/u;

/**
 * 一个字符是不是字母或组合记号。
 *
 * 用 Unicode 属性转义而不是 `[A-Za-z]`：后者会把「张伟」「Айгүл」
 * 「أحمد」全部判成"没有字母"，等于只允许英文名 —— 对一个跨国平台
 * 来说这是致命的。
 */
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
const DIGIT = /\p{Nd}/u;

/**
 * 名字最多几个词。
 *
 * 这一条拦的是"把一整句话粘进姓名栏"，不是"名字太长"。所以阈值要给得
 * 足够宽：西班牙语「María de los Ángeles García」有 5 个词，
 * 荷兰语「Mary Jane van der Berg」也是 5 个 —— 卡在 4 会把它们全挡在门外，
 * 而那正是跨国场景下最不能出错的一类输入。
 *
 * 定 6 的依据：真实的复合姓名极少超过 5 个词，而一句话几乎必然超过 6 个
 * （且 40 字上限会先一步拦住长句）。真正把句子挡住的是长度，
 * 这一条只是补一道"词数离谱"的冗余防线。
 */
const MAX_WORDS = 6;

/**
 * 把输入整理成"准备入库"的样子：去首尾空白、把连续空白压成一个、
 * 去掉零宽字符（从网页复制粘贴时极常见，肉眼完全看不出来）。
 *
 * 客户端提交前与服务端接收后都调用它，所以库里存的一定是同一形态 ——
 * 否则 `Zhang  Wei` 与 `Zhang Wei` 会被当成两条不同的记录。
 */
export function normalizeRealName(value: string): string {
  return value
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 校验真实姓名。返回 `null` 表示通过，否则给出具体原因（供 i18n 映射）。
 *
 * 检查顺序即"用户最可能犯的错"的顺序：空 → 长度 → 数字 → 非法字符 →
 * 没有字母 → 词太多。数字排在非法字符前面，是因为 `abc123` 这种输入
 * 给一句"不能包含数字"远比"含有不允许的字符"有用。
 */
export function checkRealName(value: string): RealNameProblem | null {
  const name = normalizeRealName(value);

  if (name === "") {
    return "empty";
  }

  // 按码点计数：中文姓名一个字就是一个字符，用 .length 会因为
  // 代理对（生僻字、emoji）而把它们算成两个。
  const length = Array.from(name).length;

  if (length < REAL_NAME_MIN_LENGTH) {
    return "tooShort";
  }

  if (length > REAL_NAME_MAX_LENGTH) {
    return "tooLong";
  }

  if (DIGIT.test(name)) {
    return "hasDigit";
  }

  if (!ALLOWED_CHARS.test(name)) {
    return "hasSymbol";
  }

  if (!LETTER_OR_MARK.test(name)) {
    // 走到这里说明只剩分隔符，比如「-」「·」「'」。
    return "noLetter";
  }

  if (name.split(" ").length > MAX_WORDS) {
    return "tooManyWords";
  }

  return null;
}

/**
 * 姓名是否可以用于展示（与校验同义，读起来更顺的别名）。
 *
 * 展示场合需要注意：这个值会被插进目录卡片与聊天气泡。
 * React 默认转义 HTML，所以不存在注入问题；这里拦的是
 * "看起来不像人名"的输入，而不是安全边界。
 */
export function isPlausibleRealName(value: string): boolean {
  return checkRealName(value) === null;
}
