import { BookOpen, Database, Scale, Bot, RefreshCcw, AlertTriangle, Mail } from "lucide-react";
import { Layout } from "@/components/layout";

/**
 * Public methodology page — the tracker's single most important trust signal.
 * Everything stated here must match how the pipeline actually behaves
 * (see api-server: scraper/pipeline.ts, routes/stats.ts, scheduler.ts).
 */

const BENCHMARKS: Array<[string, string]> = [
  ["Solar", "$0.9M / MW"],
  ["Wind", "$1.4M / MW"],
  ["Hydro", "$2.0M / MW"],
  ["Geothermal", "$3.5M / MW"],
  ["Bioenergy", "$2.5M / MW"],
  ["Battery & Storage", "$1.2M / MW"],
  ["Hydrogen", "$3.0M / MW"],
  ["Nuclear", "$6.0M / MW"],
  ["Coal", "$1.5M / MW"],
  ["Oil & Gas", "$0.8M / MW"],
  ["Grid Expansion", "$0.5M / MW"],
];

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5 text-primary" size={18} />
        </div>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      </div>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export default function MethodologyPage() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">Methodology &amp; Data Notes</h1>
          <p className="text-muted-foreground text-sm">
            How AfriEnergy Tracker collects, validates, and presents African energy investment data.
            Last updated August 2026. This page is versioned with the product — when the pipeline
            changes, this page changes with it.
          </p>
        </div>

        <Section icon={BookOpen} title="What the tracker measures">
          <p>
            AfriEnergy Tracker follows <strong>publicly disclosed energy investment transactions and
            infrastructure projects</strong> across all 54 African countries, spanning power generation
            (solar, wind, hydro, geothermal, bioenergy, nuclear, coal, oil &amp; gas), grid expansion,
            battery storage, hydrogen, and clean cooking. A record enters the tracker when a project or
            transaction is announced, licensed, financed, under construction, or operational, and is
            attributable to a public source.
          </p>
        </Section>

        <Section icon={Database} title="Where the data comes from">
          <p>
            Records are drawn from five source groups: <strong>Global Energy Monitor</strong> (project
            inventory and capacity data), <strong>development finance institutions</strong> (World Bank
            Projects API, African Development Bank, IFC, U.S. DFC, Green Climate Fund, AidData),
            <strong> national regulators and agencies</strong> (including EPRA Kenya, NERSA and the IPP
            Office in South Africa, MASEN and ANRE in Morocco, Nigeria's REA, NREA Egypt, ERA Uganda,
            Ghana's Energy Commission, EWURA Tanzania, REG Rwanda, EEP Ethiopia, and the regional bodies
            ECREEE and SACREEE), <strong>curated energy media</strong> via news feeds, and a manually
            researched <strong>seed dataset</strong> of landmark transactions. Community members can also
            submit deals, which require two corroborating sources and pass through the same review
            pipeline as scraped records.
          </p>
          <p>
            Every record links to at least one source. A daily automated sweep re-checks source links for
            rot and flags broken ones.
          </p>
        </Section>

        <Section icon={Scale} title="Disclosed values vs. estimates — what counts in the totals">
          <p>
            This is the tracker's most important accounting rule. <strong>Headline dollar figures count
            only disclosed transaction values</strong> — amounts reported by a financier, developer,
            government, or credible publication. Two kinds of records are excluded from every aggregate
            dollar figure on every page:
          </p>
          <p>
            <strong>Estimated values.</strong> Where a project's capacity is known but no cost was ever
            disclosed, the tracker computes an indicative figure as capacity × a technology cost
            benchmark. These appear on individual deal pages marked <strong>"est."</strong> and contribute
            nothing to headline totals. Current benchmarks per MW of installed capacity:{" "}
            {BENCHMARKS.map(([t, v], i) => (
              <span key={t}>
                {t} {v}
                {i < BENCHMARKS.length - 1 ? "; " : "."}
              </span>
            ))}{" "}
            Benchmarks are indicative continental averages; actual project costs vary widely with
            geography, financing structure, and scope.
          </p>
          <p>
            <strong>Cancelled and decommissioned projects.</strong> These remain visible in the Deal
            Tracker for reference (history matters), but they are excluded from every statistic, chart,
            and country total — a cancelled plant is not investment.
          </p>
        </Section>

        <Section icon={Bot} title="How records are validated">
          <p>
            Scraped and AI-extracted records pass through a five-gate pipeline before publication: field
            validation and cleaning, name normalization, source-URL checks, a completeness score (0–100),
            and fuzzy duplicate matching against the existing database. Records then route three ways:
            high-scoring records with no issues publish automatically, mid-scoring records queue for
            human review, and low-scoring records are rejected. Records from bulk inventory sources and
            all community submissions are routed to <strong>human review</strong> regardless of score.
            AI extraction is used to read articles and documents, never to invent figures — a record
            with no source is not a record.
          </p>
        </Section>

        <Section icon={RefreshCcw} title="Update cadence">
          <p>
            News-based discovery and government, multilateral, and World Bank sources refresh on the 1st
            and 15th of each month. The Global Energy Monitor inventory refreshes monthly. Source links
            are re-checked daily. The AfriEnergy newsletter publishes every other Monday.
          </p>
        </Section>

        <Section icon={AlertTriangle} title="Known limitations">
          <p>
            Coverage skews toward projects that generate English, French, or Portuguese-language public
            records; smaller deals and some markets are under-represented. Automated extraction can
            misread figures — the review pipeline and community corrections exist precisely because of
            this. Capacity data inherited from inventory sources varies in quality. Deal-stage taxonomy
            is still being harmonized across sources. Nothing on this site is investment advice; the
            tracker is a research and transparency tool.
          </p>
        </Section>

        <Section icon={Mail} title="Corrections and contributions">
          <p>
            Spotted an error? Every correction makes the dataset better. Submit corrections or new deals
            through the <a href="/contribute" className="text-primary hover:underline">Contribute</a>{" "}
            page (two sources required), or reach the maintainer via the contact options there.
          </p>
        </Section>
      </div>
    </Layout>
  );
}
