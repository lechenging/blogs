## 演示站
：blogs.nyc.mn[演示站](https://blogs.nyc.mn/)


## 🛠️ 第一阶段：一键获取项目代码

1. 登录您的 [GitHub 账号](https://github.com/)。
2. 浏览器打开开源仓库地址：[github.com/6106757-lab/blogs](https://github.com/6106757-lab/blogs)。
3. 点击页面右上角的 **Fork** 按钮。
4. 保持默认命名，直接点击 **Create fork**。
   *这会瞬间将整个博客系统的完整代码（包含前端极速 HTML 和 `/functions` 下的所有 R2、D1 自动清理及安全认证接口）完整复制到您的个人仓库中。*

---

## 💾 第二阶段：配置 Cloudflare D1 数据库

D1 是 Cloudflare 提供的关系型 SQL 数据库。我们用它来存放文章分类索引、阅读量和站点全局配置。

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 点击左侧菜单 **存储与数据库** -> 选择 **D1**。
3. 点击 **Create database** -> 选择 **Dashboard** 方式。
4. 数据库命名为：**`blog-db`**，点击 **Create**。
5. 进入刚刚创建的 `blog-db` -> 点击 **Console（控制台）** 选项卡。
6. 在输入框中**分步、单句执行**以下三段 SQL 初始化命令（每粘贴完一条，点击一次 Execute 执行）：

**第一步（创建文章表）：**

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
    status TEXT DEFAULT 'publish',   -- 默认状态：公开发布 (publish) / 隐藏 (draft)
    weight INTEGER DEFAULT 0,        -- 默认物理排序权重 (数字越大越靠前)
    views INTEGER DEFAULT 0          -- 默认阅读量
);
```

**第二步（创建全局系统配置表）：**

```sql
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

**第三步（一键初始化站点默认配置数据，初始登录密码为 `admin123`）：**

```sql
INSERT OR IGNORE INTO config (key, value) VALUES ('admin_password', 'admin123');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_title', '无服务器数字花园');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_subtitle', '动态闭环系统，基于 Cloudflare Pages + R2 + D1 强力驱动。');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_categories', '["技术","教程","随笔","思考"]');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_series', '["科学上网","谷歌系列","NAS系列"]');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_nav_links', '[{"name": "订阅转换", "url": "https://sub.blogs.nyc.mn"}, {"name": "IP查询", "url": "https://ip.blogs.nyc.mn"}, {"name": "It-Tools工具箱", "url": "https://it.blogs.nyc.mn"}]');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_layout_mode', 'standard');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_popular_limit', '5');
```

---

## 📦 第三阶段：配置 Cloudflare R2 存储桶

R2 用于存储文章的 `.md` 源码文件和所有的教程插图，每月享有 **10 GB 完全免费**的读取和存储空间。

1. 登录 Cloudflare 控制台 -> 点击左侧菜单 **存储与数据库** -> 选择 **R2**。
2. 点击 **Create bucket**，命名为 **`blog-images`**，点击创建。
3. 进入该存储桶 -> 选择 **Settings（设置）** 选项卡。
4. **绑定自定义域名**：
   在 **Custom Domains** 下，点击 **Connect Domain**，绑定您的专属二级域名（例如：`images.blogs.nyc.mn`），作为您的 R2 高速图床链接。
5. **【最关键：配置跨域 CORS 策略】**：
   在 **CORS Policy** 区域，点击 **Add CORS policy**，粘贴以下规则并点击 **Save**（这确保浏览器可以安全、无阻碍地读取 R2 内的文章和图片）：
   ```json
   [
     {
       "AllowedOrigins": [
         "https://blogs.nyc.mn",
         "http://blogs.nyc.mn",
         "https://*.pages.dev"
       ],
       "AllowedMethods": [
         "GET",
         "HEAD"
       ],
       "AllowedHeaders": [
         "*"
       ],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

---

## 🌐 第四阶段：一键关联 Pages 部署

1. 在 Cloudflare 控制台点击左侧菜单 **Workers & Pages** -> 选择 **Create** -> 选择 **Pages** 选项卡。
2. 点击 **Connect to Git**，选择您的新 GitHub 账户并授权。
3. 在仓库列表中，选择您刚刚 Fork 出来的 **`blogs`** 仓库，点击 **Begin setup**。
4. 在构建配置页面中，框架、命令、输出目录等所有参数**全部保留为空**，直接点击 **Save and Deploy** 部署。

### 1. 绑定 D1 与 R2 资源

部署完成后，点击顶部的 **Settings（设置）** 选项卡 -> 选择左侧的 **Functions（函数）**：

* **绑定 D1 数据库**：
  在 **D1 database bindings** 区域，点击 **Add binding**。变量名称（Variable name）填入：`DB`。 D1 database 下拉选择：`blog-db`。
* **绑定 R2 存储桶**：
  in **R2 bucket bindings** 区域，点击 **Add binding**。变量名称（Variable name）填入：`MY_BUCKET`。 R2 bucket 下拉选择：`japan-images`。

### 2. 配置环境变量

在同一个 **Settings** 页面，点击左侧的 **Environment variables**。在 **Production（生产环境）** 处点击 **Add variables**，填入以下 4 个变量：

* **`REPO_OWNER`**：您的 GitHub 用户名（例如：`6106757`）。
* **`REPO_NAME`**：您 Fork 的仓库名称（例如：`blogs`）。
* **`R2_CUSTOM_DOMAIN`**：您的 R2 绑定二级域名（例如：`images.blogs.nyc.mn`，前后不要带协议头和斜杠）。
* **`ADMIN_PASSWORD`**：您自定的备用管理员密码（用于紧急恢复状态）。

*配置完成后，请返回项目的 **Deployments（部署）** 选项卡，在最新一笔部署记录右侧点击三个点，选择 **Retry deployment（重新部署）** 激活这些绑定。*

---

## 🎉 第五阶段：进入后台与使用

1. **进入后台**：由于我们对前后台进行了高性能的“动静分离”拆分，请在浏览器中直接访问：**`您的博客域名/admin.html`**（例如：`https://blogs.nyc.mn/admin.html`）。
2. **首次登录**：输入系统初始密码：**`admin123`** 登录。
3. **安全修改密码**：点击左侧“改密”面板或直接进入修改，该新密码将直接加密写入 D1 数据库中实时生效。
4. **在线配置**：直接在管理面板中，在线修改网站标题、描述、一二级导航菜单并保存，首页即可瞬间完成 0 延迟更新！
