import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * 唯一的 PostgreSQL 连接池。
 *
 * `server-only` 是硬约束而不是注释：这个模块会读 DATABASE_URL，
 * 一旦被客户端组件 import，Next.js 会直接构建失败 —— 这正是我们要的，
 * 因为把连接串打进浏览器包等于把库钥匙交给访客。
 *
 * 为什么挂到 globalThis：dev 模式每次热重载都会重新求值模块，
 * 若每次 new Pool() 就会泄漏连接，直到顶满数据库的 max_connections
 * （当前 200）。生产构建里模块只求值一次，这层保护无害。
 */

const globalForPool = globalThis as unknown as {
  __loonoPgPool?: Pool;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "缺少 DATABASE_URL。请在 .env.local 里配置，例如 " +
        "postgresql://loono:<密码>@192.168.31.37:5432/loono",
    );
  }

  const pool = new Pool({
    connectionString,
    // 池子刻意开得不大：dev 下模块会反复求值，池子一多就先撞数据库的连接上限。
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // 查询超时兜底，避免一条慢 SQL 把连接池占死。
    statement_timeout: 15_000,
  });

  // 池子里的错误不该让进程崩掉：空闲连接被数据库掐断是正常现象。
  pool.on("error", (error) => {
    console.error("[db] idle client error", error.message);
  });

  return pool;
}

export function getPool(): Pool {
  if (!globalForPool.__loonoPgPool) {
    globalForPool.__loonoPgPool = createPool();
  }

  return globalForPool.__loonoPgPool;
}

/** 执行一条查询并返回行数组。 */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);

  return result.rows;
}

/** 查询并返回第一行，没有则 null。 */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);

  return rows[0] ?? null;
}

/**
 * 在一个事务里执行多条写入。
 *
 * 用同一个连接（`pool.connect()`）而不是 pool.query，否则每条语句会拿到
 * 不同连接、分属不同事务 —— 这是连接池最经典的坑。
 */
export async function transaction<T>(
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("begin");
    const result = await run(client);
    await client.query("commit");

    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
