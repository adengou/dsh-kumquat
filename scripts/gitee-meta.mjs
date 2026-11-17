#!/usr/bin/env node
/**
 * 更新 Gitee 仓库简介与主页。
 *
 * 用法：
 *   GITEE_TOKEN=xxxx node scripts/gitee-meta.mjs
 *
 * 只改 description / homepage，不改可见性、分支或代码。
 * 标签（topics）Gitee API 未开放，需要在网页上填。
 */

const OWNER = 'adengou'
const REPO = 'dsh-kumquat'
const DESCRIPTION = 'DSH 插件：视频/音频格式转换与取景 GIF，产物出厂前自动验收。'
const HOMEPAGE = `https://gitee.com/${OWNER}/${REPO}`

const token = process.env.GITEE_TOKEN
if (typeof token !== 'string' || token.trim() === '') {
  console.error('缺少 GITEE_TOKEN：请先在 Gitee 生成带 projects 权限的私人令牌。')
  process.exit(1)
}

const response = await fetch(`https://gitee.com/api/v5/repos/${OWNER}/${REPO}`, {
  method: 'PATCH',
  headers: {
    'content-type': 'application/json',
    'user-agent': 'kumquat-release',
  },
  body: JSON.stringify({
    access_token: token.trim(),
    description: DESCRIPTION,
    homepage: HOMEPAGE,
  }),
})

let payload = null
try {
  payload = await response.json()
} catch {
  payload = null
}

if (!response.ok) {
  const message = payload && payload.message ? payload.message : `HTTP ${response.status}`
  console.error('更新失败：' + message)
  process.exit(1)
}

console.log('已更新：')
console.log('  简介：' + (payload.description || DESCRIPTION))
console.log('  主页：' + (payload.homepage || HOMEPAGE))
console.log('  可见性：' + (payload.public === true ? '公开' : '私有（未改动）'))
console.log('提醒：标签仍需在仓库「管理 → 基本信息」里手动填写。')
