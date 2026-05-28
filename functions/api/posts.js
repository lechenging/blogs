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

      // A. 特殊路由：动态获取一二级分类的层级元数据（用于生成顶部导航栏）
      if (getNavMeta) {
        const { results } = await env.DB.prepare("SELECT DISTINCT series, category FROM posts").all();
        const navMeta = {};
        results.forEach(row => {
          const s = row.series || "默认系列";
          const c = row.category || "未分类";
          if (!navMeta[s]) navMeta[s] = [];
          if (!navMeta[s].includes(c)) navMeta[s].push(c);
        });
        return new Response(JSON.stringify(navMeta), { headers: { "Content-Type": "application/json" } });
      }

      // B. 如果是请求热门排行
      if (popularLimit) {
        const limit = parseInt(popularLimit) || 5;
        const { results } = await env.DB.prepare(
          "SELECT id, title, date, views, cover FROM posts ORDER BY views DESC LIMIT ?"
        ).bind(limit).all();
        return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
      }

      // C. 标准列表（加入大系列、分页、搜索筛选）
      const page = parseInt(url.searchParams.get("page")) || 1;
      const limit = parseInt(url.searchParams.get("limit")) || 12;
      const offset = (page - 1) * limit;

      let whereClause = "";
      let params = [];
      let conditions = [];

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

      // 分页查询
      let query = `SELECT id, title, summary, date, views, category, series, cover, layout_mode FROM posts ${whereClause} ORDER BY date DESC LIMIT ? OFFSET ?`;
      const { results } = await env.DB.prepare(query).bind(...params, limit, offset).all();

      return new Response(JSON.stringify({ results, total, page, limit }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  // 2. POST 请求
  if (request.method === "POST") {
    const authHeader = request.headers.get("Authorization");
    if (!(await verifyPassword(authHeader, env))) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const { id, title, summary, content, date, category, cover, series, layout_mode } = await request.json();

      await env.MY_BUCKET.put(`posts/${id}.md`, content, {
        httpMetadata: { contentType: "text/markdown; charset=utf-8" }
      });

      await env.DB.prepare(`
        INSERT INTO posts (id, title, summary, date, category, cover, series, layout_mode, views) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(id) DO UPDATE SET title = ?, summary = ?, category = ?, cover = ?, series = ?, layout_mode = ?
      `).bind(
        id, title, summary, date, category || '未分类', cover || '', series || '默认系列', layout_mode || 'standard',
        title, summary, category || '未分类', cover || '', series || '默认系列', layout_mode || 'standard'
      ).run();

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}
