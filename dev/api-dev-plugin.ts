import type { Connect, Plugin, ViteDevServer } from 'vite'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ServerResponse } from 'node:http'
import path from 'node:path'

/**
 * 本地开发用：让 `vite dev` 也能跑 api/ 下的 Vercel Serverless Functions。
 *
 * 为什么需要：生产环境 /api/* 由 Vercel 提供，本地若只起 Vite，请求这些
 * 路径会 404。本插件在 dev server 里拦截 /api/*，用 Vite 的 SSR 模块加载器
 * 即时编译对应的 .ts handler，并用最小的 VercelRequest/VercelResponse
 * 适配器调用它，无需额外装 vercel CLI、无需登录。
 *
 * 仅在 dev 生效；build 产物照常部署到 Vercel，不经过这里。
 */

// new URL('..', import.meta.url) 已指向项目根（以 / 结尾），直接转路径即可，
// 不能再套 dirname，否则会退到上一级目录。
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const API_DIR = path.join(ROOT, 'api')

// /api/sync/start、/api/covers/backfill 等 → api/sync/start.ts
function resolveHandler(urlPath: string): string | null {
  const seg = urlPath.replace(/^\/api\/?/, '').split('?')[0].replace(/\/+$/, '')
  if (!seg || seg.startsWith('_')) return null
  const file = path.join(API_DIR, `${seg}.ts`)
  return existsSync(file) ? file : null
}

// 极简 .env.local 加载（Vite 只把 VITE_ 前缀注入 import.meta.env，
// 而后端函数读的是不带前缀的 process.env，需要在这里补齐）
function loadServerEnv() {
  const file = path.join(ROOT, '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]
    if (process.env[key] !== undefined) continue
    let val = m[2]
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

// 把 Node IncomingMessage 包成 handler 期望的 VercelRequest 最小子集
function makeReq(req: Connect.IncomingMessage, rawBody: string) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const query: Record<string, string> = {}
  url.searchParams.forEach((v, k) => {
    query[k] = v
  })

  let body: unknown = rawBody
  if (rawBody) {
    try {
      body = JSON.parse(rawBody)
    } catch {
      body = rawBody
    }
  }

  return Object.assign(req, {
    query,
    body,
  })
}

// 用收集调用的方式实现 VercelResponse 的 status/setHeader/send 最小子集
function makeRes(res: ServerResponse) {
  return {
    status(code: number) {
      res.statusCode = code
      return this
    },
    setHeader(k: string, v: string | number) {
      res.setHeader(k, String(v))
      return this
    },
    send(chunk: unknown) {
      res.end(typeof chunk === 'string' ? chunk : JSON.stringify(chunk))
    },
    // 部分 handler 可能直接 json()；http.ts 里已统一走 send，这里留个保险
    end(chunk?: unknown) {
      res.end(typeof chunk === 'string' ? chunk : chunk !== undefined ? JSON.stringify(chunk) : undefined)
    },
  }
}

export function apiDevPlugin(): Plugin {
  let server: ViteDevServer

  return {
    name: 'local-api-functions',
    apply: 'serve',
    configureServer(s) {
      server = s
      loadServerEnv()

      s.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url ?? '').split('?')[0]
        // 非 /api 请求必须放行给 Vite 自己的中间件，否则页面会挂起
        if (!urlPath.startsWith('/api/')) return next()

        const file = resolveHandler(req.url ?? '')
        if (!file) {
          send(res, 404, { ok: false, error: `本地找不到 API: ${urlPath}` })
          return
        }

        try {
          // 读 body
          const raw = await new Promise<string>((resolve) => {
            let data = ''
            req.on('data', (c) => (data += c))
            req.on('end', () => resolve(data))
          })

          // 用 Vite 的 ssrLoadModule 即时编译 .ts，改动可热更
          const mod = await server.ssrLoadModule(`/@fs/${file}`)
          const handler = mod.default
          if (typeof handler !== 'function') {
            send(res, 500, { ok: false, error: '该文件没有默认导出的 handler' })
            return
          }

          const vReq = makeReq(req, raw)
          const vRes = makeRes(res)

          if (!res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
          }

          await handler(vReq, vRes)
        } catch (e) {
          server.ssrFixStacktrace(e as Error)
          // eslint-disable-next-line no-console
          console.error(`[api-dev] ${req.url}:`, e)
          if (!res.headersSent) {
            send(res, 500, {
              ok: false,
              error: e instanceof Error ? e.message : '本地 API 执行失败',
            })
          } else {
            res.end()
          }
        }
      })
    },
  }
}
