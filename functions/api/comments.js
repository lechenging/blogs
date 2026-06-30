async function verifyPassword(password, env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM config WHERE key = 'admin_password'").first();
    if (row && row.value) return password === row.value;
  } catch (e) {}
  return password === env.ADMIN_PASSWORD;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function createCommentId() {
  return `c_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "GET") {
    const isAdminQuery = url.searchParams.get("admin") === "true";
    const isAdmin = isAdminQuery
      ? await verifyPassword(request.headers.get("Authorization"), env)
      : false;

    if (isAdminQuery && !isAdmin) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      if (isAdminQuery) {
        const status = url.searchParams.get("status") || "pending";
        const allowedStatuses = ["pending", "approved", "hidden"];
        if (!allowedStatuses.includes(status)) {
          return new Response("Invalid status", { status: 400 });
        }

        const { results } = await env.DB.prepare(`
          SELECT c.id, c.post_id, c.parent_id, c.author, c.email, c.website, c.content, c.status, c.created_at,
                 p.title AS post_title
          FROM comments c
          LEFT JOIN posts p ON p.id = c.post_id
          WHERE c.status = ?
          ORDER BY c.created_at DESC
          LIMIT 100
        `).bind(status).all();
        return jsonResponse(results || []);
      }

      const postId = normalizeText(url.searchParams.get("post_id"), 120);
      if (!postId) return new Response("Missing post_id", { status: 400 });

      const { results } = await env.DB.prepare(`
        SELECT id, post_id, parent_id, author, website, content, created_at
        FROM comments
        WHERE post_id = ?
          AND status = 'approved'
          AND (
            parent_id = ''
            OR parent_id IN (
              SELECT id FROM comments
              WHERE post_id = ? AND status = 'approved' AND parent_id = ''
            )
          )
        ORDER BY created_at ASC
      `).bind(postId, postId).all();
      return jsonResponse(results || []);
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  if (request.method === "POST") {
    try {
      let body;
      try {
        body = await request.json();
      } catch (err) {
        return new Response("Invalid JSON", { status: 400 });
      }

      if (body.action === "moderate") {
        const authHeader = request.headers.get("Authorization");
        if (!(await verifyPassword(authHeader, env))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const id = normalizeText(body.id, 80);
        const status = normalizeText(body.status, 20);
        const allowedStatuses = ["pending", "approved", "hidden"];
        if (!id || !allowedStatuses.includes(status)) {
          return new Response("Bad Request", { status: 400 });
        }

        if (status === "approved") {
          const comment = await env.DB.prepare("SELECT parent_id FROM comments WHERE id = ?").bind(id).first();
          if (!comment) return new Response("Comment not found", { status: 404 });
          if (comment.parent_id) {
            const parent = await env.DB.prepare("SELECT id FROM comments WHERE id = ? AND status = 'approved' AND parent_id = ''").bind(comment.parent_id).first();
            if (!parent) return new Response("Parent comment is not approved", { status: 400 });
          }
        }

        if (status === "hidden") {
          await env.DB.batch([
            env.DB.prepare("UPDATE comments SET status = 'hidden' WHERE parent_id = ?").bind(id),
            env.DB.prepare("UPDATE comments SET status = 'hidden' WHERE id = ?").bind(id)
          ]);
          return jsonResponse({ success: true });
        }

        await env.DB.prepare("UPDATE comments SET status = ? WHERE id = ?").bind(status, id).run();
        return jsonResponse({ success: true });
      }

      if (body.action === "delete") {
        const authHeader = request.headers.get("Authorization");
        if (!(await verifyPassword(authHeader, env))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const id = normalizeText(body.id, 80);
        if (!id) return new Response("Bad Request", { status: 400 });

        await env.DB.batch([
          env.DB.prepare("DELETE FROM comments WHERE parent_id = ?").bind(id),
          env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id)
        ]);
        return jsonResponse({ success: true });
      }

      const postId = normalizeText(body.post_id, 120);
      const parentId = normalizeText(body.parent_id, 80);
      const author = normalizeText(body.author, 40);
      const email = normalizeText(body.email, 120);
      const website = normalizeText(body.website, 160);
      const content = normalizeText(body.content, 1200);

      if (!postId || !author || !content) {
        return new Response("Missing required fields", { status: 400 });
      }

      const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ? AND status = 'publish'").bind(postId).first();
      if (!post) return new Response("Post not found", { status: 404 });

      if (parentId) {
        const parent = await env.DB.prepare(`
          SELECT id FROM comments
          WHERE id = ? AND post_id = ? AND status = 'approved' AND parent_id = ''
        `).bind(parentId, postId).first();
        if (!parent) return new Response("Parent comment not found", { status: 400 });
      }

      await env.DB.prepare(`
        INSERT INTO comments (id, post_id, parent_id, author, email, website, content, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).bind(
        createCommentId(),
        postId,
        parentId,
        author,
        email,
        website,
        content,
        new Date().toISOString()
      ).run();

      return jsonResponse({ success: true, status: "pending" });
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}
