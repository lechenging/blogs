async function verifyPassword(password, env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM config WHERE key = 'admin_password'").first();
    if (row && row.value) return password === row.value;
  } catch (e) {}
  return password === env.ADMIN_PASSWORD;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization");

  if (!(await verifyPassword(authHeader, env))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { id } = await request.json();

    // === 【核心逻辑：自动清理图片】===
    // A. 尝试从 R2 获取原 Markdown 文本内容
    const mdKey = `posts/${id}.md`;
    const r2Object = await env.MY_BUCKET.get(mdKey);
    
    if (r2Object) {
      const mdText = await r2Object.text();

      // 1. 优先：从 D1 数据库中动态获取配置好的 R2 域名
      let r2Domain = "";
      try {
        const row = await env.DB.prepare("SELECT value FROM config WHERE key = 'site_r2_domain'").first();
        if (row && row.value && row.value !== "undefined" && row.value !== "null") {
          r2Domain = row.value.trim();
        }
      } catch (dbErr) {
        // 数据库异常
      }

      // 2. 备选：如果 D1 为空，则尝试读取原环境变量
      if (!r2Domain && env.R2_CUSTOM_DOMAIN && env.R2_CUSTOM_DOMAIN !== "undefined" && env.R2_CUSTOM_DOMAIN !== "null") {
        r2Domain = env.R2_CUSTOM_DOMAIN;
      }

      // 3. 剥离域名中的协议头与多余路径，确保其为纯域名格式 (例如：images.blogs.nyc.mn)
      let r2DomainHost = r2Domain;
      if (r2DomainHost) {
        r2DomainHost = r2DomainHost.replace(/^https?:\/\//i, ""); // 去掉 http:// 或 https://
        r2DomainHost = r2DomainHost.split('/')[0];               // 去掉可能残留的末尾路径及斜杠
      }

      // 4. 只有在成功获取到域名的情况下，才执行正则匹配并物理删除图片
      if (r2DomainHost && r2DomainHost !== "undefined" && r2DomainHost !== "null") {
        const r2DomainEscaped = r2DomainHost.replace(/\./g, '\\.');
        const imgRegex = new RegExp(`https://${r2DomainEscaped}/([^\\)\\s\\?]+)`, "g");
        
        let match;
        while ((match = imgRegex.exec(mdText)) !== null) {
          const fileName = match[1];
          // 排除存储在虚拟目录 posts/ 下的文章本身，只删除直接上传在根目录的图片对象
          if (fileName && !fileName.startsWith("posts/")) {
            try {
              await env.MY_BUCKET.delete(fileName); // 从 R2 物理销毁图片
            } catch (delErr) {
              // 容错处理：即使个别图片删除失败，也不阻碍整篇文章的删除流程
            }
          }
        }
      }
    }

    // B. 从 D1 数据库批量删除索引元数据与该文章评论，避免正文已删但索引仍存在。
    await env.DB.batch([
      env.DB.prepare("DELETE FROM comments WHERE post_id = ?").bind(id),
      env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id)
    ]);

    // C. 从 R2 删除 Markdown 文章文件本身
    await env.MY_BUCKET.delete(mdKey);

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
