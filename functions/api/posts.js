async function verifyPassword(password, env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM config WHERE key = 'admin_password'").first();
    if (row && row.value) return password === row.value;
  } catch (e) {}
  return password === env.ADMIN_PASSWORD;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "GET") {
    try {
      const { results } = await env.DB.prepare("SELECT id, title, summary, date, views FROM posts ORDER BY date DESC").all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  if (request.method === "POST") {
    const authHeader = request.headers.get("Authorization");
    if (!(await verifyPassword(authHeader, env))) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const { id, title, summary, content, date } = await request.json();

      await env.MY_BUCKET.put(`posts/${id}.md`, content, {
        httpMetadata: { contentType: "text/markdown; charset=utf-8" }
      });

      await env.DB.prepare(`
        INSERT INTO posts (id, title, summary, date, views) VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(id) DO UPDATE SET title = ?, summary = ?
      `).bind(id, title, summary, date, title, summary).run();

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}
