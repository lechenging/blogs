async function verifyPassword(password, env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM config WHERE key = 'admin_password'").first();
    if (row && row.value) return password === row.value;
  } catch (e) {}
  return password === env.ADMIN_PASSWORD;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. GET 请求
  if (request.method === "GET") {
    try {
      const q = url.searchParams.get("q");
      const category = url.searchParams.get("category");
      const series = url.searchParams.get("series");
      const popularLimit = url.searchParams.get("popular");
      const getNavMeta = url.searchParams.get("get_nav_meta");
      const id = url.searchParams.get("id");
      
      // 判断是否是管理员后台发起的请求
      const authHeader = request.headers.get("Authorization");
      const isAdmin = await verifyPassword(authHeader, env);

      // A. 获取单篇文章元数据，详情页直接访问时用于补齐标题、封面和分类信息
      if (id) {
        const query = isAdmin
          ? "SELECT id, title, summary, date, views, category, series, cover, layout_mode, status, weight FROM posts WHERE id = ?"
          : "SELECT id, title, summary, date, views, category, series, cover, layout_mode, status, weight FROM posts WHERE id = ? AND status = 'publish'";

        const post = await env.DB.prepare(query).bind(id).first();
        if (!post) {
          return new Response("Not found", { status: 404 });
        }

        return new Response(JSON.stringify(post), { headers: { "Content-Type": "application/json" } });
      }

      // B. 获取一二级导航元数据
      if (getNavMeta) {
        // 如果是管理员，获取所有文章一二级目关系；游客只获取公开文章的层级
        let query = "SELECT DISTINCT series, category FROM posts";
        if (!isAdmin) query += " WHERE status = 'publish'";
        
        const { results } = await env.DB.prepare(query).all();
        const navMeta = {};
        results.forEach(row => {
          const s = row.series || "默认系列";
          const c = row.category || "未分类";
          if (!navMeta[s]) navMeta[s] = [];
          if (!navMeta[s].includes(c)) navMeta[s].push(c);
        });
        return new Response(JSON.stringify(navMeta), { headers: { "Content-Type": "application/json" } });
      }

      // C. 获取热门排行 (游客模式下不显示隐藏文章)
      if (popularLimit) {
        const limit = parseInt(popularLimit) || 5;
        const query = isAdmin 
          ? "SELECT id, title, date, views, cover FROM posts ORDER BY views DESC LIMIT ?"
          : "SELECT id, title, date, views, cover FROM posts WHERE status = 'publish' ORDER BY views DESC LIMIT ?";
        
        const { results } = await env.DB.prepare(query).bind(limit).all();
        return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
      }

      // D. 标准列表（加入物理权重与状态控制）
      const page = parseInt(url.searchParams.get("page")) || 1;
      const limit = parseInt(url.searchParams.get("limit")) || 12;
      const offset = (page - 1) * limit;

      let whereClause = "";
      let params = [];
      let conditions = [];

      // 游客模式强制过滤掉草稿/隐藏文章
      if (!isAdmin) {
        conditions.push("status = 'publish'");
      }

      if (q) {
        conditions.push("(title LIKE ? OR summary LIKE ?)");
        params.push(`%${q}%`, `%${q}%`);
      }
      if (category) {
        conditions.push("category = ?");
        params.push(category);
      }
      if (series) {
        conditions.push("series = ?");
        params.push(series);
      }

      if (conditions.length > 0) {
        whereClause = " WHERE " + conditions.join(" AND ");
      }

      // 统计数量
      const countResult = await env.DB.prepare(`SELECT COUNT(*) as count FROM posts ${whereClause}`).bind(...params).first();
      const total = countResult ? countResult.count : 0;

      // 核心排序：优先按照权重自大到小排列 (weight DESC)，其次按照日期倒序 (date DESC)
      let query = `SELECT id, title, summary, date, views, category, series, cover, layout_mode, status, weight FROM posts ${whereClause} ORDER BY weight DESC, date DESC LIMIT ? OFFSET ?`;
      const { results } = await env.DB.prepare(query).bind(...params, limit, offset).all();

      return new Response(JSON.stringify({ results, total, page, limit }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  // 2. POST 请求：保存/编辑文章
  if (request.method === "POST") {
    const authHeader = request.headers.get("Authorization");
    if (!(await verifyPassword(authHeader, env))) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const { id, title, summary, content, date, category, cover, series, layout_mode, status, weight } = await request.json();

      await env.MY_BUCKET.put(`posts/${id}.md`, content, {
        httpMetadata: { contentType: "text/markdown; charset=utf-8" }
      });

      // 保存至 D1 数据库
      await env.DB.prepare(`
        INSERT INTO posts (id, title, summary, date, category, cover, series, layout_mode, status, weight, views) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(id) DO UPDATE SET title = ?, summary = ?, category = ?, cover = ?, series = ?, layout_mode = ?, status = ?, weight = ?
      `).bind(
        id, title, summary, date, category || '未分类', cover || '', series || '默认系列', layout_mode || 'standard', status || 'publish', parseInt(weight) || 0,
        title, summary, category || '未分类', cover || '', series || '默认系列', layout_mode || 'standard', status || 'publish', parseInt(weight) || 0
      ).run();

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}
