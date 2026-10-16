#!/usr/bin/env node
/**
 * 给登录账号设置 / 重设密码（用 service_role 写 Supabase Auth，不发邮件、不需要 SMTP）。
 *
 * 用法：
 *   npm run set-password -- 740225978@qq.com      # 邮箱可省略，届时交互输入
 *   密码统一在终端隐藏输入；也可以 SET_PASSWORD=xxx 直接传（CI 场景）
 *
 * 之所以需要它：Supabase 后台的「改密码」要走邮件确认，而本项目刻意不依赖邮件。
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline'

/** 自己解析 .env.local，免得依赖 node 的 --env-file 版本差异 */
function loadEnvFile(file) {
  if (!existsSync(file)) return
  const text = readFileSync(file, 'utf8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，请检查 .env.local')
  process.exit(1)
}

function ask(label) {
  return new Promise((res) => {
    const rl = createInterface({ input: stdin, output: stdout })
    rl.question(label, (answer) => {
      rl.close()
      res(answer.trim())
    })
  })
}

/** 终端隐藏输入：非 TTY 时退化为明文读取 */
async function askPassword(label) {
  if (!stdin.isTTY) return ask(label)

  stdout.write(label)
  return new Promise((res) => {
    let value = ''
    const onData = (chunk) => {
      const c = chunk.toString('utf8')
      if (c === '\n' || c === '\r') {
        stdin.off('data', onData)
        stdin.setRawMode(false)
        stdin.pause()
        stdout.write('\n')
        res(value)
        return
      }
      if (c === '\u0003') process.exit(1)
      if (c === '\u007f') {
        value = value.slice(0, -1)
        stdout.write('\b \b')
        return
      }
      if (c === '\u0004') return
      value += c
      stdout.write('*')
    }
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

const email = (process.argv[2] ?? '').trim() || (await ask('账号邮箱: '))
if (!email) {
  console.error('必须提供账号邮箱')
  process.exit(1)
}

let password = process.env.SET_PASSWORD ?? ''
if (!password) {
  password = await askPassword('新密码（至少 6 位）: ')
  const again = await askPassword('再输入一次: ')
  if (password !== again) {
    console.error('两次输入不一致')
    process.exit(1)
  }
}

if (password.length < 6) {
  console.error('密码至少 6 位')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// 分页找用户：listUsers 默认只给一页，这里按邮箱精确匹配
async function findUser(target) {
  const perPage = 200
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const users = data?.users ?? []
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === target.toLowerCase())
    if (hit) return hit
    if (users.length < perPage) return null
  }
  return null
}

const user = await findUser(email)
if (!user) {
  console.error(`在 Supabase 里没找到 ${email}。请先在 Authentication → Users 里添加该账号（勾 Auto Confirm）`)
  process.exit(1)
}

const { error } = await admin.auth.admin.updateUserById(user.id, { password })
if (error) {
  console.error(`设置失败：${error.message}`)
  process.exit(1)
}

console.log(`已更新 ${user.email} 的密码，现在可以用账号密码登录了。`)
