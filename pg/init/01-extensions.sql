-- 首次启动（数据卷为空）时自动执行一次。
-- 这些扩展都随官方 postgres 镜像的 contrib 一起提供，无需额外安装。

-- 慢查询统计：配合 docker-compose.yml 里的 shared_preload_libraries
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 模糊搜索 / 拼写容错：以后按昵称、城市搜索会员用得上
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 去重音、忽略大小写比较（多语言姓名的排序与比较）
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS citext;

-- UUID 主键
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 建一个演示 schema，方便验证权限与连接是否正常；真实表放 public 或自建 schema
CREATE SCHEMA IF NOT EXISTS loono AUTHORIZATION loono;

-- 验证用：写入后重启容器再查一次，确认数据卷真的挂对了
CREATE TABLE IF NOT EXISTS public.persist_check (
  id         integer PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.persist_check (id) VALUES (42) ON CONFLICT DO NOTHING;
