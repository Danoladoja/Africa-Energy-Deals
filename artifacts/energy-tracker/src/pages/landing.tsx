import { useState } from "react";
import { useLocation } from "wouter";
import { useGetSummaryStats } from "@workspace/api-client-react";
import { BarChart2, Globe, Layers, Cpu } from "lucide-react";

function formatBillions(mn: number) {
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

export default function Landing() {
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();
  const { data: stats } = useGetSummaryStats();

  function handleExplore(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/deals?search=${encodeURIComponent(search.trim())}`);
    } else {
      navigate("/deals");
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white flex flex-col">
      {/* Navbar */}
      <header className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <img
              src={`${import.meta.env.BASE_URL}images/logo-icon.png`}
              alt="AfriEnergy Logo"
              className="w-6 h-6 object-contain filter brightness-0"
            />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">AfriEnergy</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm text-white/70">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#data" className="hover:text-white transition-colors">Data</a>
          <a href="#about" className="hover:text-white transition-colors">About</a>
        </nav>

        <button
          onClick={() => navigate("/dashboard")}
          className="bg-[#00e676] hover:bg-[#00c864] text-[#0b0f1a] font-semibold text-sm px-5 py-2.5 rounded-full transition-colors shadow-lg shadow-[#00e676]/20"
        >
          Launch Tracker
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-16 pb-24 max-w-4xl mx-auto w-full">
        <h1 className="text-6xl md:text-7xl lg:text-8xl font-extrabold leading-[1.05] tracking-tight mb-8">
          <span className="text-white">Africa's Energy</span>
          <br />
          <span className="text-[#00e676]">Investment</span>
          <br />
          <span className="text-[#00e676]">Tracker.</span>
        </h1>

        <p className="text-white/60 text-lg md:text-xl max-w-xl leading-relaxed mb-12">
          Search, explore and visualise disclosed energy transactions across
          the continent. Track project financing, monitor deal pipelines, and
          generate data-driven insights.
        </p>

        {/* Search Bar */}
        <form
          onSubmit={handleExplore}
          className="flex items-center w-full max-w-lg gap-3 mb-20"
        >
          <div className="flex-1 flex items-center bg-white/8 border border-white/12 rounded-full px-5 py-3.5 gap-3 focus-within:border-[#00e676]/50 focus-within:bg-white/10 transition-all">
            <svg className="w-4 h-4 text-white/40 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project, country, investor..."
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/35 outline-none"
            />
          </div>
          <button
            type="submit"
            className="bg-[#00e676] hover:bg-[#00c864] text-[#0b0f1a] font-semibold text-sm px-6 py-3.5 rounded-full transition-colors whitespace-nowrap shadow-lg shadow-[#00e676]/20"
          >
            Explore Data
          </button>
        </form>

        {/* Stats */}
        <div className="flex items-start justify-center gap-0 w-full max-w-2xl">
          {[
            {
              value: stats ? formatBillions(stats.totalInvestmentUsdMn) : "—",
              label: "Total Investment",
              icon: <BarChart2 className="w-4 h-4" />,
            },
            {
              value: stats ? stats.totalProjects.toString() : "—",
              label: "Total Projects",
              icon: <Layers className="w-4 h-4" />,
            },
            {
              value: stats ? stats.totalCountries.toString() : "—",
              label: "Countries",
              icon: <Globe className="w-4 h-4" />,
            },
            {
              value: stats ? stats.totalTechnologies.toString() : "—",
              label: "Technologies",
              icon: <Cpu className="w-4 h-4" />,
            },
          ].map((stat, i, arr) => (
            <div
              key={stat.label}
              className={`flex-1 flex flex-col items-center gap-1 px-4 ${i < arr.length - 1 ? "border-r border-white/10" : ""}`}
            >
              <span className="text-3xl md:text-4xl font-extrabold text-[#00e676] tracking-tight">
                {stat.value}
              </span>
              <span className="text-white/50 text-xs uppercase tracking-widest mt-1">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </main>

      {/* Features Section */}
      <section id="features" className="bg-white/3 border-t border-white/8 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-3">Everything you need to track Africa's energy deals</h2>
          <p className="text-white/50 text-center mb-12 max-w-lg mx-auto">A comprehensive platform built for analysts, investors, and policymakers.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <Layers className="w-6 h-6 text-[#00e676]" />,
                title: "Deal Database",
                desc: "Search and filter 50+ disclosed energy transactions across 21 African countries by technology, status, deal size, and investors.",
              },
              {
                icon: <Globe className="w-6 h-6 text-[#00e676]" />,
                title: "Interactive Map",
                desc: "Visualise project locations on a full-screen Africa map with color-coded markers by technology type and clickable detail popups.",
              },
              {
                icon: <BarChart2 className="w-6 h-6 text-[#00e676]" />,
                title: "Visualization Studio",
                desc: "Generate custom bar, line, and pie charts by country, region, technology, or year — and download them as ready-to-use infographics.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-white/4 border border-white/8 rounded-2xl p-6 hover:border-[#00e676]/30 transition-colors">
                <div className="w-11 h-11 rounded-xl bg-[#00e676]/10 flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-10">
            <button
              onClick={() => navigate("/dashboard")}
              className="bg-[#00e676] hover:bg-[#00c864] text-[#0b0f1a] font-semibold px-8 py-3.5 rounded-full transition-colors shadow-lg shadow-[#00e676]/20"
            >
              Launch Tracker →
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/8 py-8 px-8 text-center text-white/30 text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-primary/20">
            <img
              src={`${import.meta.env.BASE_URL}images/logo-icon.png`}
              alt="AfriEnergy Logo"
              className="w-4 h-4 object-contain filter brightness-0"
            />
          </div>
          <span className="font-display font-semibold text-white/60">AfriEnergy</span>
        </div>
        Africa's Energy Investment Tracker · Data sourced from publicly disclosed transactions
      </footer>
    </div>
  );
}
