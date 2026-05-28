async function verifyPassword(password, env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM config WHERE key = 'admin_password'").first();
    if (row && row.value) return password === row.value;
  } catch (e) {}
  return password === env.ADMIN_PASSWORD;
}

export async function onRequest(context) {
  const { request, env } = context;

  // 1. GET 请求：公开获取站点配置（加入 site_popular_limit）
  if (request.method === "GET") {
    try {
      const rows = await env.DB.prepare("SELECT key, value FROM config WHERE key IN ('site_title', 'site_subtitle', 'site_categories', 'site_series', 'site_nav_links', 'site_layout_mode', 'site_popular_limit')").all();
      const configMap = {};
      rows.results.forEach(row => {
        configMap[row.key] = row.value;
      });
      return new Response(JSON.stringify(configMap), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  // 2. POST 请求：更新站点配置（包含 site_popular_limit）
  if (request.method === "POST") {
    const authHeader = request.headers.get("Authorization");
    if (!(await verifyPassword(authHeader, env))) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const { site_title, site_subtitle, site_categories, site_series, site_nav_links, site_layout_mode, site_popular_limit } = await request.json();

      const stmt = env.DB.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)");
      await env.DB.batch([
        stmt.bind("site_title", site_title),
        stmt.bind("site_subtitle", site_subtitle),
        stmt.bind("site_categories", JSON.stringify(site_categories)),
        stmt.bind("site_series", JSON.stringify(series_series)), // 确保大系列绑定
        stmt.bind("site_nav_links", JSON.stringify(site_nav_links)),
        stmt.bind("site_layout_mode", site_layout_mode),
        stmt.bind("site_popular_limit", String(site_popular_limit)) // 绑定保存热门限制
      ]);

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}
