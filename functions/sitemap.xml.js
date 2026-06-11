import { escapeXml, getOrigin, normalizeUrl } from "./_shared/seo.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = getOrigin(request);

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, date
      FROM posts
      WHERE status = 'publish'
      ORDER BY weight DESC, date DESC
    `).all();

    const urls = [
      `<url><loc>${escapeXml(normalizeUrl(origin, "/"))}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...results.map(post => {
        const loc = normalizeUrl(origin, `/post/${encodeURIComponent(post.id)}`);
        const lastmod = post.date ? `<lastmod>${escapeXml(post.date)}</lastmod>` : "";
        return `<url><loc>${escapeXml(loc)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.8</priority></url>`;
      })
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
