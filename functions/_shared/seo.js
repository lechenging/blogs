const DEFAULT_SITE_TITLE = "miai.de5.net";
const DEFAULT_SITE_SUBTITLE = "AI，让思考发声！";

export function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

export function escapeXml(value) {
  return String(value || "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&apos;",
    '"': "&quot;"
  }[char]));
}

export function getOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function normalizeUrl(origin, path) {
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function getSiteConfig(env) {
  const defaults = {
    site_title: DEFAULT_SITE_TITLE,
    site_subtitle: DEFAULT_SITE_SUBTITLE,
    site_r2_domain: ""
  };

  try {
    const rows = await env.DB.prepare(`
      SELECT key, value FROM config
      WHERE key IN ('site_title', 'site_subtitle', 'site_r2_domain')
    `).all();

    const config = { ...defaults };
    rows.results.forEach(row => {
      config[row.key] = row.value;
    });

    if (!config.site_r2_domain && env.R2_PUBLIC_DOMAIN) {
      config.site_r2_domain = env.R2_PUBLIC_DOMAIN;
    }

    return config;
  } catch (err) {
    return defaults;
  }
}

export function buildDescription(post, fallback) {
  const raw = post.summary || fallback || "";
  return String(raw).replace(/\s+/g, " ").trim().slice(0, 160);
}

export function markdownToHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listItems = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    html.push(`<ul>${listItems.map(item => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    listItems = [];
  };

  const flushCode = () => {
    const langClass = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : "";
    html.push(`<pre><code${langClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
    codeLang = "";
  };

  for (const line of lines) {
    const codeMatch = line.match(/^```\s*([^\s`]*)/);
    if (codeMatch) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
        codeLang = codeMatch[1] || "";
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    const list = line.match(/^[-*+]\s+(.+)$/);
    if (list) {
      flushParagraph();
      listItems.push(list[1]);
      continue;
    }

    paragraph.push(line.trim());
  }

  if (inCode) flushCode();
  flushParagraph();
  flushList();
  return html.join("\n");
}

function inlineMarkdown(value) {
  let text = escapeHtml(value);
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return text;
}

export function renderPostHtml({ post, markdownHtml, siteConfig, canonicalUrl, origin }) {
  const siteTitle = siteConfig.site_title || DEFAULT_SITE_TITLE;
  const description = buildDescription(post, siteConfig.site_subtitle);
  const title = `${post.title || "未命名文章"} - ${siteTitle}`;
  const imageUrl = post.cover || `${origin}/assets/logo.svg`;
  const publishedTime = post.date ? `${post.date}T00:00:00+08:00` : "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title || siteTitle,
    description,
    image: imageUrl,
    datePublished: publishedTime || undefined,
    dateModified: publishedTime || undefined,
    author: { "@type": "Person", name: siteTitle },
    publisher: {
      "@type": "Organization",
      name: siteTitle,
      logo: { "@type": "ImageObject", url: `${origin}/assets/logo.svg` }
    },
    mainEntityOfPage: canonicalUrl
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(post.title || siteTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  ${publishedTime ? `<meta property="article:published_time" content="${escapeHtml(publishedTime)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(post.title || siteTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
  <style>
    :root{--semi-blue:#0064fa;--semi-blue-light:#e8f3ff;--semi-text-0:#1c1f23;--semi-text-1:#4e5969;--semi-border:#e5e6eb;--semi-fill:#f7f8fa;}
    body{margin:0;background:linear-gradient(180deg,#f7f8fa 0%,#fff 48%,#f7f8fa 100%);color:var(--semi-text-0);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.75;}
    .wrap{max-width:960px;margin:0 auto;padding:28px 20px 64px;}
    .nav{display:flex;align-items:center;gap:12px;margin-bottom:28px;color:var(--semi-text-1);font-size:13px;}
    .nav img{width:34px;height:34px;border-radius:10px;box-shadow:0 8px 18px rgba(0,100,250,.18);}
    .card{background:rgba(255,255,255,.92);border:1px solid var(--semi-border);border-radius:24px;box-shadow:0 18px 48px rgba(28,31,35,.08);overflow:hidden;}
    header{padding:34px 34px 22px;border-bottom:1px solid var(--semi-border);}
    h1{font-size:clamp(28px,5vw,46px);line-height:1.15;margin:14px 0 14px;letter-spacing:-.04em;}
    .summary{color:var(--semi-text-1);font-size:15px;margin:0;}
    .meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;color:#86909c;font-size:12px;font-weight:600;}
    .tag{display:inline-flex;border-radius:999px;background:var(--semi-blue-light);color:var(--semi-blue);padding:4px 10px;font-size:11px;font-weight:800;}
    .cover{width:100%;max-height:460px;object-fit:cover;display:block;border-bottom:1px solid var(--semi-border);}
    article{padding:30px 34px 42px;}
    article h2,article h3,article h4{line-height:1.3;margin-top:2em;letter-spacing:-.02em;}
    article a{color:var(--semi-blue);}
    article img{max-width:100%;border-radius:14px;border:1px solid var(--semi-border);}
    article blockquote{margin:1.5em 0;padding:12px 16px;border-left:4px solid var(--semi-blue);background:var(--semi-blue-light);color:var(--semi-text-1);border-radius:0 12px 12px 0;}
    article code{background:var(--semi-fill);color:var(--semi-blue);border-radius:5px;padding:2px 6px;font-size:.9em;}
    article pre{overflow:auto;background:#111827;color:#e5e7eb;border-radius:14px;padding:18px;}
    article pre code{background:transparent;color:inherit;padding:0;}
    .footer{margin-top:28px;text-align:center;color:#86909c;font-size:12px;}
    @media(max-width:640px){header,article{padding-left:20px;padding-right:20px}.wrap{padding-left:12px;padding-right:12px}}
  </style>
</head>
<body>
  <main class="wrap">
    <a class="nav" href="/" aria-label="返回首页"><img src="/assets/logo.svg" alt="${escapeHtml(siteTitle)} 标识"><span>${escapeHtml(siteTitle)}</span></a>
    <div class="card">
      <header>
        <div><span class="tag">${escapeHtml(post.category || "未分类")}</span></div>
        <h1>${escapeHtml(post.title || "未命名文章")}</h1>
        ${description ? `<p class="summary">${escapeHtml(description)}</p>` : ""}
        <div class="meta"><span>${escapeHtml(post.date || "")}</span><span>${escapeHtml(post.series || "默认系列")}</span><span>${Number(post.views || 0)} 阅读</span></div>
      </header>
      ${post.cover ? `<img class="cover" src="${escapeHtml(post.cover)}" alt="${escapeHtml(post.title || "文章封面")}">` : ""}
      <article>${markdownHtml}</article>
    </div>
    <div class="footer">Powered by ${escapeHtml(siteTitle)}</div>
  </main>
</body>
</html>`;
}
