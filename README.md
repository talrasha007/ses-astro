# SES 邮件查看器

部署于 Cloudflare Pages 的只读邮件查看器。AWS SES 将收到的邮件以原始 MIME 文件存入 S3，本应用用 D1 保存多个 S3 访问配置（每个带别名），左侧按「别名 → 邮件（收件人 + 标题）」像文件夹一样展开，点击在右侧展示正文（HTML + 附件下载）。仅解析与展示，无发送功能。

## 技术栈

- **Astro**（SSR，`output: 'server'`）+ `@astrojs/cloudflare` 适配器
- **D1** 存配置与邮件元数据缓存（绑定名 `DB`）
- **aws4fetch** 对 S3 请求做 SigV4 签名（ListObjectsV2 / GetObject）
- **postal-mime** 解析 MIME 邮件
- 加解密与会话签名用运行时内置 **Web Crypto**；HTML 正文在 `sandbox` iframe 中渲染，并用 **HTMLRewriter** 剥离 `<script>`

> 需要 Node ≥ 22.12（Astro 7 要求）。

## 本地开发

1. 安装依赖：`npm install`
2. 在 `.dev.vars` 配置三个机密（已含开发占位值，请改为随机长串）：
   - `APP_PASSWORD` —— 登录口令
   - `ENCRYPTION_KEY` —— 加密 S3 secret 的主密钥
   - `SESSION_SECRET` —— 会话 cookie 的 HMAC 密钥
3. 建本地 D1 表：`npx wrangler d1 migrations apply ses-astro --local`
4. 启动：`npm run dev`（默认 http://localhost:4321）

## 部署到 Cloudflare Workers

本项目用 `@astrojs/cloudflare` 适配器，构建产物是 Workers Static Assets（`dist/server/` + `dist/client/`），用 `wrangler deploy` 部署（不是 `pages deploy`）。

1. 创建 D1 数据库：`npx wrangler d1 create ses-astro`，把返回的 `database_id` 填入 `wrangler.jsonc`（替换 `REPLACE_WITH_D1_DATABASE_ID`）。
2. 应用迁移到远端：`npx wrangler d1 migrations apply ses-astro --remote`
3. 设置生产机密（`npx wrangler secret put <NAME>` 或 Worker 控制台）：`APP_PASSWORD`、`ENCRYPTION_KEY`、`SESSION_SECRET`。
   > `ENCRYPTION_KEY` 一旦用于加密就不能更改，否则已存配置无法解密。
4. 构建并部署：`npm run build` 然后 `npx wrangler deploy --config dist/server/wrangler.json`。

> 发布 GitHub Release 会触发 [.github/workflows/deploy.yml](.github/workflows/deploy.yml) 自动完成上述 2 / 4 步。

## 使用

1. 用 `APP_PASSWORD` 登录。
2. 进入 ⚙︎ 配置页，新建 S3 配置：别名、Region、Bucket、Prefix（SES 存邮件的前缀）、Access Key ID、Secret Access Key。
3. 回到主界面，点别名旁的 ⟳ 刷新——会列出 prefix 下对象、解析并把元数据缓存进 D1。
4. 展开别名查看「收件人 — 标题」列表，点击邮件在右侧阅读正文与下载附件。

## 命令

| 命令 | 说明 |
| :-- | :-- |
| `npm run dev` | 本地开发服务器 |
| `npm run build` | 生产构建到 `./dist/` |
| `npm run check` | 类型检查（`astro check`） |
| `npm run cf-typegen` | 改动 `wrangler.jsonc`/`.dev.vars` 后重新生成绑定类型 |

## IAM 权限

S3 访问凭证最小只读权限：对目标 bucket/prefix 的 `s3:ListBucket` 与 `s3:GetObject`。
