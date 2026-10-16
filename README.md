# 我的阅读工作台 · 微信读书数据应用

把微信读书的书架、划线、想法、阅读统计同步到自己的 Supabase，用一个自托管的 Web 应用随时查看。
支持增量同步：只拉「笔记计数有变化」的书。

技术栈按 `family-meal-planner` 的约定来：**Vite + React 18 + TypeScript + Tailwind + Supabase + Vercel Serverless Functions**。

---

## 为什么必须有服务端

微信读书网关的 CORS 是硬编码的：

```
access-control-allow-origin: https://weread.qq.com
```

且不返回 `access-control-allow-methods` / `allow-headers`。**任何其他来源的浏览器请求都会在预检阶段被拦掉**，
所以浏览器不能直连，必须由 `api/` 下的服务端函数中转。CORS 不是优化项，是必要条件。

Supabase 解决的是另一个问题：微信读书没有批量导出接口，只能逐本拉（15 本约 60+ 次请求）。
有了持久化，才能先比对计数、只拉有变化的书，把同步从「分钟级」压到「秒级」。

---

## 目录结构

```
weichatReading/
├── api/                         Vercel Serverless Functions（服务端）
│   ├── _lib/                    下划线开头，不会被当成接口
│   │   ├── analysis.ts          AI 分析引擎：水位线判重 + 提示词 + 写库
│   │   ├── auth.ts              身份校验（Supabase token + ALLOWED_USER_ID 双重把关）
│   │   ├── covers.ts            封面镜像：下载 CDN 原图 → 上传 Supabase Storage
│   │   ├── http.ts              统一响应与错误格式
│   │   ├── llm.ts               OpenAI 兼容接口客户端（自带 json 模式降级重试）
│   │   ├── supabaseAdmin.ts     service_role 客户端（仅服务端）
│   │   ├── sync.ts              同步引擎：增量判定 / 幂等入库 / 统计清洗 / 封面镜像
│   │   └── weread.ts            微信读书网关客户端（字段名按实测映射）
│   ├── analysis/run.ts          AI 分析入口（逐本限流，前端循环驱动）
│   ├── covers/backfill.ts       封面补齐入口（独立通道，见下文说明）
│   └── sync/
│       ├── start.ts             建任务：拉书目 → 算变化集 → 返回 task_id
│       ├── batch.ts             处理一批书，推进队列
│       └── status.ts            查询进度与历史
├── supabase/schema.sql          建表 + 索引 + RLS（整段粘进 SQL Editor 执行）
├── src/                         前端
│   ├── hooks/useAuth.ts         会话管理
│   ├── hooks/useSync.ts         同步编排（start → 循环 batch → 汇总）
│   ├── lib/                     supabase 客户端 / 请求封装 / 类型 / 格式化
│   └── pages/                   登录 / 概览 / 书架 / 单本详情 / 同步
└── vercel.json                  函数执行时限配置
```

---

## 本地开发

```bash
npm install

# 1. 配置环境变量
cp .env.example .env.local
#    必填：WEREAD_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
#          / ALLOWED_USER_ID / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
#    可选：OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL（不填则 AI 分析不启用）

# 2. 建表：把 supabase/schema.sql 整段粘进 Supabase SQL Editor 执行

# 3. 把自己加进白名单（在 SQL Editor 里执行，UID 从 Authentication → Users 复制）
#    insert into public.wr_allowlist (user_id, note)
#    values ('你的-user-uid', 'Truck') on conflict do nothing;

# 4. 起服务
npm run dev          # 只跑前端（/api 不可用）
npx vercel dev       # 前端 + 服务端函数都能跑，推荐用这个联调
```

> 注意：`npm run dev` 不会启动 `api/` 下的函数，页面会拿不到数据。
> 要联调同步流程请用 `npx vercel dev`。

---

## 部署到 Vercel

1. 把项目推到 GitHub，在 Vercel 里 Import 这个仓库。
2. **Environment Variables** 逐条添加（值见 `.env.example`）：

   | 变量 | 作用域 | 说明 |
   |---|---|---|
   | `WEREAD_API_KEY` | 服务端 | 微信读书 API Key |
   | `SUPABASE_URL` | 服务端 | Supabase 项目地址 |
   | `SUPABASE_SERVICE_ROLE_KEY` | 服务端 | 权限极高，仅服务端使用 |
   | `ALLOWED_USER_ID` | 服务端 | 只放行这个用户 |
   | `VITE_SUPABASE_URL` | 前端 | 会打包进浏览器，公开值 |
   | `VITE_SUPABASE_ANON_KEY` | 前端 | 受 RLS 约束，公开值 |
   | `OPENAI_API_KEY` | 服务端 | **可选**。不填 = AI 分析不启用 |
   | `OPENAI_BASE_URL` | 服务端 | **可选**。任何 OpenAI 兼容网关，默认官方 |
   | `OPENAI_MODEL` | 服务端 | **可选**。默认 `gpt-4o-mini` |
   | `ANALYSIS_PROVIDER` | 服务端 | **可选**。填 `none` 可在有 Key 时也强制关闭分析 |
   | `VITE_LOGIN_EMAIL` | 前端 | **可选**。固定登录账号；留空则登录页还要填邮箱 |

3. 部署完成后打开站点，用密码登录，然后切到「同步」标签页点一次同步。
   密码在本地用 `npm run set-password` 设一次即可（写的是同一个 Supabase 用户，线上线下通用）。

---

## 登录方式：固定账号 + 密码

登录不依赖邮件：不点链接、不收验证码。账号是 Supabase Auth 里的用户，密码自己设。

```
打开站点 → 输入密码 → 登录
```

前端只做一件事：`supabase.auth.signInWithPassword({ email, password })`。
校验通过后会话交给 `useAuth` 的 `onAuthStateChange`，其余页面完全不用管。

### 怎么设置密码

Supabase 后台改密码要走邮件确认，本项目刻意不依赖邮件，所以用 service_role 直接写：

```bash
npm run set-password -- 740225978@qq.com
# 邮箱省略则交互询问；新密码在终端隐藏输入，需输两遍
```

脚本做的事：读 `.env.local` 的 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
→ 按邮箱找到用户 → `admin.updateUserById(id, { password })`。
**账号必须已经存在**（`Authentication → Users`，没有就手动 Add user 并勾 Auto Confirm）。

### 配套配置

- `VITE_LOGIN_EMAIL`：填了它，登录页只显示密码框（账号固定显示出来）。留空则页面上还要填邮箱。
  本地写在 `.env.local`，Vercel 上写在 Environment Variables。
- `Authentication → Providers → Email` 保持 **"Enable sign up" 关闭**：
  没人能自助注册，能登录的只有你设过密码的那个账号（服务端 `ALLOWED_USER_ID` 是第二道防线）。

固定账号邮箱会打包进前端，这不是问题 —— 它本来就不是秘密，
真正的防线是密码 + RLS 白名单 + `ALLOWED_USER_ID`。

---

## AI 分析怎么配

协议是 OpenAI 兼容的 `/chat/completions`，只要能对上就能用：

| 服务商 | `OPENAI_BASE_URL` | `OPENAI_MODEL` 示例 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |

**不配 Key 也不会坏**：`/api/analysis/run` 会返回 `enabled:false` 并列出「按水位线算出的待分析书目」，
不调用任何模型、不改动任何数据 —— 宁可什么都不做，也不编造分析结果。

两个实现细节值得记一笔：

- **`response_format` 降级重试**。有些兼容网关不认 `{"type":"json_object"}`，直接返 400。
  客户端会先带、被 4xx 拒绝后再去掉重试一次，并顺手剥掉模型爱加的 ` ```json ` 围栏。
- **水位线按「库里真实的划线条数」计**，不是「本次送给模型的条数」。
  否则超过 120 条划线的长书会永远算作未分析，每次同步都重算一遍。

---

## 封面为什么要单独一个补齐入口

同步只处理「笔记计数有变化」的书。如果某本书的封面在同步时下载失败（代码会退化为直接用 CDN 原址），
它的计数并没有变化，下次同步就不会再碰它 —— 封面于是永远补不上。

所以封面有一个独立的通道 `POST /api/covers/backfill`：它专门找 `cover_url` 还不在自己 Storage 上的书，
一次镜像 10 本，前端循环调用到 `done` 为止。「同步」页面上那个「补齐封面」按钮走的就是它。

对象名固定为 `<book_id>.<ext>` 且上传时 `upsert:true`，重复执行只会覆盖同名对象，不会攒垃圾文件。

`wr-covers` 是 **public bucket**，这是有意的：封面原图本来就公开挂在微信读书 CDN 上，
搬到自己 bucket 并没有新增暴露面，但换来页面不再依赖第三方 CDN 的可用性与防盗链策略。
写入只有服务端的 `service_role` 能做，客户端拿不到任何写策略。

**务必同时做**：Supabase → Authentication → Providers → Email，关掉 "Enable sign up"，
避免陌生人自助注册（`ALLOWED_USER_ID` 是第二道防线，不是唯一防线）。

---

## 数据表

| 表 | 作用 |
|---|---|
| `wr_books` | 书籍主表。`note_count` 等计数列是增量同步的判据 |
| `wr_highlights` | 划线。主键 `bookmark_id`，重复同步天然幂等 |
| `wr_reviews` | 想法与点评。主键 `review_id` |
| `wr_stats` | 阅读统计快照，用 jsonb 兜住第三方结构变动 |
| `wr_analysis` | AI 分析结果。`highlight_count_at_gen` 是重算水位线 |
| `wr_sync_log` | 同步任务队列与进度，分批同步的真相来源 |
| `wr_allowlist` | 访问白名单，仅 `security definer` 函数可读 |

存储：`wr-covers` bucket 放镜像后的封面。

一条重要约定：**计数只在明细拉取成功后才写回**。某本书拉失败时它的旧计数保持不变，
下次同步会被重新判定为「有变化」，从而自然获得重试机会。
AI 分析的水位线遵循同一条原则 —— 单本失败时 `highlight_count_at_gen` 不推进。

---

## 当前完成度（如实说明）

**已实现**

- [x] 增量判定与幂等入库（重跑 / 中断 / 并发都不会产生重复数据）
- [x] 分批同步 + 前端进度轮询，任务队列持久化，中途关页面不丢进度
- [x] 失败书目单独记录，支持只重试失败的书
- [x] 概览 / 书架 / 单本详情（划线 + 想法 + AI 分析）/ 同步记录
- [x] 邮箱验证码登录 + 白名单 + 全表 RLS
- [x] **AI 分析已接线**：OpenAI 兼容接口，水位线判重，逐本限流，单本失败不影响整批
- [x] **封面镜像到 Supabase Storage**，含独立的补齐通道与幂等覆盖策略

**未完成**

- [ ] **定时同步（P4）**。建议用 Supabase `pg_cron` + `pg_net` 定时打 `/api/sync/start`，
      然后复用同一套循环调用 batch。服务端函数里跑不了「循环到结束」，所以这一步需要
      么用 pg_cron 反复触发，要么用 Vercel Cron 每个小时打一次 start。
- [ ] **首次全量同步未在真实 Supabase 上验证过** —— 建表、填密钥之后才能跑通第一次。
- [ ] 封面源图变化时不会自动重新镜像（除非在补齐接口里传 `force:true`）。
      判定依据 `cover_source_url` 已经存在，需要时补一条比较逻辑即可。

**外部风险**：微信读书网关是「Agent 专用」接口，用于自建应用长期自动调用是否符合其授权口径、
是否会被限流，无法从技术侧确认。建议先小范围试运行，不要当作生产依赖。
