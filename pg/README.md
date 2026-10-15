# 自建 PostgreSQL 部署手册（Docker · PC 常驻 · Mac 可访问）

> 目标：PC 用 Docker 跑一个标准 PostgreSQL，把 5432 暴露到局域网，Mac 上的开发环境直接连它。
> 只占 **5432**（数据库）和 **8081**（网页管理台），与 Gitea 3080 / Jenkins 8080 / loono5 3000-3001 都不冲突。

---

## 一、PC 上操作

### 1. 拷贝配置

把 `pg-stack/` 整个目录放到 PC 上（建议 `C:\dev\pg-stack`），然后：

```powershell
cd C:\dev\pg-stack
Copy-Item .env.example .env
notepad .env          # 改掉 POSTGRES_PASSWORD
```

### 2. 启动

```powershell
docker compose up -d --wait
docker compose ps     # postgres 应显示 Up (healthy)
docker compose logs -f postgres   # 看到 "database system is ready to accept connections" 即成功
```

### 3. 验证数据真的持久化（唯一一次必须做的检查）

```powershell
docker exec postgres psql -U loono -d loono -c "SELECT id FROM persist_check;"
docker restart postgres
docker exec postgres psql -U loono -d loono -c "SELECT id FROM persist_check;"
```

两次都能查到 `42`，说明数据卷挂对了。查不到就是卷没配好——**这时候还没有真实数据，是发现问题的最佳时机**。

### 4. 放行 Windows 防火墙（只在局域网暴露）

```powershell
# 仅限专用网络 + 仅限本机网段，比直接全开安全得多
New-NetFirewallRule -DisplayName "PostgreSQL 5432 (LAN)" `
  -Direction Inbound -Protocol TCP -LocalPort 5432 `
  -Action Allow -Profile Private -RemoteAddress LocalSubnet
```

查看 PC 的局域网 IP：

```powershell
ipconfig | Select-String "IPv4"
```

---

## 二、Mac 上连接

Mac **不需要装 PostgreSQL**，客户端连过去即可。三个入口：

| 用途 | 地址 |
|---|---|
| 连接串（应用 / 迁移用） | `postgresql://loono:<密码>@<PC_IP>:5432/loono` |
| 命令行 psql | `psql "postgresql://loono:<密码>@<PC_IP>:5432/loono"` |
| 浏览器管理台 | `http://<PC_IP>:8081` |

Mac 上如果没装 `psql`，最省事的是 `brew install libpq`（不装整个 server），或直接用 GUI 客户端（TablePlus / DBeaver，填上面的连接串）。

连通性排查顺序：先 `ping <PC_IP>` → 再 `nc -vz <PC_IP> 5432`（不通就是防火墙）→ 最后才是凭据问题。

loono5 接入时（`.env.local`）：

```bash
DATABASE_URL=postgresql://loono:<密码>@<PC_IP>:5432/loono
```

---

## 三、日常运维

```powershell
# 进容器里的 psql（免密，走 unix socket）
docker exec -it postgres psql -U loono -d loono

# 备份（自定义格式，可选择性恢复）
docker exec postgres pg_dump -U loono -d loono -Fc -f /tmp/loono.dump
docker cp postgres:/tmp/loono.dump .\backup\loono-$(Get-Date -Format yyyyMMdd).dump

# 恢复
docker exec -i postgres pg_restore -U loono -d loono --clean --if-exists < .\backup\loono.dump

# 看当前连接数与慢查询
docker exec postgres psql -U loono -d loono -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
docker exec postgres psql -U loono -d loono -c "SELECT round(total_exec_time) ms, calls, left(query,80) FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;"

# 改密码（改 .env 是没用的，数据卷已存在）
docker exec -it postgres psql -U loono -d loono -c "ALTER USER loono WITH PASSWORD '新密码';"

# 停止 / 彻底删除（含数据，慎用）
docker compose down
docker compose down -v      # -v 会删掉数据卷
```

---

## 四、必须知道的五个坑

1. **PG 18 的数据卷路径变了**。18 及以上要挂 `/var/lib/postgresql`（父目录），旧教程写的 `/var/lib/postgresql/data` 会让容器**直接启动失败**并存不进数据；17 及以下反过来，必须挂 `/var/lib/postgresql/data`。配置里已按 18 写对，将来升级大版本时记得再确认一次。
2. **环境变量只在首次初始化生效**。`POSTGRES_USER` / `POSTGRES_DB` / `POSTGRES_PASSWORD` 在数据卷非空时全部无效，改密码必须用 `ALTER USER`。
3. **`POSTGRES_DB` 默认等于 `POSTGRES_USER`**，不是 `postgres`。这里两边都设成了 `loono`，所以库里有一个 `loono` 数据库；不要以为还有同名 `postgres` 库可连。
4. **连接数**。`max_connections=200` 是给容器内的；Next.js 开了连接池后容易忘记释放，一旦顶满会报 `too many clients already`。判断标准是 `pg_stat_activity` 里 idle 连接数长期偏高——真出现就该在应用侧上连接池（PgBouncer 或 `pg` 的池化配置），别靠继续调大 `max_connections`。
5. **绝不要把这个 5432 暴露到公网**。它没有 TLS、没有失败锁定，公网扫描器几分钟就能找到。要远程访问就上 Tailscale 或 WireGuard，而不是开端口转发。

---

## 五、将来要扩展时的两个换法

| 需求 | 换法 |
|---|---|
| 要 **pgvector**（画像/兴趣向量匹配） | 镜像换成 `pgvector/pgvector:pg18`，其余配置不动（官方 postgres 镜像**不含** pgvector） |
| 要 **pg_cron / pgmq / pg_net** 等 60+ 预装扩展 | 镜像换成 `supabase/postgres`（注意它只发四位版本号 tag，且默认 `listen_addresses` 有坑） |

换镜像前务必先 dump 备份；数据目录格式跨镜像可能不兼容，最稳的做法是新容器 + `pg_restore`。
