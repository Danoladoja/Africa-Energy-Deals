/**
 * World Bank Group — Africa energy projects from the Projects API.
 *
 * Queries the World Bank Projects Search API (v2) for energy-sector projects
 * in African countries. High confidence (0.90) because data is structured.
 *
 * Covers: IBRD/IDA energy projects with African country recipients.
 */

import { fetchWithRetry } from "../shared/http.js";
import { normalizeCountry, isRecognizedCountry } from "../shared/countries.js";
import { normalizeTechnology, estimateDealSize } from "../shared/technologies.js";
import type { CandidateDraft, AdapterResult, RegisteredAdapter } from "./types.js";

const API_BASE = "https://search.worldbank.org/api/v2/projects";

// Energy sector codes (World Bank DAC codes)
const ENERGY_SECTOR_CODES = ["LT", "LR", "LZ", "LE", "LC"]; // Power, Renewables, etc.
const ENERGY_THEME = "Energy";

// World Bank region codes for Africa
const AFRICA_REGIONS = ["AFR", "AFE", "AFW"];

const MAX_PAGES = 5;
const PAGE_SIZE = 50;

// Technology inference from project title/description
const TECH_KEYWORDS: [RegExp, string][] = [
  [/solar|photovoltaic|pv\b/i, "Solar"],
  [/wind\s*(farm|power|energy|turbine)/i, "Wind"],
  [/hydro|dam|hydroelectric/i, "Hydro"],
  [/geothermal/i, "Geothermal"],
  [/biomass|bioenergy|biogas|waste.to.energy/i, "Biomass"],
  [/battery|storage|bess/i, "Battery Storage"],
  [/hydrogen|electrolys/i, "Green Hydrogen"],
  [/nuclear|atomic/i, "Nuclear"],
  [/gas\b|lng\b|natural gas/i, "Oil & Gas"],
  [/coal/i, "Coal"],
  [/transmission|distribution|grid|interconnect/i, "Transmission & Distribution"],
];

function inferTechnology(text: string): string | null {
  for (const [pattern, tech] of TECH_KEYWORDS) {
    if (pattern.test(text)) return tech;
  }
  return null;
}

interface WBProject {
  id?: string;
  project_name?: string;
  projectfinancialtype?: string;
  status?: string;
  countryname?: string;
  countryshortname?: string;
  regionname?: string;
  sector1?: { Name?: string };
  theme1?: { Name?: string };
  totalamt?: number;
  lendprojectcost?: number;
  boardapprovaldate?: string;
  closingdate?: string;
  project_abstract?: { cdata?: string };
  url?: string;
}

function mapStatus(s: string | undefined): string {
  const x = (s ?? "").toLowerCase();
  if (x === "active" || x === "implementation") return "construction";
  if (x === "closed" || x === "completed") return "operational";
  if (x === "pipeline") return "announced";
  if (x === "dropped" || x === "cancelled") return "cancelled";
  return "announced";
}

async function fetchWBProjects(): Promise<{ projects: WBProject[]; errors: string[] }> {
  const allProjects: WBProject[] = [];
  const errors: string[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      format: "json",
      rows: String(PAGE_SIZE),
      os: String((page - 1) * PAGE_SIZE),
      sectorcode_exact: ENERGY_SECTOR_CODES.join(","),
      regionname_exact: "Africa",
      fl: "id,project_name,status,countryname,countryshortname,regionname,sector1,theme1,totalamt,lendprojectcost,boardapprovaldate,closingdate,project_abstract,url",
    });

    try {
      const { body, status } = await fetchWithRetry(`${API_BASE}?${params}`, { timeoutMs: 15_000 });
      if (status >= 400 || !body) {
        errors.push(`WB API page ${page}: HTTP ${status}`);
        break;
      }
      const data = JSON.parse(body) as { projects?: Record<string, WBProject> };
      if (!data.projects) break;

      const projects = Object.values(data.projects).filter((p): p is WBProject => !!p && typeof p === "object" && !!p.project_name);
      if (projects.length === 0) break;
      allProjects.push(...projects);
    } catch (e) {
      errors.push(`WB API page ${page}: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }

  return { projects: allProjects, errors };
}

async function run(): Promise<AdapterResult> {
  const { projects, errors } = await fetchWBProjects();
  const candidates: CandidateDraft[] = [];
  let filtered = 0;

  for (const p of projects) {
    const country = normalizeCountry(p.countryname ?? p.countryshortname ?? "");
    if (!country || !isRecognizedCountry(country)) {
      filtered++;
      continue;
    }

    const text = `${p.project_name ?? ""} ${p.project_abstract?.cdata ?? ""}`;
    const tech = inferTechnology(text) ?? normalizeTechnology(text) ?? "Transmission & Distribution";

    const amountMn = p.totalamt
      ? p.totalamt / 1_000_000
      : p.lendprojectcost
        ? p.lendprojectcost / 1_000_000
        : null;

    const year = p.boardapprovaldate ? new Date(p.boardapprovaldate).getFullYear() : null;
    const sourceUrl = p.url ?? (p.id ? `https://projects.worldbank.org/en/projects-operations/project-detail/${p.id}` : null);

    candidates.push({
      projectName: (p.project_name ?? "").slice(0, 300),
      country,
      technology: tech,
      dealSizeUsdMn: amountMn,
      capacityMw: null,
      developer: "World Bank Group",
      financiers: "IBRD/IDA",
      dfiInvolvement: "World Bank",
      dealStage: null,
      status: mapStatus(p.status),
      description: p.project_abstract?.cdata?.slice(0, 500) ?? null,
      newsUrl: null,
      sourceUrl,
      latitude: null,
      longitude: null,
      announcedYear: year,
      offtaker: null,
      financialCloseDate: null,
      confidence: 0.90,
    });
  }

  return {
    candidates,
    errors,
    meta: { recordsFetched: projects.length, filteredOut: filtered },
  };
}

export const worldBankAdapter: RegisteredAdapter = {
  config: {
    key: "world-bank",
    label: "World Bank Group (IBRD/IDA)",
    group: "world-bank",
    schedule: "weekly",
    defaultConfidence: 0.90,
  },
  run,
};
