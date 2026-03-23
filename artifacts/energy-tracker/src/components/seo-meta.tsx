import { Helmet } from "react-helmet-async";

const SITE_NAME = "AfriEnergy Tracker";
const SITE_URL = "https://afrienergytracker.io";
const DEFAULT_DESCRIPTION =
  "Track African energy investment deals. 123+ projects across 26 countries — solar, wind, hydro, gas, grid & storage.";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

interface SEOMetaProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  jsonLd?: object | object[];
  noIndex?: boolean;
}

export function SEOMeta({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  jsonLd,
  noIndex = false,
}: SEOMetaProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Africa Energy Investment Database`;
  const canonical = url ? `${SITE_URL}${url}` : SITE_URL;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noIndex && <meta name="robots" content="noindex,nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
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
    name: "Africa Energy Pulse",
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
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
    "@type": "Dataset",
    name: "Africa Energy Investment Deals",
    description: "Comprehensive database of energy investment transactions across Africa, covering 26+ countries and 8 technology sectors.",
    url: `${SITE_URL}/deals`,
    creator: { "@type": "Organization", name: "Africa Energy Pulse" },
    license: "https://creativecommons.org/licenses/by/4.0/",
    keywords: ["Africa", "energy", "investment", "solar", "wind", "hydro", "project finance"],
    spatialCoverage: "Africa",
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
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${project.projectName} — ${project.technology} in ${project.country}`,
    description: project.description ?? `${project.technology} energy investment in ${project.country}`,
    url: `${SITE_URL}/deals/${project.id}`,
    datePublished: project.announcedYear ? `${project.announcedYear}-01-01` : undefined,
    author: { "@type": "Organization", name: "Africa Energy Pulse" },
    publisher: {
      "@type": "Organization",
      name: "AfriEnergy Tracker",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.svg` },
    },
    about: {
      "@type": "Thing",
      name: project.projectName,
      description: `${project.technology} project, ${project.country}${project.dealSizeUsdMn ? `, $${project.dealSizeUsdMn}M` : ""}`,
    },
  };
}
