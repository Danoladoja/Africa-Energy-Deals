import Parser from "rss-parser";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Proxy fallback for feeds that block direct server requests (403)
const PROXY_URL = "https://api.allorigins.win/raw?url=";

async function fetchFeedWithFallback(feedUrl: string): Promise<string> {
  // First try direct fetch
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) return await res.text();
    if (res.status === 403 || res.status === 401) throw new Error("blocked:" + res.status);
    throw new Error("Status code " + res.status);
  } catch (err: any) {
    // If blocked (403), try via proxy
    if (err.message?.startsWith("blocked:") || err.message?.includes("403")) {
      const proxyRes = await fetch(PROXY_URL + encodeURIComponent(feedUrl), {
        signal: AbortSignal.timeout(25000),
      });
      if (proxyRes.ok) return await proxyRes.text();
      throw new Error("Proxy also failed: " + proxyRes.status);
    }
    throw err;
  }
}

const parser = new Parser({
  timeout: 25000,
  headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "application/rss+xml, application/xml, text/xml, */*",
    },
});

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SOURCE NETWORK Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// skipCountryFilter: true  Ã¢ÂÂ source is Africa-focused; only need energy keyword
// skipCountryFilter: false Ã¢ÂÂ global source; need Africa country mention + energy keyword

interface FeedConfig {
  name: string;
  url: string;
  category: string;
  skipCountryFilter?: boolean;
}

const RSS_FEEDS: FeedConfig[] = [
  // Ã¢ÂÂÃ¢ÂÂ ENERGY-SPECIFIC PUBLICATIONS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  { name: "ESI Africa", url: "https://www.esi-africa.com/feed/", category: "Energy Media", skipCountryFilter: true },
  { name: "PV Magazine Africa", url: "https://www.pv-magazine.com/category/africa/feed/", category: "Energy Media", skipCountryFilter: true },
  { name: "Recharge News", url: "https://www.rechargenews.com/rss", category: "Energy Media" },
  { name: "Energy Monitor", url: "https://www.energymonitor.ai/feed/", category: "Energy Media" },
  { name: "Carbon Brief", url: "https://www.carbonbrief.org/feed/", category: "Energy Media" },
  { name: "Power for All", url: "https://www.powerforall.org/feed/", category: "Energy Media", skipCountryFilter: true },

  // Ã¢ÂÂÃ¢ÂÂ INTERNATIONAL DEVELOPMENT BANKS & AGENCIES Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  { name: "World Bank Energy Blog", url: "https://www.worldbank.org/en/topic/energy/rss.xml", category: "Development Banks" },
  { name: "World Bank Africa Blog", url: "https://www.worldbank.org/en/region/afr/rss.xml", category: "Development Banks", skipCountryFilter: true },
  { name: "AfDB News", url: "https://www.afdb.org/en/rss", category: "Development Banks", skipCountryFilter: true },
  { name: "IFC Press Room", url: "https://pressroom.ifc.org/all/pages/RSS.aspx", category: "Development Banks" },
  { name: "MIGA News", url: "https://www.worldbank.org/en/topic/financialsector/rss.xml", category: "Development Banks", skipCountryFilter: true },
  { name: "EBRD Africa", url: "https://www.ebrd.com/rss/news.html", category: "Development Banks" },

  // Ã¢ÂÂÃ¢ÂÂ INTERNATIONAL ENERGY AGENCIES Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  { name: "IEA News", url: "https://www.iea.org/rss/news.xml", category: "Energy Agencies" },
  { name: "IRENA News", url: "https://www.irena.org/rss", category: "Energy Agencies" },
  { name: "SE4All Insights", url: "https://www.seforall.org/news/rss.xml", category: "Energy Agencies", skipCountryFilter: true },
  { name: "Power Africa (USAID)", url: "https://news.google.com/rss/search?q=power+africa+energy+project&hl=en-US&gl=US&ceid=US:en", category: "Energy Agencies", skipCountryFilter: true },
  { name: "Climate Investment Funds", url: "https://www.climateinvestmentfunds.org/news/rss", category: "Energy Agencies" },

  // Ã¢ÂÂÃ¢ÂÂ FINANCIAL INSTITUTIONS & FUNDS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  { name: "Proparco News", url: "https://www.proparco.fr/en/rss.xml", category: "Financial Institutions" },
  { name: "DFC (US Dev Finance)", url: "https://news.google.com/rss/search?q=DFC+africa+energy+finance&hl=en-US&gl=US&ceid=US:en", category: "Financial Institutions" },
  { name: "Green Climate Fund", url: "https://www.greenclimate.fund/rss.xml", category: "Financial Institutions" },
  { name: "BII (UK Investment)", url: "https://www.bii.co.uk/en/news/rss/", category: "Financial Institutions", skipCountryFilter: true },

  // Ã¢ÂÂÃ¢ÂÂ PAN-AFRICAN BUSINESS & NEWS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  { name: "AllAfrica Energy", url: "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf", category: "Pan-African News", skipCountryFilter: true },
  { name: "The Africa Report", url: "https://www.theafricareport.com/feed/", category: "Pan-African News", skipCountryFilter: true },
  { name: "African Business", url: "https://african.business/feed/", category: "Pan-African News", skipCountryFilter: true },
  { name: "The East African", url: "https://www.theeastafrican.co.ke/tea/rss.xml", category: "Pan-African News", skipCountryFilter: true },
  { name: "African Arguments", url: "https://africanarguments.org/feed/", category: "Pan-African News", skipCountryFilter: true },
  { name: "Reuters Business", url: "https://news.google.com/rss/search?q=africa+energy+investment+deal&hl=en-US&gl=US&ceid=US:en", category: "Pan-African News" },

  // Ã¢ÂÂÃ¢ÂÂ NATIONAL DAILIES: NIGERIA Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  { name: "BusinessDay Nigeria", url: "https://businessday.ng/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "Vanguard (Energy)", url: "https://www.vanguardngr.com/category/energy-power/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "The Punch Nigeria", url: "https://punchng.com/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "ThisDay Live", url: "https://www.thisdaylive.com/index.php/feed/", category: "Nigeria", skipCountryFilter: true },

  // Ã¢ÂÂÃ¢ÂÂ NATIONAL DAILIES: KENYA Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  { name: "Business Daily Africa", url: "https://www.businessdailyafrica.com/rss/", category: "Kenya", skipCountryFilter: true },
  { name: "Daily Nation Kenya", url: "https://nation.africa/kenya/rss.xml", category: "Kenya", skipCountryFilter: true },
  { name: "The Standard Kenya", url: "https://www.standardmedia.co.ke/rss/all", category: "Kenya", skipCountryFilter: true },

  // Ã¢ÂÂÃ¢ÂÂ NATIONAL DAILIES: SOUTH AFRICA Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  { name: "BusinessLive SA", url: "https://www.businesslive.co.za/rss/", category: "South Africa", skipCountryFilter: true },
  { name: "Daily Maverick", url: "https://www.dailymaverick.co.za/feed/", category: "South Africa", skipCountryFilter: true },
  { name: "Engineering News SA", url: "https://www.engineeringnews.co.za/rss", category: "South Africa", skipCountryFilter: true },
  { name: "Fin24 Economy", url: "https://www.news24.com/fin24/economy/rss", category: "South Africa", skipCountryFilter: true },

  // Ã¢ÂÂÃ¢ÂÂ NATIONAL DAILIES: GHANA Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  { name: "Ghana Business News", url: "https://www.ghanabusinessnews.com/feed/", category: "Ghana", skipCountryFilter: true },
  { name: "Graphic Online Ghana", url: "https://www.graphic.com.gh/feed.rss", category: "Ghana", skipCountryFilter: true },

  // Ã¢ÂÂÃ¢ÂÂ NATIONAL DAILIES: ETHIOPIA, TANZANIA, OTHER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  { name: "The Reporter Ethiopia", url: "https://www.thereporterethiopia.com/rss.xml", category: "Ethiopia", skipCountryFilter: true },
  { name: "The Citizen Tanzania", url: "https://www.thecitizen.co.tz/tanzania/rss.xml", category: "Tanzania", skipCountryFilter: true },
  { name: "Egypt Independent", url: "https://egyptindependent.com/feed/", category: "Egypt", skipCountryFilter: true },
  { name: "Morocco World News", url: "https://www.moroccoworldnews.com/feed/", category: "Morocco", skipCountryFilter: true },
  { name: "Eye of Ethiopia", url: "https://borkena.com/feed/", category: "Ethiopia", skipCountryFilter: true },

  // ── EV & CLEAN MOBILITY ─────────────────────────────────────────────────────
  { name: "EV Africa (Google News)", url: "https://news.google.com/rss/search?q=electric+vehicle+africa+investment&hl=en-US&gl=US&ceid=US:en", category: "EV & Mobility" },
  { name: "E-Mobility Africa News", url: "https://news.google.com/rss/search?q=electric+mobility+africa+funding&hl=en-US&gl=US&ceid=US:en", category: "EV & Mobility" },
  { name: "Electric Bus Africa", url: "https://news.google.com/rss/search?q=electric+bus+africa+deal&hl=en-US&gl=US&ceid=US:en", category: "EV & Mobility" },
  { name: "TechCabal", url: "https://techcabal.com/feed/", category: "EV & Mobility", skipCountryFilter: true },
  { name: "Disrupt Africa", url: "https://disrupt-africa.com/feed/", category: "EV & Mobility", skipCountryFilter: true },

  // ── GOVERNMENT & REGULATOR SOURCES (via targeted search) ────────────────────
  { name: "Africa Energy Ministry Announcements", url: "https://news.google.com/rss/search?q=africa+energy+ministry+announcement+project&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "REIPPPP South Africa", url: "https://news.google.com/rss/search?q=REIPPPP+south+africa+renewable+energy+bid+award&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "Nigeria NERC Energy", url: "https://news.google.com/rss/search?q=NERC+nigeria+electricity+license+project+approval&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "Kenya REREC / KETRACO", url: "https://news.google.com/rss/search?q=REREC+OR+KETRACO+kenya+energy+project+2024&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "Ghana Energy Commission", url: "https://news.google.com/rss/search?q=ghana+energy+commission+renewable+project+license&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "Rwanda REG Energy", url: "https://news.google.com/rss/search?q=rwanda+energy+group+REG+solar+project+investment&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "Ethiopia EEP Power", url: "https://news.google.com/rss/search?q=ethiopia+electric+power+hydropower+solar+project&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "Egypt NREA Renewable", url: "https://news.google.com/rss/search?q=NREA+egypt+renewable+energy+project+tender+2024&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "Morocco MASEN Projects", url: "https://news.google.com/rss/search?q=MASEN+morocco+solar+wind+energy+project&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "Senegal CRSE Energy", url: "https://news.google.com/rss/search?q=senegal+energy+project+solar+oil+gas+investment+2024&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "Tanzania TANESCO REA", url: "https://news.google.com/rss/search?q=TANESCO+OR+REA+tanzania+energy+project+solar&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "Zambia ERB Energy", url: "https://news.google.com/rss/search?q=zambia+energy+regulation+board+power+project+solar&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
  { name: "Uganda ERA Electricity", url: "https://news.google.com/rss/search?q=uganda+electricity+regulatory+authority+project+solar&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },

  // ── TARGETED 2023–2026 DEAL SEARCHES ────────────────────────────────────────
  { name: "Africa Solar Deals 2024", url: "https://news.google.com/rss/search?q=africa+solar+energy+deal+investment+2024&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
  { name: "Africa Solar Deals 2025", url: "https://news.google.com/rss/search?q=africa+solar+energy+deal+investment+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
  { name: "Africa Solar Deals 2026", url: "https://news.google.com/rss/search?q=africa+solar+energy+deal+investment+2026&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
  { name: "Africa Wind Energy 2024-25", url: "https://news.google.com/rss/search?q=africa+wind+farm+energy+project+financing+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
  { name: "Africa Hydro Projects 2024", url: "https://news.google.com/rss/search?q=africa+hydropower+dam+project+financing+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
  { name: "Africa Gas LNG 2024-25", url: "https://news.google.com/rss/search?q=africa+gas+LNG+energy+project+investment+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
  { name: "Africa Energy Finance 2024", url: "https://news.google.com/rss/search?q=africa+energy+project+finance+loan+IFC+2024&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
  { name: "Africa Energy Finance 2025", url: "https://news.google.com/rss/search?q=africa+energy+project+finance+loan+AfDB+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
  { name: "Africa Renewable IPP 2024", url: "https://news.google.com/rss/search?q=africa+independent+power+producer+IPP+2024+megawatt&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
  { name: "Africa Mini-Grid Off-Grid 2024", url: "https://news.google.com/rss/search?q=africa+mini-grid+off-grid+electrification+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
  { name: "COP28 COP29 Africa Energy", url: "https://news.google.com/rss/search?q=COP28+COP29+africa+energy+climate+fund+project&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
  { name: "Just Energy Transition Africa", url: "https://news.google.com/rss/search?q=just+energy+transition+africa+JET-P+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },

  // ── MORE LOCAL NEWS OUTLETS ──────────────────────────────────────────────────
  { name: "Premium Times Nigeria", url: "https://www.premiumtimesng.com/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "The Guardian Nigeria", url: "https://guardian.ng/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "Nairametrics Energy", url: "https://nairametrics.com/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "New Telegraph Nigeria", url: "https://www.newtelegraphng.com/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "The Herald Zimbabwe", url: "https://www.herald.co.zw/feed/", category: "Zimbabwe", skipCountryFilter: true },
  { name: "Zambia Daily Mail", url: "https://www.daily-mail.co.zm/feed/", category: "Zambia", skipCountryFilter: true },
  { name: "New Era Namibia", url: "https://neweralive.na/feed/", category: "Namibia", skipCountryFilter: true },
  { name: "Addis Fortune Ethiopia", url: "https://addisfortune.net/feed/", category: "Ethiopia", skipCountryFilter: true },
  { name: "The Independent Uganda", url: "https://www.independent.co.ug/feed/", category: "Uganda", skipCountryFilter: true },
  { name: "Rwanda New Times", url: "https://www.newtimes.co.rw/feed/", category: "Rwanda", skipCountryFilter: true },
  { name: "Senegal Tribune", url: "https://news.google.com/rss/search?q=senegal+energie+solaire+investissement+projet&hl=fr&gl=SN&ceid=SN:fr", category: "Senegal", skipCountryFilter: true },
  { name: "L'Usine Nouvelle Afrique", url: "https://news.google.com/rss/search?q=afrique+energie+solaire+investissement+projet&hl=fr&gl=FR&ceid=FR:fr", category: "Francophone Africa", skipCountryFilter: true },
  { name: "Jeune Afrique Energie", url: "https://www.jeuneafrique.com/feed/", category: "Francophone Africa", skipCountryFilter: true },
  { name: "Cameroon Tribune", url: "https://news.google.com/rss/search?q=cameroun+energie+solaire+projet+investissement&hl=fr&gl=CM&ceid=CM:fr", category: "Cameroon", skipCountryFilter: true },
];

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ RELEVANCE FILTERS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const AFRICA_TERMS = [
  "nigeria", "kenya", "south africa", "ethiopia", "ghana", "tanzania", "egypt",
  "morocco", "mozambique", "senegal", "zambia", "uganda", "rwanda", "cameroon",
  "angola", "namibia", "botswana", "zimbabwe", "malawi", "burkina faso",
  "cÃÂ´te d'ivoire", "ivory coast", "cote d'ivoire", "sudan", "tunisia", "algeria",
  "libya", "drc", "congo", "sierra leone", "gambia", "mauritania", "niger", "chad",
  "somalia", "madagascar", "benin", "togo", "mali", "guinea", "african",
  "sub-saharan", "east africa", "west africa", "north africa", "southern africa",
];

const ENERGY_KEYWORDS = [
  "solar", "wind", "hydro", "geothermal", "energy", "power", "electricity",
  "megawatt", " mw ", "renewable", "gas", "lng", "lpg", "investment", "financing",
  "ipp", "utility", "grid", "power plant", "project finance", "deal", "fund",
  "coal", "oil", "petroleum", "minigrids", "mini-grid", "off-grid",
  "battery", "storage", "transmission", "distribution", "electrification",
  "clean energy", "climate finance", "carbon", "emissions",
  "electric vehicle", "electric bus", "electric motorcycle", "e-mobility",
  "e-moto", "ev charging", "electric mobility", "emobility", "bev", "e-bus",
  "electric fleet", "ev infrastructure", "charging station", "battery swap",
];

const EXCLUDE_KEYWORDS = [
  "obituary", "sports", "fashion", "celebrity", "lifestyle", "entertainment",
  "recipe", "travel guide", "horoscope", "crossword",
];

function isRelevantArticle(item: Parser.Item, feed: FeedConfig): boolean {
  const text = `${item.title ?? ""} ${item.contentSnippet ?? ""}`.toLowerCase();

  if (EXCLUDE_KEYWORDS.some((k) => text.includes(k))) return false;

  const hasEnergy = ENERGY_KEYWORDS.some((k) => text.includes(k));
  if (!hasEnergy) return false;

  if (feed.skipCountryFilter) return true;

  return AFRICA_TERMS.some((t) => text.includes(t));
}

function inferRegion(country: string): string {
  const regions: Record<string, string[]> = {
    "East Africa": ["kenya", "tanzania", "uganda", "rwanda", "ethiopia", "somalia", "mozambique", "madagascar", "malawi", "zambia", "zimbabwe", "burundi", "djibouti", "eritrea"],
    "West Africa": ["nigeria", "ghana", "senegal", "ivory coast", "cÃÂ´te d'ivoire", "cameroon", "sierra leone", "gambia", "mauritania", "niger", "mali", "burkina faso", "benin", "togo", "guinea", "liberia"],
    "North Africa": ["egypt", "morocco", "tunisia", "algeria", "libya", "sudan"],
    "Southern Africa": ["south africa", "botswana", "namibia", "angola", "lesotho", "swaziland", "eswatini"],
    "Central Africa": ["drc", "congo", "chad", "central african"],
  };
  const lower = country.toLowerCase();
  for (const [region, countries] of Object.entries(regions)) {
    if (countries.some((c) => lower.includes(c))) return region;
  }
  return "Africa";
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ OPENAI EXTRACTION Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const SYSTEM_PROMPT = `You are an expert analyst specialising in Africa energy investment and project finance.
Extract structured investment deal data from news article summaries.

PRIORITY: Articles from 2023, 2024, 2025, and 2026 are especially valuable — extract all qualifying deals from these years thoroughly.

Only extract articles that describe:
- Specific energy project announcements (solar farms, wind parks, hydro, gas plants, battery storage, mini-grids, etc.)
- Investment / financing / lending deals (loans, equity, grants, PPAs, bond issuances)
- Government energy procurement, tender awards, or regulatory approvals for African energy projects
- Development bank / fund disbursements or approvals for African energy projects (AfDB, IFC, World Bank, DFC, Proparco, BII, etc.)
- COP28/COP29 climate finance commitments linked to specific African energy projects
- Just Energy Transition Partnership (JET-P) funded projects in African countries

Skip: opinion pieces, general policy commentary, energy price news, fuel subsidies unless linked to a specific named project, duplicate projects already in the batch.

Return a JSON array where each object has:
- projectName: string Ã¢ÂÂ specific, unique project name (e.g. "Lake Turkana Wind Power Phase 2"); never generic
- country: string Ã¢ÂÂ African country name only
- region: string Ã¢ÂÂ one of: "East Africa", "West Africa", "North Africa", "Southern Africa", "Central Africa"
- technology: string Ã¢ÂÂ one of: "Solar", "Wind", "Hydro", "Geothermal", "Natural Gas", "Oil", "EV", "Battery Storage", "Transmission", "Mini-Grid", "Other Renewables"
- dealSizeUsdMn: number | null Ã¢ÂÂ deal/investment value in USD millions; null if not stated
- investors: string | null Ã¢ÂÂ comma-separated lenders, equity investors, donors, or development banks
- status: string Ã¢ÂÂ one of: "announced", "under construction", "financing closed", "operational", "tender"
- description: string Ã¢ÂÂ 2Ã¢ÂÂ3 factual sentences covering what the project is, who is involved, and its significance
- capacityMw: number | null Ã¢ÂÂ generation or storage capacity in MW; null if not stated
- announcedYear: number | null Ã¢ÂÂ year of announcement or deal closure
- sourceUrl: string | null Ã¢ÂÂ full URL of the article
- newsUrl: string | null Ã¢ÂÂ same value as sourceUrl

Return ONLY a valid JSON array. No markdown fences, no explanation outside the array.`;

async function extractProjectsFromBatch(
  articles: Array<Parser.Item & { feedName: string }>,
): Promise<Record<string, unknown>[]> {
  if (articles.length === 0) return [];

  const articlesSummary = articles
    .map(
      (item, i) =>
        `[${i + 1}] Title: ${item.title ?? "Untitled"}\nSource: ${item.feedName}\nURL: ${item.link ?? ""}\nDate: ${item.pubDate ?? "Unknown"}\nSummary: ${(item.contentSnippet ?? "").slice(0, 500)}`,
    )
    .join("\n\n---\n\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Extract Africa energy investment projects from these articles:\n\n${articlesSummary}`,
      },
    ],
  });

  const block = message.content[0];
  const rawContent = block.type === "text" ? block.text : "[]";

  try {
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as Record<string, unknown>[];
  } catch {
    // ignore parse errors
  }
  return [];
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ STATE Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
export interface ScraperProgress {
  stage: "fetching" | "analyzing" | "saving" | "done" | "error";
  message: string;
  processed?: number;
  discovered?: number;
  feedsTotal?: number;
  feedsDone?: number;
}

export interface ScraperResult {
  processed: number;
  discovered: number;
  feedsReached: number;
  feedsFailed: number;
  errors: string[];
  runAt: Date;
}

let lastRunAt: Date | null = null;
let lastResult: ScraperResult | null = null;
let isRunning = false;

export function getScraperStatus() {
  return { lastRunAt, isRunning, lastResult };
}

export function getFeedList() {
  return RSS_FEEDS.map((f) => ({ name: f.name, category: f.category }));
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ MAIN RUNNER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
export async function runScraper(
  onProgress?: (p: ScraperProgress) => void,
): Promise<ScraperResult> {
  if (isRunning) throw new Error("Scraper is already running");
  isRunning = true;

  const result: ScraperResult = {
    processed: 0,
    discovered: 0,
    feedsReached: 0,
    feedsFailed: 0,
    errors: [],
    runAt: new Date(),
  };

  try {
    onProgress?.({
      stage: "fetching",
      message: `Starting scan across ${RSS_FEEDS.length} sources...`,
      feedsTotal: RSS_FEEDS.length,
      feedsDone: 0,
    });

    const existing = await db
      .select({ projectName: projectsTable.projectName })
      .from(projectsTable);
    const existingNames = new Set(existing.map((p) => p.projectName.toLowerCase()));

    const relevantArticles: Array<Parser.Item & { feedName: string }> = [];
    let feedsDone = 0;

    for (const feed of RSS_FEEDS) {
      try {
        let parsed;
        try {
          parsed = await parser.parseURL(feed.url);
        } catch (directErr: any) {
          // If blocked (403), try fetching via proxy and parse the string
          if (directErr.message?.includes("Status code 403") || directErr.message?.includes("403") || directErr.message?.includes("401")) {
            const xmlText = await fetchFeedWithFallback(feed.url);
            parsed = await parser.parseString(xmlText);
          } else {
            throw directErr;
          }
        }
        const relevant = parsed.items.filter((item) => isRelevantArticle(item, feed)).slice(0, 3);
        relevantArticles.push(...relevant.map((item) => ({ ...item, feedName: feed.name })));
        result.feedsReached++;
        feedsDone++;
        if (relevant.length > 0) {
          onProgress?.({
            stage: "fetching",
            message: `Ã¢ÂÂ ${feed.name} [${feed.category}]: ${relevant.length} article${relevant.length !== 1 ? "s" : ""}`,
            feedsTotal: RSS_FEEDS.length,
            feedsDone,
          });
        }
      } catch (err) {
        result.feedsFailed++;
        feedsDone++;
        const msg = `Ã¢ÂÂ ${feed.name}: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`;
        result.errors.push(msg);
        onProgress?.({ stage: "fetching", message: msg, feedsTotal: RSS_FEEDS.length, feedsDone });
      }
    }

    result.processed = relevantArticles.length;

    if (relevantArticles.length === 0) {
      onProgress?.({ stage: "done", message: "Scan complete Ã¢ÂÂ no new relevant articles found.", discovered: 0 });
      lastRunAt = new Date();
      lastResult = result;
      return result;
    }

    // Process in batches of 15 articles to manage token limits
    const BATCH_SIZE = 15;
    const batches: Array<typeof relevantArticles> = [];
    for (let i = 0; i < relevantArticles.length; i += BATCH_SIZE) {
      batches.push(relevantArticles.slice(i, i + BATCH_SIZE));
    }

    onProgress?.({
      stage: "analyzing",
      message: `Analysing ${relevantArticles.length} articles across ${batches.length} batch${batches.length !== 1 ? "es" : ""} with Claude Sonnet...`,
    });

    const allProjects: Record<string, unknown>[] = [  // ââ AGGREGATOR FALLBACKS (always available) ââââââââââââââââââââââââââââââ
  { name: "Google News - Africa Energy", url: "https://news.google.com/rss/search?q=africa+energy+investment+renewable&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
  { name: "Google News - Africa Solar Wind", url: "https://news.google.com/rss/search?q=africa+solar+OR+wind+power+project&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
  { name: "Google News - AfDB IFC Energy", url: "https://news.google.com/rss/search?q=AfDB+OR+IFC+OR+%22World+Bank%22+africa+energy&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
  { name: "Google News - Africa Energy Deals", url: "https://news.google.com/rss/search?q=%22energy+deal%22+OR+%22power+project%22+OR+%22solar+farm%22+africa&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
  { name: "Google News - Africa Renewable Finance", url: "https://news.google.com/rss/search?q=africa+%22renewable+energy%22+%22financing%22+OR+%22investment%22+OR+%22funding%22&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
  { name: "Google News - Africa Wind Solar Hydro", url: "https://news.google.com/rss/search?q=africa+%22wind+farm%22+OR+%22solar+plant%22+OR+%22hydropower%22+OR+%22battery+storage%22&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
  { name: "Google News - Africa Oil Gas LNG", url: "https://news.google.com/rss/search?q=africa+%22oil+and+gas%22+OR+%22LNG%22+OR+%22pipeline%22+investment+OR+deal&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
  { name: "Google News - DFI Africa Energy", url: "https://news.google.com/rss/search?q=%22IFC%22+OR+%22AfDB%22+OR+%22World+Bank%22+OR+%22EBRD%22+africa+energy+project&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
  { name: "Google News - Africa Green Hydrogen", url: "https://news.google.com/rss/search?q=africa+%22green+hydrogen%22+OR+%22hydrogen+project%22+OR+%22ammonia+plant%22&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
];
    for (let b = 0; b < batches.length; b++) {
      onProgress?.({
        stage: "analyzing",
        message: `AI batch ${b + 1}/${batches.length}: processing ${batches[b].length} articles...`,
      });
      try {
        const extracted = await extractProjectsFromBatch(batches[b]);
        allProjects.push(...extracted);
      } catch (err) {
        result.errors.push(`AI batch ${b + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    onProgress?.({
      stage: "saving",
      message: `AI identified ${allProjects.length} candidate project${allProjects.length !== 1 ? "s" : ""}. Saving new ones...`,
    });

    for (const project of allProjects) {
      const name = String(project.projectName ?? "").trim();
      const country = String(project.country ?? "").trim();
      if (!name || !country || name.length < 5) continue;
      if (existingNames.has(name.toLowerCase())) continue;

      try {
        await db.insert(projectsTable).values({
          projectName: name,
          country,
          region: String(project.region ?? inferRegion(country)),
          technology: String(project.technology ?? "Other Renewables"),
          dealSizeUsdMn: typeof project.dealSizeUsdMn === "number" ? project.dealSizeUsdMn : null,
          investors: typeof project.investors === "string" ? project.investors : null,
          status: String(project.status ?? "announced"),
          description: typeof project.description === "string" ? project.description : null,
          capacityMw: typeof project.capacityMw === "number" ? project.capacityMw : null,
          announcedYear: typeof project.announcedYear === "number" ? project.announcedYear : new Date().getFullYear(),
          closedYear: null,
          latitude: null,
          longitude: null,
          sourceUrl: typeof project.sourceUrl === "string" ? project.sourceUrl : null,
          newsUrl: typeof project.newsUrl === "string" ? project.newsUrl : null,
          isAutoDiscovered: true,
          reviewStatus: "pending",
          discoveredAt: new Date(),
        });
        existingNames.add(name.toLowerCase());
        result.discovered++;
      } catch (err) {
        result.errors.push(
          `Insert failed for "${name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    onProgress?.({
      stage: "done",
      message: `Scan complete Ã¢ÂÂ ${result.discovered} new deal${result.discovered !== 1 ? "s" : ""} discovered from ${result.processed} articles across ${result.feedsReached} source${result.feedsReached !== 1 ? "s" : ""}.`,
      processed: result.processed,
      discovered: result.discovered,
    });

    lastRunAt = new Date();
    lastResult = result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    onProgress?.({ stage: "error", message: `Scraper error: ${msg}` });
  } finally {
    isRunning = false;
  }

  return result;
}

