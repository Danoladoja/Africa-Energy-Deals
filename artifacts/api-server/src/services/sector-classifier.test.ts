/**
 * Unit tests for classifyEnergySector().
 *
 * All test titles with real strings are taken verbatim from the live admin
 * Rejected / Needs Source / Pending buckets observed on 2026-04-11.
 */

import { describe, it, expect } from "vitest";
import { classifyEnergySector } from "./sector-classifier.js";
import { isEnergySector } from "@workspace/shared";

// ── Positive cases ─────────────────────────────────────────────────────────────

describe("classifyEnergySector — positive cases", () => {
  it("Menengai II Geothermal → Geothermal (Bug 2 regression)", () => {
    const result = classifyEnergySector({ title: "Menengai II Geothermal" });
    expect(result.sector).toBe("Geothermal");
  });

  it("Olkaria IV → Geothermal (Bug 2 regression)", () => {
    const result = classifyEnergySector({ title: "Olkaria IV" });
    expect(result.sector).toBe("Geothermal");
  });

  it("Olkaria Expansion → Geothermal (Bug 2 regression)", () => {
    const result = classifyEnergySector({ title: "Olkaria Expansion" });
    expect(result.sector).toBe("Geothermal");
  });

  it("Shell Bonga North FID Offshore Nigeria → Oil & Gas", () => {
    const result = classifyEnergySector({ title: "Shell Bonga North FID Offshore Nigeria" });
    expect(result.sector).toBe("Oil & Gas");
  });

  it("Nachtigal Hydro Power Project → Hydro", () => {
    const result = classifyEnergySector({ title: "Nachtigal Hydro Power Project" });
    expect(result.sector).toBe("Hydro");
  });

  it("REIPPPP Bid Window 7 → Solar (South Africa renewables programme)", () => {
    const result = classifyEnergySector({ title: "REIPPPP Bid Window 7" });
    expect(result.sector).toBe("Solar");
  });

  it("Scatec reaches financial close on 100 MW solar project in Egypt → Solar", () => {
    const result = classifyEnergySector({
      title: "Scatec reaches financial close on 100 MW solar project in Egypt",
    });
    expect(result.sector).toBe("Solar");
  });
});

// ── Negative cases — all real titles from live Rejected bucket ─────────────────

describe("classifyEnergySector — negative cases (real live data)", () => {
  it("Kiira Motors EV Expansion → null (e_mobility_not_generation)", () => {
    const result = classifyEnergySector({ title: "Kiira Motors EV Expansion" });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("e_mobility_not_generation");
  });

  it("Kiira Motors 450-Bus Electric Bus Deal → null (e_mobility_not_generation)", () => {
    const result = classifyEnergySector({ title: "Kiira Motors 450-Bus Electric Bus Deal" });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("e_mobility_not_generation");
  });

  it("Spiro Electric Motorcycle Fleet → null (e_mobility_not_generation)", () => {
    const result = classifyEnergySector({ title: "Spiro Electric Motorcycle Fleet" });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("e_mobility_not_generation");
  });

  it("Nigeria AfDB Economic Governance and Energy Transition Loan → null (dev_policy_financing)", () => {
    const result = classifyEnergySector({
      title: "Nigeria AfDB Economic Governance and Energy Transition Loan",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("dev_policy_financing");
  });

  it("Senegal DPF → null (dev_policy_financing)", () => {
    const result = classifyEnergySector({ title: "Senegal DPF" });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("dev_policy_financing");
  });

  it("Cote d'Ivoire Private Investment and Productive Jobs DPF1 → null (dev_policy_financing)", () => {
    const result = classifyEnergySector({
      title: "Cote d'Ivoire Private Investment and Productive Jobs DPF1",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("dev_policy_financing");
  });

  it("South Africa Infrastructure Modernization and Job Creation DPL → null (dev_policy_financing)", () => {
    const result = classifyEnergySector({
      title: "South Africa Infrastructure Modernization and Job Creation DPL",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("dev_policy_financing");
  });

  it("Integrated Social Protection for Resilience and Opportunity → null (social_programming)", () => {
    const result = classifyEnergySector({
      title: "Integrated Social Protection for Resilience and Opportunity",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("social_programming");
  });

  it("Street-Connected Children and Adolescents Socio-Economic Inclusion → null (social_programming)", () => {
    const result = classifyEnergySector({
      title: "Street-Connected Children and Adolescents Socio-Economic Inclusion",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("social_programming");
  });

  it("Skills for Employment and Economic Transformation Mozambique → null (social_programming)", () => {
    const result = classifyEnergySector({
      title: "Skills for Employment and Economic Transformation Mozambique",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("social_programming");
  });

  it("Generating Resilience Opportunities and Welfare for a Thriving Egypt (GROWTH) 2 → null (social_programming)", () => {
    const result = classifyEnergySector({
      title: "Generating Resilience Opportunities and Welfare for a Thriving Egypt (GROWTH) 2",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("social_programming");
  });

  it("Morocco Climate & Risk Finance Program → null (climate_finance_no_asset)", () => {
    const result = classifyEnergySector({ title: "Morocco Climate & Risk Finance Program" });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("climate_finance_no_asset");
  });

  it("Blended Finance Platform for Resilient Infrastructure → null (climate_finance_no_asset)", () => {
    const result = classifyEnergySector({
      title: "Blended Finance Platform for Resilient Infrastructure",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("climate_finance_no_asset");
  });

  it("Sudan Food and Nutrition Security → null (social_programming)", () => {
    const result = classifyEnergySector({ title: "Sudan Food and Nutrition Security" });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("social_programming");
  });

  it("Housing Finance Lands and Sustainable Investments → null (social_programming)", () => {
    const result = classifyEnergySector({
      title: "Housing Finance Lands and Sustainable Investments",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("social_programming");
  });

  it("Kinshasa Urban Transformation and Jobs Program → null (social_programming)", () => {
    const result = classifyEnergySector({
      title: "Kinshasa Urban Transformation and Jobs Program",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("social_programming");
  });

  it("Support to Transparency in Energy Transition Minerals Development → null (minerals_advocacy)", () => {
    const result = classifyEnergySector({
      title: "Support to Transparency in Energy Transition Minerals Development",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("minerals_advocacy");
  });

  it("Second Community Action for Landscape Management → null (social_programming)", () => {
    const result = classifyEnergySector({
      title: "Second Community Action for Landscape Management",
    });
    expect(result.sector).toBeNull();
    expect(result.rejectionReason).toBe("social_programming");
  });
});

// ── Edge cases ─────────────────────────────────────────────────────────────────

describe("classifyEnergySector — edge cases", () => {
  it("copper mine with captive 50 MW solar plant → Solar (asset escape)", () => {
    const result = classifyEnergySector({
      title: "Zambia Copper Mine Captive Power Project",
      description: "50 MW solar plant to power the copper mining operations with captive power",
    });
    expect(result.sector).toBe("Solar");
  });

  it("green bond whose prospectus names a specific solar project → Solar", () => {
    const result = classifyEnergySector({
      title: "IFC Green Bond for Africa Solar Development",
      description: "Proceeds finance a 150 MW solar farm in Nigeria under the RMAFC grid expansion plan",
    });
    expect(result.sector).toBe("Solar");
  });

  it("EV item that mentions grid-connected charging infrastructure → Transmission & Distribution", () => {
    const result = classifyEnergySector({
      title: "Kenyan Electric Vehicle Charging Station Grid Infrastructure Expansion",
      description: "Grid-connected EV charging stations across Nairobi",
    });
    expect(result.sector).toBe("Transmission & Distribution");
  });

  it("isEnergySector('Bioenergy') → false (drift guard)", () => {
    expect(isEnergySector("Bioenergy")).toBe(false);
  });

  it("isEnergySector('Grid Expansion') → false (drift guard)", () => {
    expect(isEnergySector("Grid Expansion")).toBe(false);
  });

  it("isEnergySector('Solar') → true", () => {
    expect(isEnergySector("Solar")).toBe(true);
  });

  it("isEnergySector('Biomass') → true (canonical name)", () => {
    expect(isEnergySector("Biomass")).toBe(true);
  });

  it("isEnergySector('Transmission & Distribution') → true (canonical name)", () => {
    expect(isEnergySector("Transmission & Distribution")).toBe(true);
  });

  it("geothermal keyword sets Biomass score to zero — Olkaria not tagged Bioenergy (Bug 2 regression)", () => {
    const result = classifyEnergySector({
      title: "Olkaria IV Geothermal Expansion",
      description: "Expansion of Kenya's Olkaria geothermal steam field",
    });
    expect(result.sector).toBe("Geothermal");
    expect(result.sector).not.toBe("Biomass");
  });

  it("extractedTechnology canonical sector fast-accepts without scoring", () => {
    const result = classifyEnergySector({
      title: "Some ambiguous title",
      extractedTechnology: "Wind",
    });
    expect(result.sector).toBe("Wind");
    expect(result.confidence).toBe(1);
  });
});
