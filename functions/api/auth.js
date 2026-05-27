async function verifyPassword(password, env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM config WHERE key = 'admin_password'").first();
    if (row && row.value) {
      return password === row.value;
    }
  } catch (e) {}
  return password === env.ADMIN_PASSWORD;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { action, password, newPassword } = await request.json();

  // 1. 登录验证
  if (action === "login") {
    const isValid = await verifyPassword(password, env);
    if (isValid) {
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. 修改密码
  if (action === "change_password") {
    const isValid = await verifyPassword(password, env);
    if (!isValid) return new Response("Unauthorized", { status: 401 });

    try {
      await env.DB.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('admin_password', ?)")
        .bind(newPassword).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  return new Response("Bad Request", { status: 400 });
}
