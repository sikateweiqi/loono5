/**
 * 极小的 .env 加载器。
 *
 * Next.js 会自动读取 `.env.local`，但 `node scripts/*.mjs` 不会，
 * 而为了这一个功能再装 dotenv 不划算。这里只处理我们实际会写的形式：
 *   KEY=value、可选的引号、# 开头的注释、空行。
 * 已存在的真实环境变量优先（便于 CI 里直接注入）。
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parse(contents) {
  const out = {};

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const eq = line.indexOf("=");

    if (eq === -1) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

/** 后加载的文件不覆盖已存在的键（.env.local 优先级最高）。 */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(root, file);

    if (!existsSync(path)) {
      continue;
    }

    const parsed = parse(readFileSync(path, "utf8"));

    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function databaseUrl() {
  loadEnv();

  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error(
      "缺少 DATABASE_URL。请在项目根目录的 .env.local 里设置，例如：\n" +
        "  DATABASE_URL=postgresql://loono:<密码>@192.168.31.37:5432/loono",
    );
    process.exit(1);
  }

  return url;
}

export { root };
