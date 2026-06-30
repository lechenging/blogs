# 个人博客系统（无服务器零费用）

这是一个部署在 Cloudflare Pages 上的无构建博客系统，前台和后台均为单文件静态页面，数据由 Cloudflare D1 与 R2 驱动。当前界面已按 Semi Design 风格重构，并内置站点 Logo、后台管理、Markdown 编辑、图片上传、文章分类、系列导航和阅读量统计。

线上版本：<https://miai.de5.net>

基于代码二次修改：<https://github.com/6106757-lab/blogs>

## 功能概览

- 前台首页：文章列表、系列导航、分类筛选、搜索、热门文章、分页。
- 文章详情：Hash 路由 `#/post/:id`，从 D1 读取元数据，从 R2 读取 Markdown 正文。
- 后台管理：登录、文章列表筛选、发布文章、编辑文章、删除文章、站点配置、修改密码。
- 媒体存储：正文 Markdown 与图片资源存放在 Cloudflare R2。
- 数据索引：文章元数据、配置项、阅读量存放在 Cloudflare D1。
- 视觉系统：前后台采用 Semi Design 风格的蓝绿配色、卡片、按钮、标签和控制台布局。
- Logo 资源：`assets/logo.svg` 与 `assets/favicon.svg`。

## 项目结构

```text
.
├── index.html                 # 前台首页与文章详情入口
├── admin.html                 # 后台管理入口
├── assets/
│   ├── logo.svg               # 站点 Logo
│   └── favicon.svg            # 浏览器图标
├── functions/
│   └── api/
│       ├── auth.js            # 登录与改密
│       ├── config.js          # 站点配置读写
│       ├── delete.js          # 删除文章与关联资源
│       ├── posts.js           # 文章列表、详情元数据、发布编辑
│       ├── publish.js         # 发布相关接口
│       ├── upload.js          # 图片上传到 R2
│       └── views.js           # 阅读量统计
└── README.md
```

## 技术栈

- Cloudflare Pages：静态页面托管与 Functions 运行环境。
- Cloudflare D1：保存文章元数据、站点配置、后台密码、阅读量。
- Cloudflare R2：保存 Markdown 正文和图片资源。
- Tailwind CSS CDN：页面样式基础能力。
- marked：前台 Markdown 渲染。
- highlight.js：代码高亮。
- Vditor：后台 Markdown 所见即所得编辑器。

## 部署流程

### 1. Fork 或上传项目

1. 登录 GitHub。
2. 将本项目代码 Fork 到自己的账号，或直接上传到自己的仓库。
3. 后续通过 Cloudflare Pages 关联该仓库部署。

### 2. 创建 Cloudflare D1 数据库

1. 进入 Cloudflare 控制台。
2. 打开 `存储与数据库` -> `D1`。
3. 创建数据库，例如命名为 `blog-db`。
4. 进入数据库控制台，依次执行以下 SQL。

创建文章表：

```sql
CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    date TEXT NOT NULL,
    category TEXT DEFAULT '未分类',
    cover TEXT DEFAULT '',
    series TEXT DEFAULT '默认系列',
    layout_mode TEXT DEFAULT 'standard',
    status TEXT DEFAULT 'publish',
    weight INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0
);
```

创建配置表：

```sql
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

写入默认配置：

```sql
INSERT OR IGNORE INTO config (key, value) VALUES ('admin_password', 'admin123');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_title', 'miai.de5.net');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_subtitle', 'AI，让思考发声！');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_categories', '["技术","教程","随笔","思考"]');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_series', '["科学上网","谷歌系列","NAS系列"]');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_nav_links', '[{"name":"CC API","url":"https://napi.mai.us.ci"},{"name":"工具箱","url":"https://tools.example.com"}]');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_layout_mode', 'standard');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_popular_limit', '5');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_r2_domain', 'https://images.example.com');
```

创建评论表：

```sql
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    parent_id TEXT DEFAULT '',
    author TEXT NOT NULL,
    email TEXT DEFAULT '',
    website TEXT DEFAULT '',
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_post_status
ON comments (post_id, status, created_at);
```

说明：

- `admin_password` 是后台初始密码，部署后请尽快在后台修改。
- `site_r2_domain` 请替换为你的 R2 公开访问域名，必须包含 `https://`，结尾不要带 `/`。
- `site_categories` 和 `site_series` 是 JSON 字符串，后台也可以后续在线修改。

### 3. 创建 Cloudflare R2 存储桶

1. 进入 Cloudflare 控制台。
2. 打开 `存储与数据库` -> `R2`。
3. 创建存储桶，例如命名为 `blog-images`。
4. 为 R2 绑定自定义域名，例如 `images.example.com`。
5. 配置 CORS 策略，允许博客域名读取 Markdown 和图片。

示例 CORS：

```json
[
  {
    "AllowedOrigins": [
      "https://miai.de5.net",
      "http://miai.de5.net",
      "https://*.pages.dev"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

### 4. 部署 Cloudflare Pages

1. 进入 Cloudflare 控制台。
2. 打开 `Workers & Pages`。
3. 选择 `Pages`，连接 GitHub 仓库。
4. 构建配置保持为空：
   - 构建命令：留空
   - 输出目录：留空
   - 框架预设：无
5. 保存并部署。

### 5. 绑定 D1 与 R2

部署完成后，进入 Pages 项目设置：

1. 打开 `Settings` -> `Functions`。
2. 添加 D1 绑定：
   - 变量名：`DB`
   - 数据库：选择前面创建的 `blog-db`
3. 添加 R2 绑定：
   - 变量名：`MY_BUCKET`
   - 存储桶：选择前面创建的 `blog-images`

可选环境变量：

```text
ADMIN_PASSWORD=你的备用后台密码
R2_PUBLIC_DOMAIN=https://你的R2公开域名
```

说明：

- `ADMIN_PASSWORD` 仅作为 D1 配置读取失败时的备用密码。
- 正常情况下后台密码读取 D1 的 `admin_password`。

## 后台使用

后台地址：

```text
https://你的博客域名/admin.html
```

首次登录：

```text
admin123
```

后台能力：

- 文章列表管理：按标题、系列、分类、状态筛选。
- 撰写新教程：编辑标题、摘要、系列、分类、权重、状态、封面和正文。
- 评论审核：查看待审核、已通过、已隐藏评论，并执行通过、隐藏、删除操作。
- 图片上传：封面和正文图片会上传到 R2。
- 站点配置：修改站点标题、副标题、分类、系列、导航链接、R2 域名、热门文章数量。
- 修改密码：通过左下角“改密”修改后台密码。

## 文章数据说明

每篇文章由两部分组成：

- D1 `posts` 表：保存标题、摘要、分类、系列、封面、状态、权重、阅读量。
- R2 `posts/{id}.md`：保存 Markdown 正文。

文章状态：

- `publish`：前台可见。
- `draft`：前台隐藏，后台可管理。

排序规则：

1. `weight` 越大越靠前。
2. 权重相同时按 `date` 倒序。

## 前台路由说明

当前前台采用 Hash 路由：

```text
首页：/
文章详情：/#/post/{id}
系列页：/#/series/{series}
```

文章详情由浏览器端加载：

1. 从 `./api/posts?id={id}` 获取文章元数据。
2. 从 R2 读取 `posts/{id}.md`。
3. 使用 marked 渲染 Markdown。
4. 使用 highlight.js 高亮代码。
5. 调用 `./api/views?id={id}` 累加阅读量。
6. 调用 `./api/comments?post_id={id}` 加载已审核评论。

## 评论系统说明

评论数据存放在 D1 `comments` 表中，前台文章详情页支持一级评论和二级回复。访客提交评论后默认进入 `pending` 待审核状态，后台“评论审核”面板通过后才会在前台公开显示。

评论状态：

- `pending`：待审核，前台不可见。
- `approved`：已通过，前台可见。
- `hidden`：已隐藏，前台不可见。

评论接口：

```text
GET  /api/comments?post_id={id}              # 前台读取已审核评论
POST /api/comments                           # 前台提交评论或回复
GET  /api/comments?admin=true&status=pending # 后台按状态读取评论，需要 Authorization
POST /api/comments                           # 后台审核、隐藏或删除评论，需要 Authorization
```

删除文章时，系统会同步删除该文章下的全部评论，避免产生孤立评论数据。

## Logo 与视觉资源

当前 Logo 文件：

```text
assets/logo.svg
assets/favicon.svg
```

如果需要替换品牌标识，直接替换这两个 SVG 文件即可。前台导航、后台登录页、后台侧栏和浏览器 favicon 都会自动使用这些资源。

## 常见问题

### 文章详情加载失败

检查项：

- D1 中是否存在该文章记录。
- 文章状态是否为 `publish`。
- R2 中是否存在 `posts/{id}.md`。
- R2 CORS 是否允许当前博客域名读取。
- 后台配置中的 `R2 存储桶公网访问域名` 是否正确。

### 图片无法显示

检查项：

- R2 自定义域名是否可公开访问。
- 图片 URL 是否使用 `https://`。
- CORS 是否允许当前博客域名。
- 后台上传接口是否绑定了 `MY_BUCKET`。

### 后台无法登录

检查项：

- D1 `config` 表中是否存在 `admin_password`。
- Pages Functions 是否绑定了 `DB`。
- 如果 D1 异常，是否配置了备用环境变量 `ADMIN_PASSWORD`。

### 修改配置后前台没变化

检查项：

- 配置是否保存成功。
- 浏览器缓存是否刷新。
- Cloudflare Pages Functions 是否正常访问 D1。
