import { FileText, Download, Calendar, ChevronRight, FileBarChart, Sparkles } from "lucide-react";
import { useLandlordPortfolio } from "@/hooks/useLandlordPortfolio";
import { useLandlordEsg } from "@/hooks/useApi";

const reports = [
  { title: "Q2 Portfolio ESG Report", date: "Apr 2026", pages: 24, tag: "ESG" },
  { title: "CO₂ Tax Exposure Forecast", date: "Apr 2026", pages: 12, tag: "Costs" },
  { title: "Retrofit Pipeline 2026", date: "Mar 2026", pages: 18, tag: "Strategy" },
  { title: "Building 4 Energy Audit", date: "Mar 2026", pages: 32, tag: "Audit" },
  { title: "Tenant Engagement Summary", date: "Feb 2026", pages: 9, tag: "Tenants" },
];

const Reports = () => {
  const { buildings } = useLandlordPortfolio();
  const targetPid = buildings[0]?.property_id ?? NaN;
  const esgQ = useLandlordEsg(targetPid);

  return (
    <div className="space-y-5 pt-2">
      <header>
        <h1 className="text-2xl font-extrabold">Reports</h1>
        <p className="text-sm text-muted-foreground">Export-ready insights for stakeholders.</p>
      </header>

      <section className="surface-card overflow-hidden bg-gradient-eco p-4 text-white shadow-glow-eco">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20">
            <FileBarChart className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">
              New this month
            </div>
            <h3 className="text-base font-extrabold">Q2 ESG Report ready</h3>
            <p className="mt-0.5 text-xs opacity-95">
              CSRD-aligned summary of portfolio efficiency, CO₂, and retrofit progress.
            </p>
            <button className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-charcoal">
              <Download className="h-3.5 w-3.5" /> Download PDF
            </button>
          </div>
        </div>
      </section>

      {esgQ.data && (
        <section className="surface-card p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-bold">AI executive summary — Property {esgQ.data.property_id}</h3>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
            {esgQ.data.narrative ?? "AI narrative unavailable. Raw metrics below."}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-xl bg-secondary p-2">
              <div className="font-bold text-muted-foreground">CO₂ (kg)</div>
              <div className="text-sm font-extrabold">
                {Math.round(esgQ.data.metrics.environmental.total_co2_kg).toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl bg-secondary p-2">
              <div className="font-bold text-muted-foreground">Energy score</div>
              <div className="text-sm font-extrabold">{esgQ.data.metrics.environmental.energy_score}</div>
            </div>
            <div className="rounded-xl bg-secondary p-2">
              <div className="font-bold text-muted-foreground">kg/m²</div>
              <div className="text-sm font-extrabold">
                {esgQ.data.metrics.environmental.carbon_intensity_kg_per_m2.toFixed(1)}
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-bold">Library</h3>
        <div className="space-y-2">
          {reports.map((r) => (
            <button key={r.title} className="surface-card flex w-full items-center gap-3 p-4 text-left">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-secondary">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold">{r.title}</span>
                </div>
                <div className="mt-0.5 inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {r.date}
                  </span>
                  <span>•</span>
                  <span>{r.pages} pages</span>
                  <span>•</span>
                  <span className="chip bg-accent-soft text-accent text-[10px]">{r.tag}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Reports;
