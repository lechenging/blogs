import { getOrigin, getSiteConfig, markdownToHtml, normalizeUrl, renderPostHtml } from "../_shared/seo.js";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const id = params.id;

  if (!id) {
    return new Response("Missing post id", { status: 400 });
  }

  try {
    const post = await env.DB.prepare(`
      SELECT id, title, summary, date, views, category, series, cover, layout_mode, status, weight
      FROM posts
      WHERE id = ? AND status = 'publish'
    `).bind(id).first();

    if (!post) {
      return new Response("Not found", { status: 404 });
    }

    const object = await env.MY_BUCKET.get(`posts/${id}.md`);
    if (!object) {
      return new Response("Post content not found", { status: 404 });
    }

    const markdown = await object.text();
    const origin = getOrigin(request);
    const siteConfig = await getSiteConfig(env);
    const canonicalUrl = normalizeUrl(origin, `/post/${encodeURIComponent(id)}`);
    const html = renderPostHtml({
      post,
      markdownHtml: markdownToHtml(markdown),
      siteConfig,
      canonicalUrl,
      origin
    });

    context.waitUntil(env.DB.prepare("UPDATE posts SET views = views + 1 WHERE id = ?").bind(id).run());

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
