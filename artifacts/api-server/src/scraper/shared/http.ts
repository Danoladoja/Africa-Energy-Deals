/**
 * Fetch with retry, ETag/If-Modified-Since cache, and per-host rate limiting.
 * Extracted from the old BaseSourceAdapter so adapters can use it as a plain
 * function instead of inheriting it.
 */

const DEFAULT_USER_AGENT = "AfriEnergyTracker/1.0 (+https://afrienergytracker.io)";

interface CacheEntry {
  etag?: string;
  lastModified?: string;
  fetchedAt: number;
}

interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

const _cache = new Map<string, CacheEntry>();
const _limiters = new Map<string, RateLimiterState>();

function getHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function consumeToken(host: string, maxRps: number): boolean {
  const now = Date.now();
  let state = _limiters.get(host);
  if (!state) {
    state = { tokens: maxRps, lastRefill: now };
    _limiters.set(host, state);
  }
  const elapsed = (now - state.lastRefill) / 1000;
  state.tokens = Math.min(maxRps, state.tokens + elapsed * maxRps);
  state.lastRefill = now;
  if (state.tokens >= 1) {
    state.tokens -= 1;
    return true;
  }
  return false;
}

async function waitForToken(host: string, maxRps: number): Promise<void> {
  while (!consumeToken(host, maxRps)) {
    await new Promise((r) => setTimeout(r, Math.ceil(1000 / maxRps)));
  }
}

export interface FetchOptions {
  maxRetries?: number;
  /** Per-host requests/sec budget. Default 2. */
  maxRps?: number;
  /** Override request headers (merged on top of defaults). */
  headers?: Record<string, string>;
  /** Send If-None-Match / If-Modified-Since based on prior responses. Default true. */
  useCache?: boolean;
  /** Request timeout in ms. Default 30 000. */
  timeoutMs?: number;
  /** HTTP method. Default GET. */
  method?: string;
}

export interface FetchResult {
  body: string;
  status: number;
  /** True if the server returned 304 Not Modified. */
  fromCache: boolean;
}

/**
 * Fetch a URL with retry, exponential back-off, ETag/Last-Modified caching,
 * and per-host token-bucket rate limiting. Returns the body as text.
 *
 * Throws on non-2xx after all retries.
 * Returns `{ body: "", status: 304, fromCache: true }` when the cached
 * representation is still fresh — callers should skip processing in that case.
 */
export async function fetchWithRetry(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const maxRetries = opts.maxRetries ?? 3;
  const maxRps = opts.maxRps ?? 2;
  const useCache = opts.useCache ?? true;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const method = opts.method ?? "GET";

  const host = getHost(url);
  await waitForToken(host, maxRps);

  const headers: Record<string, string> = {
    "User-Agent": DEFAULT_USER_AGENT,
    "Accept": "application/json, text/xml, application/rss+xml, text/html, */*",
    ...(opts.headers ?? {}),
  };

  if (useCache) {
    const cached = _cache.get(url);
    if (cached?.etag) headers["If-None-Match"] = cached.etag;
    if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;
  }

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(500 * 2 ** (attempt - 1) + Math.random() * 200, 8000);
      await new Promise((r) => setTimeout(r, backoff));
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { method, headers, signal: controller.signal });
      clearTimeout(timer);

      if (res.status === 304) {
        return { body: "", status: 304, fromCache: true };
      }

      if (res.ok) {
        const etag = res.headers.get("etag") ?? undefined;
        const lastModified = res.headers.get("last-modified") ?? undefined;
        if (useCache && (etag || lastModified)) {
          _cache.set(url, { etag, lastModified, fetchedAt: Date.now() });
        }
        const body = await res.text();
        return { body, status: res.status, fromCache: false };
      }

      // 5xx → retry; 4xx → fail fast
      if (res.status >= 500 && attempt < maxRetries - 1) {
        lastErr = new Error(`HTTP ${res.status} from ${url}`);
        continue;
      }
      throw new Error(`HTTP ${res.status} from ${url}`);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        lastErr = new Error(`Timeout fetching ${url}`);
      } else {
        lastErr = err instanceof Error ? err : new Error(String(err));
      }
      if (attempt === maxRetries - 1) throw lastErr;
    }
  }
  throw lastErr ?? new Error(`Failed to fetch ${url}`);
}
