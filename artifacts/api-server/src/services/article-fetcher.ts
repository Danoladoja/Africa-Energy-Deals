/**
 * Article Text Fetcher (Idea 1 — Full-Article Deep Extraction)
 *
 * Fetches the full HTML of an article page, extracts the readable text,
 * and returns it for use in the LLM extraction prompt.
 *
 * This dramatically improves extraction quality for RSS/news adapters,
 * where the feed only provides a 1-2 sentence snippet but the article
 * body contains project name, country, developer, capacity, deal size,
 * status, financiers, and more.
 *
 * Design decisions:
 *  - 10-second timeout (articles should load fast)
 *  - 500KB HTML size limit (prevent memory issues from huge pages)
 *  - Extracts <article>, <main>, or <body> content in that priority order
 *  - Strips scripts, styles, nav, footer, ads
 *  - Returns null on any failure (caller falls back to snippet)
 *  - Caches results in-memory to avoid re-fetching during retries
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 500_000;
const MAX_TEXT_CHARS = 8_000; // LLM context budget — truncate after this

// Simple in-memory cache with 30-minute TTL
const _articleCache = new Map<string, { text: string | null; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Fetch and extract readable text from an article URL.
 * Returns null on any failure — the caller should fall back to snippet-based extraction.
 */
export async function fetchArticleText(url: string): Promise<string | null> {
  if (!url || !url.startsWith("http")) return null;

  // Check cache
  const cached = _articleCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.text;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AfriEnergyTracker/1.0 (+https://afrienergytracker.io)",
        "Accept": "text/html, application/xhtml+xml, */*",
      },
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!response.ok) {
      _articleCache.set(url, { text: null, fetchedAt: Date.now() });
      return null;
    }

    // Check content type — only process HTML
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("xhtml")) {
      _articleCache.set(url, { text: null, fetchedAt: Date.now() });
      return null;
    }

    // Read body with size limit
    const reader = response.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_HTML_BYTES) {
        reader.cancel();
        break;
      }
      chunks.push(value);
    }

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const html = decoder.decode(Buffer.concat(chunks));

    const text = extractReadableText(html);
    const result = text && text.length > 50 ? text.slice(0, MAX_TEXT_CHARS) : null;

    _articleCache.set(url, { text: result, fetchedAt: Date.now() });
    return result;
  } catch {
    _articleCache.set(url, { text: null, fetchedAt: Date.now() });
    return null;
  }
}

/**
 * Extract readable text from raw HTML.
 *
 * Uses simple regex-based extraction (no heavy DOM parser dependency).
 * Priority order: <article> → <main> → <body>.
 * Strips <script>, <style>, <nav>, <footer>, <header>, <aside>.
 */
function extractReadableText(html: string): string {
  // 1. Try to find the best content container
  let content = extractTag(html, "article")
    ?? extractTag(html, "main")
    ?? extractTag(html, "body")
    ?? html;

  // 2. Remove unwanted blocks
  content = content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // 3. Strip remaining HTML tags
  content = content.replace(/<[^>]+>/g, " ");

  // 4. Decode common HTML entities
  content = content
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ");

  // 5. Clean up whitespace
  content = content
    .replace(/\s+/g, " ")
    .trim();

  return content;
}

/**
 * Extract content between opening and closing tags for a given tag name.
 * Returns the inner content of the first match, or null if not found.
 */
function extractTag(html: string, tag: string): string | null {
  const openRe = new RegExp(`<${tag}[^>]*>`, "i");
  const closeRe = new RegExp(`</${tag}>`, "i");

  const openMatch = html.match(openRe);
  if (!openMatch) return null;

  const startIdx = openMatch.index! + openMatch[0].length;
  const closeMatch = html.slice(startIdx).match(closeRe);
  if (!closeMatch) return null;

  return html.slice(startIdx, startIdx + closeMatch.index!);
}
