/**
 * URL Validator — validates source URLs before a candidate is written to the DB.
 *
 * Checks performed (in order):
 *  1. Domain diversity — if newsUrl and newsUrl2 share the same domain, null out newsUrl2
 *  2. URL reachability — HEAD request with 5s timeout (disabled via VALIDATE_URLS=false)
 *
 * The URL dedup check (is this URL already in the DB?) is kept inside writeCandidate()
 * because it needs DB access that we want to manage explicitly there.
 */

export interface UrlValidationResult {
  issues: string[];
  cleanedNewsUrl2: string | null | undefined;
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const SKIP_HEAD = process.env.VALIDATE_URLS === "false";

async function checkReachability(url: string): Promise<string | null> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5_000);
    const resp = await fetch(url, {
      method: "HEAD",
      signal: ac.signal,
      redirect: "follow",
      headers: { "User-Agent": "AfriEnergyTracker/1.0 (+https://afrienergytracker.io)" },
    }).finally(() => clearTimeout(timer));

    // 403 and 405 mean the server is alive but blocks HEAD — not a dead URL
    if (![200, 201, 301, 302, 304, 403, 405].includes(resp.status)) {
      return `Primary URL returned ${resp.status}`;
    }
    return null;
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "timed out after 5s" : "unreachable";
    return `Primary URL ${msg}`;
  }
}

export async function validateUrls(newsUrl: string | null, newsUrl2: string | null | undefined): Promise<UrlValidationResult> {
  const issues: string[] = [];
  let cleanedNewsUrl2 = newsUrl2;

  // 1. Domain diversity
  if (newsUrl && newsUrl2) {
    const d1 = extractDomain(newsUrl);
    const d2 = extractDomain(newsUrl2);
    if (d1 && d2 && d1 === d2) {
      cleanedNewsUrl2 = null;
      issues.push("newsUrl2 stripped — same domain as newsUrl");
    }
  }

  // 2. Reachability (optional, off by default in dev/test)
  if (!SKIP_HEAD && newsUrl && isValidUrl(newsUrl)) {
    const reachErr = await checkReachability(newsUrl);
    if (reachErr) issues.push(reachErr);
  }

  return { issues, cleanedNewsUrl2 };
}

function isValidUrl(u: string): boolean {
  try { return /^https?:\/\//i.test(u); } catch { return false; }
}
