-- ============================================================================
-- 微信读书数据应用 · Supabase Schema
-- ----------------------------------------------------------------------------
-- 用法：Supabase Dashboard → SQL Editor → 新建查询 → 整段粘贴执行
-- 幂等：全部使用 if not exists / create or replace，可重复执行
--
-- 设计原则
--   1. 每张业务表都有「业务唯一键」（book_id / bookmark_id / review_id），
--      配合 upsert 让同步天然幂等：重跑、中断、并发都不会产生重复数据。
--   2. 读权限走白名单 + RLS；写权限完全不开放给匿名/登录用户，
--      只有服务端函数的 service_role 能写（service_role 会绕过 RLS）。
-- ============================================================================

-- ── 书籍主表 ────────────────────────────────────────────────────────────────
-- note_count / review_count / bookmark_count / sort 是增量同步的判据：
-- 这几个值没变，就不必逐本详拉。
create table if not exists public.wr_books (
  book_id           text primary key,
  title             text not null,
  author            text,
  translator        text,
  category          text,
  publisher         text,
  isbn              text,
  publish_time      text,
  word_count        integer default 0,
  intro             text,
  rating            numeric default 0,
  rating_count      integer default 0,
  cover_url         text,
  reader_link       text,
  deep_link         text,
  reading_progress  numeric default 0,
  reading_time      integer default 0,
  tts_time          integer default 0,
  start_reading_time bigint default 0,
  finish_time       bigint default 0,
  last_note_time    bigint default 0,
  note_count        integer default 0,
  review_count      integer default 0,
  bookmark_count    integer default 0,
  last_synced_at    timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

comment on table public.wr_books is '微信读书书籍主表；note_count 等计数列是增量同步的判据';

-- cover_url      = 已镜像到 Supabase Storage 的公开地址（页面直接用这个）
-- cover_source_url = 微信读书 CDN 的原始地址（用来判断源图有没有变，需不需要重新镜像）
alter table public.wr_books add column if not exists cover_source_url text;
alter table public.wr_books add column if not exists cover_mirrored_at timestamptz;

-- ── 划线 ────────────────────────────────────────────────────────────────────
create table if not exists public.wr_highlights (
  bookmark_id   text primary key,
  book_id       text not null references public.wr_books(book_id) on delete cascade,
  chapter_uid   bigint,
  chapter_title text,
  mark_text     text,
  create_time   bigint,
  synced_at     timestamptz default now()
);
create index if not exists wr_highlights_book_idx on public.wr_highlights (book_id);
create index if not exists wr_highlights_time_idx on public.wr_highlights (book_id, create_time desc);

-- ── 想法与点评 ──────────────────────────────────────────────────────────────
create table if not exists public.wr_reviews (
  review_id     text primary key,
  book_id       text not null references public.wr_books(book_id) on delete cascade,
  chapter_uid   bigint,
  chapter_title text,
  content       text,
  abstract      text,
  star          integer,
  create_time   bigint,
  synced_at     timestamptz default now()
);
create index if not exists wr_reviews_book_idx on public.wr_reviews (book_id);
create index if not exists wr_reviews_time_idx on public.wr_reviews (book_id, create_time desc);

-- ── 阅读统计快照 ────────────────────────────────────────────────────────────
-- payload 用 jsonb 兜住接口结构变动，避免第三方字段调整就要改表。
create table if not exists public.wr_stats (
  id         bigserial primary key,
  mode       text not null,
  base_time  bigint not null default 0,
  payload    jsonb not null,
  synced_at  timestamptz default now(),
  unique (mode, base_time)
);
comment on table public.wr_stats is '阅读统计快照；mode=overall/yearly，payload 为精简后的前端可用结构';

-- ── AI 分析结果 ─────────────────────────────────────────────────────────────
-- highlight_count_at_gen 是"水位线"：划线条数未变的书不重算，
-- 这是控制大模型调用成本的关键。
create table if not exists public.wr_analysis (
  book_id                 text primary key references public.wr_books(book_id) on delete cascade,
  harvest                 text,
  remember                text[] default '{}',
  preference              text,
  keywords                text[] default '{}',
  model                   text,
  highlight_count_at_gen  integer default 0,
  generated_at            timestamptz default now()
);

-- 兼容早期版本：remember 曾是 text（换行拼接）。若检测到就原地升级为 text[]，
-- 避免已建过表的库需要手工改结构。
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wr_analysis'
      and column_name = 'remember'
      and data_type = 'text'
  ) then
    alter table public.wr_analysis
      alter column remember type text[]
      using case
        when remember is null or remember = '' then '{}'::text[]
        else string_to_array(remember, E'\n')
      end;
  end if;
end $$;

-- ── 同步任务日志 ────────────────────────────────────────────────────────────
-- 分批同步的进度真相来源：pending_book_ids 是待处理队列，
-- pending 为空即任务完成。任务因此天然可重入。
create table if not exists public.wr_sync_log (
  task_id          uuid primary key default gen_random_uuid(),
  trigger_source   text not null default 'manual',
  status           text not null default 'running',
  books_total      integer default 0,
  books_changed    integer default 0,
  pending_book_ids text[] default '{}',
  failed_book_ids  text[] default '{}',
  notes_total      integer default 0,
  error            text,
  started_at       timestamptz default now(),
  finished_at      timestamptz
);
create index if not exists wr_sync_log_started_idx on public.wr_sync_log (started_at desc);

-- ── 访问白名单 ──────────────────────────────────────────────────────────────
-- 单用户应用：只有登记在册的 user_id 能读数据。
-- 本表自身开启 RLS 且不建任何策略 → 任何客户端都读不到（只有下面的
-- security definer 函数能绕过）。
create table if not exists public.wr_allowlist (
  user_id    uuid primary key,
  note       text,
  created_at timestamptz default now()
);

-- ============================================================================
-- RLS 与策略
-- ============================================================================

create or replace function public.wr_can_read()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wr_allowlist a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.wr_can_read() from public;
grant execute on function public.wr_can_read() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'wr_books', 'wr_highlights', 'wr_reviews', 'wr_stats', 'wr_analysis', 'wr_sync_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    -- 读：仅白名单用户
    execute format('drop policy if exists %I on public.%I', t || '_read_allowlist', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.wr_can_read())',
      t || '_read_allowlist', t
    );
  end loop;
end $$;

-- wr_allowlist 只开 RLS，不给任何策略 → 客户端无法读写
alter table public.wr_allowlist enable row level security;

-- ============================================================================
-- 封面存储（Supabase Storage）
-- ----------------------------------------------------------------------------
-- 为什么做成 public bucket：
--   封面原图本来就公开挂在微信读书 CDN 上（任何人拿到 URL 都能下），
--   所以"把同一张图搬到自己的 bucket"并没有新增任何暴露面。
--   它换来的是：页面不再依赖第三方 CDN 的可用性 / 防盗链策略。
--
-- 写入：只有服务端函数的 service_role 能上传（service_role 绕过 storage 的 RLS），
--       客户端拿不到任何写策略，因此不需要额外配置。
-- 读取：public bucket 走 /storage/v1/object/public/... 由网关直接放行，
--       不经过 RLS 判定，所以也不用建 select 策略。
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('wr-covers', 'wr-covers', true)
on conflict (id) do update set public = true;

-- 单文件最大 5 MB —— 封面正常只有几十 KB，设上限是防止异常大文件拖垮函数
update storage.buckets set file_size_limit = 5242880 where id = 'wr-covers';

-- ============================================================================
-- 使用说明
-- ----------------------------------------------------------------------------
-- 1. 建完表后，先在 Authentication → Users 里给自己创建一个账号
--    （或走邮箱魔法链接登录一次），然后复制该用户的 UID，执行：
--
--      insert into public.wr_allowlist (user_id, note)
--      values ('你的-user-uid', 'Truck')
--      on conflict (user_id) do nothing;
--
--    并把同一个 UID 填进环境变量 ALLOWED_USER_ID，形成双重校验。
--
-- 2. 关闭公开注册：Authentication → Providers → Email
--    把 "Enable sign up" 关掉，避免陌生人自助注册。
--
-- 3. 写入只走服务端函数（service_role 绕过 RLS），
--    所以这里不需要、也不应该给 authenticated 开 insert/update 策略。
-- ============================================================================
