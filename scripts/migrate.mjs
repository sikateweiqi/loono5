/**
 * 应用迁移：按文件名顺序执行 db/migrations/*.sql，已执行过的跳过。
 *
 *   node scripts/migrate.mjs            # 应用到 DATABASE_URL 指向的库
 *   node scripts/migrate.mjs --dry-run  # 只列出将要执行的迁移
 *
 * 每个文件在一个事务里执行：SQL 报错则整体回滚，不会留下半截 schema。
 * 迁移文件本身写成幂等形式（create ... if not exists），所以重复执行也安全；
 * 记录表只是为了避免无谓的重跑和让"当前版本"可查。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

import { databaseUrl, root } from "./load-env.mjs";

const migrationsDir = join(root, "db", "migrations");
const dryRun = process.argv.includes("--dry-run");

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const client = new pg.Client({ connectionString: databaseUrl() });

await client.connect();

await client.query(`
  create table if not exists public._migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  )
`);

const { rows } = await client.query("select name from public._migrations");
const applied = new Set(rows.map((row) => row.name));

let count = 0;

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip    ${file}`);
    continue;
  }

  if (dryRun) {
    console.log(`pending ${file}`);
    continue;
  }

  const sql = readFileSync(join(migrationsDir, file), "utf8");

  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into public._migrations (name) values ($1)", [
      file,
    ]);
    await client.query("commit");
    console.log(`applied ${file}`);
    count += 1;
  } catch (error) {
    await client.query("rollback");
    console.error(`\n迁移失败：${file}\n${error.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(
  dryRun
    ? "\n以上是将要执行的迁移（dry-run，未改动数据库）。"
    : `\n完成，本次应用 ${count} 个迁移。`,
);

await client.end();
