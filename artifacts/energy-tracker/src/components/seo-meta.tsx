import { Helmet } from "react-helmet-async";

const SITE_NAME = "AfriEnergy Tracker";
const SITE_URL = "https://afrienergytracker.io";
const DEFAULT_DESCRIPTION =
  "Track African energy investment deals. 156+ projects across 40 countries — solar, wind, hydro, gas, grid & storage.";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;
const BASE_KEYWORDS =
  "African energy investment, Africa renewable energy, energy deals Africa, solar Africa, wind energy Africa, infrastructure investment Africa, DFI Africa, development finance, AfriEnergy Tracker";

interface SEOMetaProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  jsonLd?: object | object[];
  noIndex?: boolean;
}

export function SEOMeta({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  jsonLd,
  noIndex = false,
}: SEOMetaProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Africa Energy Investment Database`;
  const canonical = url ? `${SITE_URL}${url}` : SITE_URL;
  const allKeywords = keywords ? `${keywords}, ${BASE_KEYWORDS}` : BASE_KEYWORDS;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={noIndex ? "noindex,nofollow" : "index, follow"} />
      <meta name="keywords" content={allKeywords} />
      <meta name="author" content={SITE_NAME} />
      <meta name="theme-color" content="#0f172a" />
      <link rel="canonical" href={canonical} />
      <link rel="alternate" hrefLang="en" href={canonical} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="AfriEnergy Tracker — African Energy Investment Database" />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:site" content="@AfriEnergyPulse" />

      {/* JSON-LD */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(Array.isArray(jsonLd) ? jsonLd : [jsonLd])}
        </script>
      )}
    </Helmet>
  );
}

// ── Pre-built JSON-LD schemas ────────────────────────────────────────────────

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "AfriEnergy Tracker",
    url: SITE_URL,
    logo: `${SITE_URL}/og-image.png`,
    description: "Africa's leading energy investment tracking platform covering 156+ deals across 40 countries.",
    sameAs: ["https://twitter.com/AfriEnergyPulse"],
    knowsAbout: ["African energy investment", "renewable energy finance", "project finance Africa"],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: "Track African energy investment deals — solar, wind, hydro, gas and storage projects with live data.",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/deals?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function datasetSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "DataCatalog",
    name: "Africa Energy Investment Deals",
    description: "Comprehensive database of energy investment transactions across Africa, covering 156+ projects across 40 countries and multiple technology sectors.",
    url: `${SITE_URL}/deals`,
    publisher: { "@type": "Organization", name: "AfriEnergy Tracker", url: SITE_URL },
    license: "https://creativecommons.org/licenses/by/4.0/",
    keywords: ["Africa", "energy", "investment", "solar", "wind", "hydro", "project finance"],
    spatialCoverage: "Africa",
  };
}

export function countryDatasetSchema(country: string, slug: string, projectCount: number, totalInvestmentMn: number) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${country} Energy Investment Data`,
    description: `Energy investment deals tracked in ${country}: ${projectCount} projects worth $${totalInvestmentMn >= 1000 ? (totalInvestmentMn / 1000).toFixed(1) + "B" : totalInvestmentMn.toFixed(0) + "M"}.`,
    url: `${SITE_URL}/countries/${slug}`,
    publisher: { "@type": "Organization", name: "AfriEnergy Tracker", url: SITE_URL },
    spatialCoverage: { "@type": "Place", name: country, containedInPlace: { "@type": "Place", name: "Africa" } },
    keywords: [`${country} energy`, `${country} investment`, "Africa energy", "project finance"],
  };
}

export function developerOrganizationSchema(name: string, slug: string, projectCount: number, countries: string[]) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url: `${SITE_URL}/developers/${slug}`,
    description: `${name}'s energy investment portfolio in Africa: ${projectCount} tracked projects across ${countries.length} countries.`,
    areaServed: countries.map(c => ({ "@type": "Place", name: c })),
    knowsAbout: ["African energy investment", "project finance", "renewable energy"],
  };
}

export function dealArticleSchema(project: {
  id: number;
  projectName: string;
  country: string;
  technology: string;
  dealSizeUsdMn?: number | null;
  capacityMw?: number | null;
  description?: string | null;
  announcedYear?: number | null;
  status: string;
  region?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: project.projectName,
    description: project.description ?? `${project.technology} energy investment in ${project.country}${project.dealSizeUsdMn ? `, $${project.dealSizeUsdMn}M` : ""}`,
    url: `${SITE_URL}/deals/${project.id}`,
    publisher: {
      "@type": "Organization",
      name: "AfriEnergy Tracker",
      url: SITE_URL,
    },
    spatialCoverage: {
      "@type": "Place",
      name: project.country,
      ...(project.region ? { containedInPlace: { "@type": "Place", name: project.region } } : {}),
    },
    ...(project.announcedYear ? { temporalCoverage: `${project.announcedYear}` } : {}),
    keywords: [project.technology, project.country, "energy investment", "Africa"],
  };
}
