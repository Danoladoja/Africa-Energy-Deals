/**
 * Trusted domain allowlist for community submission URL validation.
 * Both URLs on this list → normal processing.
 * One or both URLs off this list → needsExtraScrutiny = true (still accepted).
 */

export const TRUSTED_DOMAINS = new Set<string>([
  // Pan-African / Global news
  "reuters.com", "bloomberg.com", "ft.com", "businessday.ng",
  "theafricareport.com", "africabusinesscommunities.com", "energymonitor.ai",
  "pv-tech.org", "renewableenergyworld.com", "windpowermonthly.com",
  "spglobal.com", "platts.com", "energyvoice.com", "moneyweb.co.za",
  "dailymaverick.co.za", "businesstimes.co.za", "bizcommunity.com",
  "premiumtimesng.com", "thecitizen.co.tz", "monitor.co.ug",
  "nation.africa", "standardmedia.co.ke", "capitalfm.co.ke",
  "ghanaweb.com", "myjoyonline.com", "pulse.com.gh",
  "allafrica.com", "africanews.com", "apanews.net",

  // DFIs and MDBs
  "afdb.org", "ifc.org", "worldbank.org", "ebrd.com",
  "proparco.fr", "fmo.nl", "bii.co.uk", "dfc.gov",
  "afreximbank.com", "dbsa.org", "eib.org", "adb.org",
  "opic.gov", "usaid.gov", "kfw.de",

  // Government / Regulatory
  "energy.gov.gh", "energy.go.tz", "energy.go.ke", "dpe.gov.za",
  "nersa.org.za", "reippp.org.za",

  // Academic / Research
  "irena.org", "iea.org", "ren21.net", "climatepolicyinitiative.org",
  "climatefinancelab.org", "energyaccess.org",

  // Wire services
  "prnewswire.com", "globenewswire.com", "businesswire.com",
  "accesswire.com", "apgroup.com",
]);

/**
 * Return the registered domain (e.g. "reuters.com") for a URL.
 */
export function registeredDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return hostname;
  } catch {
    return null;
  }
}

export function isTrustedDomain(url: string): boolean {
  const domain = registeredDomain(url);
  if (!domain) return false;
  if (TRUSTED_DOMAINS.has(domain)) return true;
  for (const d of TRUSTED_DOMAINS) {
    if (domain.endsWith("." + d)) return true;
  }
  return false;
}
