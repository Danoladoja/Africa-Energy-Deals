import { useState } from "react";
import {
  Code2, Key, Zap, ChevronDown, ChevronRight, Check, Copy,
  ExternalLink, Terminal, BookOpen, Shield, ArrowRight,
  Globe, BarChart2, Users, Database, Activity,
} from "lucide-react";
import { Layout } from "@/components/layout";

const BASE = "https://afrienergytracker.io/api";
const DEV_BASE = "/api";

type Lang = "curl" | "python" | "javascript";

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  desc: string;
  auth?: boolean;
  params?: { name: string; type: string; required?: boolean; desc: string; example?: string }[];
  body?: Record<string, unknown>;
  responseExample?: unknown;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET", path: "/deals",
    desc: "List energy investment deals with full filtering support.",
    params: [
      { name: "country",     type: "string",  desc: "Filter by country (partial match)",             example: "Nigeria" },
      { name: "region",      type: "string",  desc: "East Africa | West Africa | North Africa | Southern Africa | Central Africa" },
      { name: "technology",  type: "string",  desc: "Solar | Wind | Hydro | Geothermal | Oil & Gas | Grid Expansion | Battery & Storage | Hydrogen | Nuclear | Bioenergy | Clean Cooking | Coal", example: "Solar" },
      { name: "dealStage",   type: "string",  desc: "Announced | Mandated | Financial Close | Construction | Commissioned | Suspended" },
      { name: "minDealSize", type: "number",  desc: "Minimum deal size in USD millions",            example: "100" },
      { name: "maxDealSize", type: "number",  desc: "Maximum deal size in USD millions",            example: "5000" },
      { name: "search",      type: "string",  desc: "Full-text search on project name" },
      { name: "page",        type: "integer", desc: "Page number",                                  example: "1" },
      { name: "limit",       type: "integer", desc: "Results per page (max 100)",                   example: "50" },
    ],
    responseExample: {
      data: [{ id: 42, projectName: "Benban Solar Park", country: "Egypt", technology: "Solar", dealSizeUsdMn: 2000, dealStage: "Commissioned" }],
      meta: { total: 123, page: 1, limit: 50, pages: 3 },
    },
  },
  {
    method: "GET", path: "/projects/{id}",
    desc: "Get full details for a single energy deal by numeric ID.",
    params: [{ name: "id", type: "integer", required: true, desc: "Numeric deal ID", example: "42" }],
    responseExample: { id: 42, projectName: "Benban Solar Park", country: "Egypt", technology: "Solar", dealSizeUsdMn: 2000 },
  },
  {
    method: "GET", path: "/countries",
    desc: "All 26+ countries in the dataset with aggregated investment statistics.",
    responseExample: {
      data: [{ country: "Nigeria", region: "West Africa", projectCount: 18, totalInvestmentUsdMn: 28400, technologies: "Hydro, Oil & Gas, Solar" }],
      meta: { total: 26 },
    },
  },
  {
    method: "GET", path: "/investors",
    desc: "Developer and financier entities with their full portfolio stats.",
    params: [
      { name: "search", type: "string",  desc: "Filter by developer name", example: "IFC" },
      { name: "page",   type: "integer", desc: "Page number" },
      { name: "limit",  type: "integer", desc: "Results per page" },
    ],
    responseExample: {
      data: [{ developer: "Scatec", projectCount: 7, totalInvestmentUsdMn: 3200, countries: "Egypt, Kenya, Nigeria" }],
      meta: { total: 84, page: 1, limit: 50 },
    },
  },
  {
    method: "GET", path: "/stats/summary",
    desc: "Platform-wide aggregate: total projects, investment volume, country count, deal stage breakdown.",
    responseExample: {
      totalProjects: 123, totalInvestmentUsdMn: 145600, totalCountries: 26,
      totalSectors: 8, totalDevelopers: 84, dealsByStage: { "Financial Close": 28, Commissioned: 55 },
    },
  },
  {
    method: "GET", path: "/stats/by-technology",
    desc: "Project count and investment volume grouped by energy sector.",
    responseExample: [
      { technology: "Solar", projectCount: 40, totalInvestmentUsdMn: 42000, avgDealSizeUsdMn: 1050 },
      { technology: "Wind",  projectCount: 22, totalInvestmentUsdMn: 18200, avgDealSizeUsdMn: 827 },
    ],
  },
  {
    method: "GET", path: "/stats/by-country",
    desc: "Investment and project counts grouped by country.",
    responseExample: [{ country: "Nigeria", totalInvestmentUsdMn: 28400, projectCount: 18 }],
  },
  {
    method: "GET", path: "/stats/by-year",
    desc: "Annual investment trends (by year announced).",
    responseExample: [{ year: 2022, projectCount: 14, totalInvestmentUsdMn: 12300 }],
  },
  {
    method: "POST", path: "/keys/request",
    desc: "Request a new API key. Sends the key to your email address.",
    body: { organization: "IEA Africa Research", email: "analyst@iea.org", tier: "institutional" },
    responseExample: { message: "API key created. Check your email.", tier: "institutional", rateLimit: 10000 },
  },
  {
    method: "GET", path: "/keys/validate",
    auth: true,
    desc: "Validate your API key and check daily usage.",
    responseExample: { valid: true, organization: "IEA Africa Research", tier: "institutional", rateLimit: 10000, usedToday: 47, remaining: 9953 },
  },
];

function buildCode(lang: Lang, ep: Endpoint, apiKey: string): string {
  const url = `${BASE}${ep.path.replace("{id}", "42")}`;
  const headers = ep.auth || apiKey ? `X-API-Key: ${apiKey || "aet_your_key_here"}` : "";
  const hasKey = ep.auth || !!apiKey;

  if (lang === "curl") {
    if (ep.method === "POST") {
      return `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\${hasKey ? `\n  -H "X-API-Key: ${apiKey || "aet_your_key_here"}" \\` : ""}
  -d '${JSON.stringify(ep.body, null, 2)}'`;
    }
    return `curl "${url}"${hasKey ? ` \\\n  -H "${headers}"` : ""}`;
  }

  if (lang === "python") {
    const lines = [
      `import requests`,
      ``,
      `url = "${url}"`,
      hasKey ? `headers = {"X-API-Key": "${apiKey || "aet_your_key_here"}"}` : `headers = {}`,
    ];
    if (ep.method === "POST") {
      lines.push(`payload = ${JSON.stringify(ep.body, null, 4).replace(/^/gm, "")}`);
      lines.push(`r = requests.post(url, headers=headers, json=payload)`);
    } else {
      lines.push(`r = requests.get(url, headers=headers)`);
    }
    lines.push(`data = r.json()`);
    lines.push(`print(data)`);
    return lines.join("\n");
  }

  // javascript
  const lines = [
    `const response = await fetch("${url}", {`,
    `  method: "${ep.method}",`,
    `  headers: {`,
    `    "Content-Type": "application/json",`,
    hasKey ? `    "X-API-Key": "${apiKey || "aet_your_key_here"}",` : null,
    `  },`,
  ].filter((l) => l !== null) as string[];
  if (ep.method === "POST") {
    lines.push(`  body: JSON.stringify(${JSON.stringify(ep.body, null, 4).replace(/^/gm, "  ")}),`);
  }
  lines.push(`});`);
  lines.push(`const data = await response.json();`);
  lines.push(`console.log(data);`);
  return lines.join("\n");
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="relative group">
      <div className="flex items-center justify-between px-4 py-2 bg-background border border-border rounded-t-xl">
        <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">{language}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-foreground/80 transition-colors">
          {copied ? <><Check className="w-3 h-3 text-[#00e676]" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <pre className="bg-[#060a12] border border-t-0 border-border rounded-b-xl px-4 py-4 text-sm text-foreground/80 overflow-x-auto leading-relaxed whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function EndpointRow({ ep, apiKey, lang }: { ep: Endpoint; apiKey: string; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const methodColor = ep.method === "GET" ? "text-[#00e676] bg-[#00e67615] border-[#00e67630]" : "text-[#f59e0b] bg-[#f59e0b15] border-[#f59e0b30]";
  return (
    <div className="border border-border/80 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 bg-card hover:bg-muted/20 transition-colors text-left"
      >
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${methodColor}`}>{ep.method}</span>
        <code className="text-sm font-mono text-foreground flex-1">{ep.path}</code>
        {ep.auth && <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded font-semibold">Auth</span>}
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground/70 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground/70 flex-shrink-0" />}
      </button>

      {open && (
        <div className="bg-[#080d18] border-t border-border/80 px-4 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">{ep.desc}</p>

          {ep.params && ep.params.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider mb-2">Parameters</h4>
              <div className="space-y-1.5">
                {ep.params.map((p) => (
                  <div key={p.name} className="flex gap-3 text-sm">
                    <code className="text-[#00e676] font-mono w-28 flex-shrink-0">{p.name}</code>
                    <span className="text-muted-foreground/50 w-16 flex-shrink-0">{p.type}</span>
                    <span className="text-muted-foreground flex-1">{p.desc}</span>
                    {p.required && <span className="text-red-400 text-xs self-center">required</span>}
                    {p.example && <code className="text-muted-foreground/70 text-xs self-center">e.g. {p.example}</code>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {ep.body && (
            <div>
              <h4 className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider mb-2">Request Body</h4>
              <CodeBlock code={JSON.stringify(ep.body, null, 2)} language="json" />
            </div>
          )}

          <div>
            <h4 className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider mb-2">Code Example</h4>
            <CodeBlock code={buildCode(lang, ep, apiKey)} language={lang} />
          </div>

          {ep.responseExample && (
            <div>
              <h4 className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider mb-2">Example Response</h4>
              <CodeBlock code={JSON.stringify(ep.responseExample, null, 2)} language="json" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const QUICK_STARTS: { lang: Lang; code: string }[] = [
  {
    lang: "curl",
    code: `# Get top 10 Solar deals in Nigeria
curl "${BASE}/deals?technology=Solar&country=Nigeria&limit=10"

# Get investment stats by sector
curl "${BASE}/stats/by-technology"`,
  },
  {
    lang: "python",
    code: `import requests

# Authenticated request (institutional tier)
headers = {"X-API-Key": "aet_your_key_here"}
base = "${BASE}"

# Fetch all Solar deals
r = requests.get(f"{base}/deals", headers=headers, params={
    "technology": "Solar",
    "limit": 100,
})
deals = r.json()["data"]
print(f"Found {len(deals)} Solar deals")

# Country-level aggregates
countries = requests.get(f"{base}/countries", headers=headers).json()
top5 = sorted(countries["data"], key=lambda c: c["totalInvestmentUsdMn"], reverse=True)[:5]
for c in top5:
    usd = c["totalInvestmentUsdMn"]
    print(f"{c['country']}: USD {usd:,.0f}M")`,
  },
  {
    lang: "javascript",
    code: `const BASE = "${BASE}";
const API_KEY = "aet_your_key_here"; // or omit for free tier

async function fetchDeals(filters = {}) {
  const params = new URLSearchParams({ limit: "50", ...filters });
  const res = await fetch(\`\${BASE}/deals?\${params}\`, {
    headers: API_KEY ? { "X-API-Key": API_KEY } : {},
  });
  return res.json();
}

// Get Wind deals > $500M
const { data, meta } = await fetchDeals({
  technology: "Wind",
  minDealSize: "500",
});
console.log(\`\${meta.total} results\`, data);`,
  },
];

export default function ApiDocsPage() {
  const [apiKey, setApiKey] = useState("");
  const [lang, setLang] = useState<Lang>("curl");
  const [form, setForm] = useState({ org: "", email: "", tier: "free" });
  const [formState, setFormState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [formMsg, setFormMsg] = useState("");

  async function handleKeyRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!form.org || !form.email) return;
    setFormState("loading");
    try {
      const r = await fetch(`${DEV_BASE}/keys/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization: form.org, email: form.email, tier: form.tier }),
      });
      const data = await r.json();
      if (!r.ok) {
        setFormState("error");
        setFormMsg(data.error ?? "Something went wrong.");
      } else {
        setFormState("done");
        setFormMsg(data.message ?? "Key created! Check your email.");
        if (data.key) setApiKey(data.key); // dev mode
      }
    } catch {
      setFormState("error");
      setFormMsg("Network error. Please try again.");
    }
  }

  const endpointGroups: { label: string; icon: React.ReactNode; endpoints: Endpoint[] }[] = [
    { label: "Deals & Projects", icon: <Database className="w-4 h-4" />, endpoints: ENDPOINTS.slice(0, 2) },
    { label: "Countries & Investors", icon: <Globe className="w-4 h-4" />, endpoints: ENDPOINTS.slice(2, 4) },
    { label: "Statistics & Analytics", icon: <BarChart2 className="w-4 h-4" />, endpoints: ENDPOINTS.slice(4, 8) },
    { label: "API Key Management", icon: <Key className="w-4 h-4" />, endpoints: ENDPOINTS.slice(8) },
  ];

  return (
    <Layout>
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Terminal className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">API Documentation</h1>
              <p className="text-sm text-muted-foreground">AfriEnergy Tracker • Africa Energy Pulse</p>
            </div>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Programmatic access to 123+ African energy investment deals across 26 countries and 8 sectors.
            Build dashboards, research tools, and integrations with our REST API.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary border border-primary/30 px-4 py-2 rounded-lg hover:bg-primary/10 transition-colors"
            >
              <BookOpen className="w-4 h-4" /> Interactive Swagger UI
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="/api/openapi.yaml"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-muted-foreground border border-border px-4 py-2 rounded-lg hover:bg-muted transition-colors"
            >
              <Code2 className="w-4 h-4" /> OpenAPI Spec
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-12">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Projects", value: "123+", icon: <Database className="w-4 h-4" /> },
            { label: "Countries", value: "26",  icon: <Globe className="w-4 h-4" /> },
            { label: "Sectors",   value: "8",   icon: <Activity className="w-4 h-4" /> },
            { label: "Investors", value: "84+", icon: <Users className="w-4 h-4" /> },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
              <div className="text-primary">{s.icon}</div>
              <div>
                <div className="text-xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Authentication */}
        <section id="authentication">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Authentication</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {[
              { tier: "Free", limit: "100 req/day", color: "border-slate-600", badge: "bg-slate-700",
                desc: "No API key required. Requests are tracked by IP. Good for exploration and prototyping.", },
              { tier: "Institutional", limit: "10,000 req/day", color: "border-primary/30", badge: "bg-primary/20 text-primary",
                desc: "Pass your API key in the X-API-Key header. Designed for production integrations and research.", },
            ].map((t) => (
              <div key={t.tier} className={`bg-card border ${t.color} rounded-xl p-5`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">{t.tier}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${t.badge}`}>{t.limit}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t.desc}</p>
              </div>
            ))}
          </div>
          <CodeBlock
            language="http"
            code={`GET /api/deals HTTP/1.1
Host: afrienergytracker.io
X-API-Key: aet_your_key_here
Content-Type: application/json`}
          />
        </section>

        {/* Request API Key */}
        <section id="request-key">
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Request API Key</h2>
          </div>
          <div className="bg-card border border-border rounded-xl p-6">
            {formState === "done" ? (
              <div className="flex items-center gap-3 text-[#00e676]">
                <Check className="w-5 h-5" />
                <div>
                  <p className="font-semibold">{formMsg}</p>
                  {apiKey && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-1">Your key (dev mode):</p>
                      <code className="text-sm bg-background px-3 py-1.5 rounded text-[#00e676] block">{apiKey}</code>
                      <button
                        onClick={() => setApiKey(apiKey)}
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        Use this key in examples →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleKeyRequest} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Organization</label>
                    <input
                      value={form.org}
                      onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))}
                      placeholder="IEA Africa Research"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="analyst@example.com"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Tier</label>
                  <div className="flex gap-3">
                    {["free", "institutional"].map((t) => (
                      <label key={t} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="tier" value={t} checked={form.tier === t} onChange={() => setForm((f) => ({ ...f, tier: t }))} />
                        <span className="text-sm capitalize">{t}</span>
                        <span className="text-xs text-muted-foreground">({t === "free" ? "100/day" : "10,000/day"})</span>
                      </label>
                    ))}
                  </div>
                </div>
                {formState === "error" && (
                  <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{formMsg}</p>
                )}
                <button
                  type="submit"
                  disabled={formState === "loading"}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {formState === "loading" ? "Sending…" : <><ArrowRight className="w-4 h-4" /> Get API Key</>}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* API Key in Examples */}
        <section>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <Key className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your API Key (auto-fills code examples)</label>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="aet_your_key_here"
                className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        </section>

        {/* Quick Start */}
        <section id="quickstart">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Quick Start</h2>
          </div>
          <div className="flex gap-2 mb-4">
            {(["curl", "python", "javascript"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${lang === l ? "bg-primary/20 text-primary border border-primary/30" : "border border-border text-muted-foreground hover:text-foreground"}`}
              >
                {l === "javascript" ? "JavaScript" : l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
          <CodeBlock code={QUICK_STARTS.find((q) => q.lang === lang)!.code} language={lang} />
        </section>

        {/* Endpoint Explorer */}
        <section id="endpoints">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold">Endpoint Reference</h2>
            </div>
            <div className="flex gap-2">
              {(["curl", "python", "javascript"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${lang === l ? "bg-primary/20 text-primary border border-primary/30" : "border border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {l === "javascript" ? "JS" : l.charAt(0).toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-8">
            {endpointGroups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                  {group.icon}
                  <h3 className="text-sm font-bold uppercase tracking-wider">{group.label}</h3>
                </div>
                <div className="space-y-2">
                  {group.endpoints.map((ep) => (
                    <EndpointRow key={`${ep.method}-${ep.path}`} ep={ep} apiKey={apiKey} lang={lang} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Rate Limits */}
        <section id="rate-limits" className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-bold mb-3">Rate Limits & Errors</h2>
          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div>
              <h3 className="font-semibold mb-2 text-muted-foreground">Rate Limit Headers</h3>
              <p className="text-muted-foreground">When you exceed your daily limit, the API returns <code className="text-primary">HTTP 429</code> with a JSON body including your tier and reset time.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2 text-muted-foreground">Common Errors</h3>
              <div className="space-y-1">
                {[
                  { code: "400", msg: "Invalid request body or parameters" },
                  { code: "401", msg: "Invalid or missing API key" },
                  { code: "404", msg: "Resource not found" },
                  { code: "429", msg: "Daily rate limit exceeded" },
                  { code: "500", msg: "Internal server error" },
                ].map((e) => (
                  <div key={e.code} className="flex items-center gap-3">
                    <code className={`text-xs px-1.5 py-0.5 rounded font-mono ${Number(e.code) < 500 ? "text-amber-400 bg-amber-400/10" : "text-red-400 bg-red-400/10"}`}>{e.code}</code>
                    <span className="text-muted-foreground">{e.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Base URL */}
        <section className="text-center pb-8">
          <p className="text-muted-foreground text-sm">
            Base URL: <code className="text-primary">{BASE}</code> · Need help? Email <a href="mailto:api@afrienergypulse.com" className="text-primary hover:underline">api@afrienergypulse.com</a>
          </p>
        </section>
      </div>
    </div>
    </Layout>
  );
}
