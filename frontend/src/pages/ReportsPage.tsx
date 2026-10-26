import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CloudRain,
  Download,
  FileCheck,
  FileText,
  History,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Wind,
} from "lucide-react";
import { useTerraGuard } from "@/hooks/useTerraGuard";
import { createReportingService, type ReportingService } from "@/services/reportingService";
import type { DailyReport, DailyReportSummary, NextDayOutlook, ReportStatus } from "@/types/reports";
import { Badge, Button, EmptyState, KV, Panel, Skeleton } from "@/components/ui/primitives";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtClock, fmtNum, fmtTime, severityClasses } from "@/utils/format";
import { cn } from "@/utils/cn";

export function ReportsPage({ onNavigate: _onNavigate }: { onNavigate?: (p: any) => void }) {
  const { mode, pushToast } = useTerraGuard();
  const reportingService = useMemo<ReportingService>(() => createReportingService(mode), [mode]);

  // Selected date state (defaults to today)
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [activeTab, setActiveTab] = useState<"report" | "outlook" | "archive">("report");

  // Report and outlook data
  const [report, setReport] = useState<DailyReport | null>(null);
  const [outlook, setOutlook] = useState<NextDayOutlook | null>(null);
  const [archiveList, setArchiveList] = useState<DailyReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");

  // Load report and outlook for selectedDate
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        const [rep, out, list] = await Promise.all([
          reportingService.getReport(selectedDate),
          reportingService.getOutlook(selectedDate),
          reportingService.listReports(),
        ]);
        if (!cancelled) {
          setReport(rep);
          setOutlook(out);
          setArchiveList(list);
        }
      } catch (err) {
        console.warn("Failed loading reports:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, reportingService]);

  const handleDownloadPdf = async (targetDate: string = selectedDate) => {
    setDownloading(true);
    try {
      await reportingService.downloadPdf(targetDate);
      pushToast({
        title: "PDF Dossier Downloaded",
        description: `TerraGuard report for ${targetDate} saved to your downloads.`,
        tone: "success",
      });
    } catch (e) {
      pushToast({
        title: "Download Failed",
        description: e instanceof Error ? e.message : "Unable to compile PDF dossier.",
        tone: "critical",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      const generated = await reportingService.generateReport(selectedDate);
      setReport(generated);
      const updatedOutlook = await reportingService.getOutlook(selectedDate);
      setOutlook(updatedOutlook);
      const updatedList = await reportingService.listReports();
      setArchiveList(updatedList);
      pushToast({
        title: "Report Refreshed",
        description: `Daily report for ${selectedDate} updated with latest telemetry.`,
        tone: "success",
      });
    } catch (e) {
      pushToast({
        title: "Generation Failed",
        description: e instanceof Error ? e.message : "Report generation failed.",
        tone: "critical",
      });
    } finally {
      setGenerating(false);
    }
  };

  const statusTone = (s?: ReportStatus): "safe" | "watch" | "warning" | "demo" | "neutral" => {
    if (!s) return "neutral";
    if (s === "FINAL") return "safe";
    if (s === "IN_PROGRESS") return "watch";
    if (s === "DEMO") return "demo";
    return "neutral";
  };

  const filteredArchive = useMemo(() => {
    return archiveList.filter((item) => {
      return (
        item.date.includes(archiveSearch) ||
        item.summary.toLowerCase().includes(archiveSearch.toLowerCase()) ||
        item.status.toLowerCase().includes(archiveSearch.toLowerCase())
      );
    });
  }, [archiveList, archiveSearch]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      {/* ================= WORKSPACE HEADER ================= */}
      <section className="panel contour relative overflow-hidden p-5">
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-bold tracking-tight text-fg flex items-center gap-2.5">
                <FileText size={20} className="text-evergreen" />
                Reports & Next-Day Outlook
              </h1>
              {report && <Badge tone={statusTone(report.status)}>{report.status}</Badge>}
              {mode === "demo" ? (
                <Badge tone="demo">Simulated Data</Badge>
              ) : (
                <Badge tone="neutral">Connected Mode</Badge>
              )}
            </div>
            <p className="mt-1.5 max-w-2xl text-xs text-fg-2 leading-relaxed">
              Complete date-based environmental investigation dossiers, durable historical records,
              downloadable PDF archives, and next-day preparedness recommendations derived from sensor trends and weather forecasts.
            </p>
          </div>

          {/* Quick Date Picker & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1 text-xs shadow-2xs">
              <Calendar size={14} className="text-fg-3" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                aria-label="Select report date"
                className="bg-transparent font-mono text-xs text-fg focus:outline-none"
              />
            </div>

            <Button
              size="sm"
              variant="default"
              onClick={handleGenerateReport}
              disabled={generating || loading}
              className="gap-1.5"
            >
              <RefreshCw size={13} className={generating ? "animate-spin" : ""} />
              {generating ? "Generating…" : "Refresh"}
            </Button>

            <Button
              size="sm"
              variant="primary"
              onClick={() => handleDownloadPdf(selectedDate)}
              disabled={downloading || loading || !report}
              className="gap-1.5 bg-evergreen text-white hover:bg-deep-evergreen font-medium shadow-2xs"
            >
              <Download size={13} />
              {downloading ? "Compiling PDF…" : "Download PDF"}
            </Button>
          </div>
        </div>

        {/* Quick Date Pills */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <span className="text-[11px] font-mono text-fg-3 mr-1">Quick date select:</span>
          {archiveList.slice(0, 6).map((item) => (
            <button
              key={item.date}
              onClick={() => setSelectedDate(item.date)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-mono transition-colors",
                selectedDate === item.date
                  ? "bg-[#E5EEE7] text-evergreen border border-[#BCD1C4] font-semibold shadow-2xs"
                  : "bg-panel-2 border border-line text-fg-3 hover:text-fg hover:bg-panel"
              )}
            >
              {item.date === todayStr ? `Today (${item.date})` : item.date}
            </button>
          ))}
        </div>
      </section>

      {/* ================= WORKSPACE TABS ================= */}
      <div className="flex items-center gap-1.5 border-b border-line pb-1">
        <button
          onClick={() => setActiveTab("report")}
          aria-selected={activeTab === "report"}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors font-heading",
            activeTab === "report"
              ? "bg-[#E5EEE7] border border-[#BCD1C4] text-evergreen font-bold shadow-xs"
              : "text-fg-3 hover:text-fg hover:bg-line/40"
          )}
        >
          <FileCheck size={14} /> Daily Investigation Report
        </button>
        <button
          onClick={() => setActiveTab("outlook")}
          aria-selected={activeTab === "outlook"}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors font-heading",
            activeTab === "outlook"
              ? "bg-[#E5EEE7] border border-[#BCD1C4] text-evergreen font-bold shadow-xs"
              : "text-fg-3 hover:text-fg hover:bg-line/40"
          )}
        >
          <Sparkles size={14} /> Next-Day Preparedness Outlook
        </button>
        <button
          onClick={() => setActiveTab("archive")}
          aria-selected={activeTab === "archive"}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors font-heading",
            activeTab === "archive"
              ? "bg-[#E5EEE7] border border-[#BCD1C4] text-evergreen font-bold shadow-xs"
              : "text-fg-3 hover:text-fg hover:bg-line/40"
          )}
        >
          <History size={14} /> Report Archive ({archiveList.length})
        </button>
      </div>

      {/* ================= TAB 1: DAILY REPORT VIEW ================= */}
      {activeTab === "report" && (
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full rounded-xl" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : !report ? (
            <Panel title="Report Unavailable">
              <EmptyState
                icon={<FileText size={28} />}
                title={`No report available for ${selectedDate}`}
                description={
                  mode === "connected"
                    ? "The backend reporting service did not return records for this date. Confirm historical storage on your server."
                    : "No simulated telemetry was seeded for this date. Choose a date from the quick select pills above."
                }
              />
            </Panel>
          ) : (
            <>
              {/* Daily Executive Summary */}
              <Panel
                title={`Daily Executive Summary · ${report.date}`}
                subtitle={`Observation: ${fmtTime(report.observationStart)} — ${fmtTime(report.observationEnd)} · Coverage: ${report.dataCoveragePct}%`}
                tag={<Badge tone={statusTone(report.status)}>{report.status}</Badge>}
              >
                <div className="space-y-3">
                  <p className="text-sm text-fg leading-relaxed">{report.executiveSummary.overview}</p>

                  <div className="grid gap-3 sm:grid-cols-2 pt-2">
                    <div className="rounded-lg border border-line bg-panel-2 p-3 shadow-2xs">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-evergreen mb-1 flex items-center gap-1">
                        <Check size={12} /> Observed Direct Readings
                      </div>
                      <ul className="space-y-1 text-xs text-fg-2">
                        {report.executiveSummary.observedFacts.map((fact, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-evergreen shrink-0 mt-1.5" />
                            <span>{fact}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-lg border border-line bg-panel-2 p-3 shadow-2xs">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-blue-tg mb-1 flex items-center gap-1">
                        <Sparkles size={12} /> Gemma 4 AI Hypotheses
                      </div>
                      <ul className="space-y-1 text-xs text-fg-2">
                        {report.executiveSummary.aiInterpretations.map((hyp, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-tg shrink-0 mt-1.5" />
                            <span>{hyp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {report.executiveSummary.elevatedConcernPeriods.length > 0 && (
                    <div className="rounded-md border border-watch/30 bg-watch/5 p-2.5 text-xs text-watch flex items-start gap-2">
                      <Clock size={14} className="shrink-0 mt-0.5" />
                      <div>
                        <strong>Elevated Concern Periods: </strong>
                        {report.executiveSummary.elevatedConcernPeriods.join(" · ")}
                      </div>
                    </div>
                  )}
                </div>
              </Panel>

              {/* Sensor Daily Statistics Grid */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {/* Soil Moisture Stats */}
                <div className="panel p-4 space-y-2">
                  <div className="text-xs font-semibold text-fg-2 flex items-center justify-between">
                    <span>Soil Moisture</span>
                    <span className="font-mono text-[10px] text-fg-3">{report.sensorStats.soilMoisture.availabilityPct}% valid</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="font-mono text-3xl font-bold text-fg tnum">
                        {fmtNum(report.sensorStats.soilMoisture.max)}
                        <span className="text-sm font-normal text-fg-3 ml-1">%</span>
                      </div>
                      <div className="text-[10px] text-fg-3">Peak daily measurement</div>
                    </div>
                    <div className="text-right text-[11px] font-mono text-fg-3">
                      <div>Avg: {fmtNum(report.sensorStats.soilMoisture.avg)}%</div>
                      <div>Min: {fmtNum(report.sensorStats.soilMoisture.min)}%</div>
                    </div>
                  </div>
                  <div className="border-t border-line pt-2 text-[11px] text-fg-2">
                    {report.sensorStats.soilMoisture.significantChange}
                  </div>
                </div>

                {/* Rain Intensity Stats */}
                <div className="panel p-4 space-y-2">
                  <div className="text-xs font-semibold text-fg-2 flex items-center justify-between">
                    <span>Rain Intensity</span>
                    <span className="font-mono text-[10px] text-fg-3">{report.sensorStats.rainIntensity.availabilityPct}% valid</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="font-mono text-3xl font-bold text-fg tnum">
                        {fmtNum(report.sensorStats.rainIntensity.max)}
                        <span className="text-sm font-normal text-fg-3 ml-1">%</span>
                      </div>
                      <div className="text-[10px] text-fg-3">Relative peak intensity</div>
                    </div>
                    <div className="text-right text-[11px] font-mono text-fg-3">
                      <div>Avg: {fmtNum(report.sensorStats.rainIntensity.avg)}%</div>
                      <div>Min: {fmtNum(report.sensorStats.rainIntensity.min)}%</div>
                    </div>
                  </div>
                  <div className="border-t border-line pt-2 text-[11px] text-fg-2">
                    {report.sensorStats.rainIntensity.significantChange}
                  </div>
                </div>

                {/* Ground Shift Displacement */}
                <div className="panel p-4 space-y-2">
                  <div className="text-xs font-semibold text-fg-2 flex items-center justify-between">
                    <span>Ground Shift</span>
                    <span className="font-mono text-[10px] text-fg-3">{report.sensorStats.groundShift.availabilityPct}% valid</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="font-mono text-3xl font-bold text-fg tnum">
                        +{fmtNum(report.sensorStats.groundShift.max, 2)}
                        <span className="text-sm font-normal text-fg-3 ml-1">cm</span>
                      </div>
                      <div className="text-[10px] text-fg-3">Max displacement to sensor</div>
                    </div>
                    <div className="text-right text-[11px] font-mono text-fg-3">
                      <div>Avg: +{fmtNum(report.sensorStats.groundShift.avg, 2)} cm</div>
                      <div>Min: {fmtNum(report.sensorStats.groundShift.min, 2)} cm</div>
                    </div>
                  </div>
                  <div className="border-t border-line pt-2 text-[11px] text-fg-2">
                    {report.sensorStats.groundShift.significantChange}
                  </div>
                </div>

                {/* Tilt Sensor Status */}
                <div className="panel p-4 space-y-2">
                  <div className="text-xs font-semibold text-fg-2 flex items-center justify-between">
                    <span>Tilt Switch</span>
                    <Badge tone={report.sensorStats.tilt.triggeredCount > 0 ? "warning" : "safe"}>
                      {report.sensorStats.tilt.triggeredCount > 0 ? "Triggered" : "Normal"}
                    </Badge>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="font-mono text-3xl font-bold text-fg tnum">
                        {report.sensorStats.tilt.triggeredCount}
                      </div>
                      <div className="text-[10px] text-fg-3">Total trigger transitions</div>
                    </div>
                    <div className="text-right text-[11px] font-mono text-fg-3">
                      <div>Normal: {report.sensorStats.tilt.normalSamples}</div>
                      <div>Samples: {report.sampleCount}</div>
                    </div>
                  </div>
                  <div className="border-t border-line pt-2 text-[11px] text-fg-3">
                    Last trigger: {report.sensorStats.tilt.lastTriggeredAt ? fmtTime(report.sensorStats.tilt.lastTriggeredAt) : "None"}
                  </div>
                </div>
              </div>

              {/* Full-Day 24-Hour Trend Chart */}
              <Panel
                title="Full-Day 24-Hour Telemetry Trends"
                subtitle="Hourly distribution of soil moisture, rain intensity, and ground displacement"
              >
                <div className="h-[260px] w-full" role="img" aria-label="24-hour telemetry trend chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={report.trendHistory} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="repSoilGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2D6A57" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#2D6A57" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="repRainGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4D85BE" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#4D85BE" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#DFE2D9" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="t"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={fmtClock}
                        tick={{ fill: "#77817B", fontSize: 10 }}
                        axisLine={{ stroke: "#DFE2D9" }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: "#77817B", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                        unit="%"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#FFFEFA",
                          border: "1px solid #DFE2D9",
                          borderRadius: 8,
                          fontSize: 11,
                          padding: "6px 10px",
                          boxShadow: "0 4px 12px rgba(25, 44, 42, 0.08)",
                          color: "#202B2A",
                        }}
                        labelFormatter={(v) => fmtClock(Number(v))}
                        formatter={(v: any, name: any) => [
                          `${Number(v).toFixed(1)} ${name === "Ground Shift" ? "cm" : "%"}`,
                          String(name),
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="soilMoisture"
                        name="Soil Moisture"
                        stroke="#2D6A57"
                        strokeWidth={1.8}
                        fill="url(#repSoilGrad)"
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="rainIntensity"
                        name="Rain Intensity"
                        stroke="#4D85BE"
                        strokeWidth={1.5}
                        fill="url(#repRainGrad)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-fg-3">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-evergreen" /> Soil Moisture (%)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#4D85BE]" /> Rain Intensity (%)
                    </span>
                  </div>
                  <span>{report.trendHistory.length} chronological points plotted</span>
                </div>
              </Panel>

              {/* Incidents & AI Investigation Two-Column Layout */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Incident Timeline */}
                <Panel
                  title="Incident & Alert Chronology"
                  subtitle={`${report.incidentTimeline.length} events logged during observation`}
                >
                  {report.incidentTimeline.length === 0 ? (
                    <div className="py-8 text-center text-xs text-fg-3">
                      No elevated alerts or trigger transitions logged on this date.
                    </div>
                  ) : (
                    <ul className="divide-y divide-line">
                      {report.incidentTimeline.map((inc) => (
                        <li key={inc.id} className="py-2.5 flex items-start gap-3 text-xs">
                          <span
                            className={cn(
                              "mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                              severityClasses[inc.severity]
                            )}
                          >
                            {inc.severity}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-fg">{inc.title}</span>
                              <span className="font-mono text-[10px] text-fg-3 tnum">
                                {fmtTime(inc.timestamp)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-fg-2 text-[11px] leading-relaxed">{inc.description}</p>
                            {inc.evidence && (
                              <div className="mt-1 font-mono text-[10px] text-fg-3 bg-panel-2 px-1.5 py-0.5 rounded border border-line">
                                Evidence: {inc.evidence}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                {/* AI Environmental Investigation */}
                <Panel
                  title="Environmental Reasoning & Multi-Sensor Concordance"
                  subtitle="Gemma 4 evidence synthesis"
                  tag={<Badge tone="demo">{report.provenance.model}</Badge>}
                >
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-fg-3">What Changed</div>
                      <p className="mt-0.5 text-fg leading-relaxed">{report.investigation.whatChanged}</p>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-fg-3">
                        Event Sequence & Causal Chain
                      </div>
                      <p className="mt-0.5 text-fg-2 leading-relaxed">{report.investigation.eventSequence}</p>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-fg-3">
                        Multi-Sensor Concordance
                      </div>
                      <p className="mt-0.5 text-fg-2 leading-relaxed">{report.investigation.sensorConcordance}</p>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-fg-3">
                        Alternative Hypotheses Considered
                      </div>
                      <ul className="mt-0.5 space-y-1 text-fg-2">
                        {report.investigation.alternativeExplanations.map((alt, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-evergreen shrink-0 mt-1.5" />
                            <span>{alt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Panel>
              </div>

              {/* Data Quality & Limitations + Site Conclusions */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Data Quality & Reliability Audit" subtitle="Sensor integrity & telemetry limitations">
                  <div className="space-y-2 text-xs">
                    <KV k="Data Coverage" v={`${report.dataCoveragePct}% of observation period`} />
                    <KV k="Valid Samples" v={`${report.sampleCount} frames`} />
                    <KV k="Stale Samples" v={report.dataQuality.staleReadingsCount} />
                    <KV k="Telemetry Gaps" v={report.dataQuality.telemetryGaps.join("; ") || "None"} />
                    <KV
                      k="Sensor Agreement"
                      v={report.dataQuality.sensorDisagreement || "All reporting sensors in agreement"}
                    />
                    <div className="mt-3 rounded-lg border border-line bg-panel-2 p-2.5 text-[11px] text-fg-3 leading-relaxed shadow-2xs">
                      <strong>Honest Limitation: </strong>
                      {report.dataQuality.confidenceLimitation}
                    </div>
                  </div>
                </Panel>

                <Panel title="Daily Conclusions & Site Recommendations" subtitle="Site operator actionable checklist">
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-fg-3">Key Conclusions</div>
                      <ul className="mt-1 space-y-1 text-fg-2">
                        {report.conclusions.primaryFindings.map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <CheckCircle2 size={12} className="text-evergreen shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-fg-3">
                        Recommended Physical Checks
                      </div>
                      <ul className="mt-1 space-y-1 text-fg-2">
                        {report.conclusions.recommendedSiteChecks.map((chk, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-antique-gold shrink-0 mt-1.5" />
                            <span>{chk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Panel>
              </div>
            </>
          )}
        </div>
      )}

      {/* ================= TAB 2: NEXT-DAY PREPAREDNESS OUTLOOK ================= */}
      {activeTab === "outlook" && (
        <div className="space-y-4">
          {!outlook ? (
            <Panel title="Next-Day Outlook Unavailable">
              <EmptyState
                icon={<Sparkles size={28} />}
                title="Outlook unavailable for this date"
                description="Unable to compile forecast outlook without prior day telemetry."
              />
            </Panel>
          ) : (
            <>
              {/* Outlook Status Banner */}
              <div
                className={cn(
                  "panel p-5 rounded-xl border flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-sm",
                  outlook.status === "Increased Monitoring"
                    ? "border-watch/40 bg-watch-bg"
                    : "border-evergreen/30 bg-[#E5EEE7]/80"
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-mono font-bold tracking-wider text-fg-3">
                      Preparedness Level for {outlook.forecastDate}
                    </span>
                    <Badge tone={outlook.statusTone}>{outlook.status}</Badge>
                  </div>
                  <h2 className="font-heading text-lg font-bold text-fg mt-1">{outlook.summary}</h2>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleDownloadPdf(selectedDate)}
                    disabled={downloading}
                    className="gap-1.5 bg-evergreen text-white hover:bg-deep-evergreen font-medium shadow-2xs"
                  >
                    <Download size={13} />
                    Download Complete Dossier
                  </Button>
                </div>
              </div>

              {/* Weather Forecast Context (Open-Meteo Integration) */}
              {outlook.forecast && (
                <Panel
                  title={`Available Weather Forecast · Target: ${outlook.forecastDate}`}
                  subtitle={`${outlook.forecast.provider} · Retrieved ${fmtTime(outlook.forecast.retrievedAt)}`}
                  tag={<Badge tone="neutral">Weather Forecast · Not Measured Readings</Badge>}
                >
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-lg border border-line bg-panel-2 p-3 shadow-2xs">
                      <div className="text-[10px] text-fg-3 flex items-center gap-1">
                        <CloudRain size={12} className="text-slate-blue" /> Expected Rainfall
                      </div>
                      <div className="mt-1 font-mono text-2xl font-bold text-fg tnum">
                        {fmtNum(outlook.forecast.predictedRainMm)} mm
                      </div>
                      <div className="text-[10px] text-slate-blue font-medium">
                        {outlook.forecast.rainProbabilityPct}% precipitation probability
                      </div>
                    </div>

                    <div className="rounded-lg border border-line bg-panel-2 p-3 shadow-2xs">
                      <div className="text-[10px] text-fg-3 flex items-center gap-1">
                        <Thermometer size={12} className="text-copper" /> Temperature Range
                      </div>
                      <div className="mt-1 font-mono text-2xl font-bold text-fg tnum">
                        {fmtNum(outlook.forecast.tempMinC)}° — {fmtNum(outlook.forecast.tempMaxC)}°
                      </div>
                      <div className="text-[10px] text-fg-3">Diurnal range (°C)</div>
                    </div>

                    <div className="rounded-lg border border-line bg-panel-2 p-3 shadow-2xs">
                      <div className="text-[10px] text-fg-3 flex items-center gap-1">
                        <Wind size={12} className="text-evergreen" /> Wind Speed
                      </div>
                      <div className="mt-1 font-mono text-2xl font-bold text-fg tnum">
                        {fmtNum(outlook.forecast.windSpeedKmh)} km/h
                      </div>
                      <div className="text-[10px] text-fg-3">Gust conditions</div>
                    </div>

                    <div className="rounded-lg border border-line bg-panel-2 p-3 shadow-2xs">
                      <div className="text-[10px] text-fg-3">Expected Conditions</div>
                      <div className="mt-1 text-sm font-semibold text-fg">
                        {outlook.forecast.expectedConditions}
                      </div>
                      <div className="text-[10px] text-fg-3">Regional numerical model</div>
                    </div>
                  </div>

                  {/* Hourly Forecast Intervals */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {outlook.forecast.intervals.map((inv) => (
                      <div key={inv.time} className="rounded-lg border border-line bg-panel p-2.5 text-xs shadow-2xs">
                        <div className="flex items-center justify-between font-mono text-[10px] text-fg-3">
                          <span>{inv.time}</span>
                          <span>{inv.rainProbPct}% rain</span>
                        </div>
                        <div className="mt-1 font-medium text-fg">{inv.condition}</div>
                        <div className="font-mono text-blue-tg text-[11px] font-semibold">{inv.precipMm} mm</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {/* Environmental Preparedness Assessment */}
              <Panel
                title="Environmental Preparedness Assessment"
                subtitle="Gemma 4 model reasoning over antecedent conditions + weather outlook"
              >
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-fg-3">
                      Antecedent Moisture Carryover
                    </div>
                    <p className="mt-0.5 text-fg leading-relaxed">
                      {outlook.environmentalAssessment.keyCarryoverConditions}
                    </p>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-fg-3">
                      Forecast Impact Analysis
                    </div>
                    <p className="mt-0.5 text-fg-2 leading-relaxed">
                      {outlook.environmentalAssessment.forecastImpactAnalysis}
                    </p>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-fg-3">
                      Configured Trigger Thresholds
                    </div>
                    <p className="mt-0.5 font-mono text-fg-2 bg-panel-2 p-2 rounded border border-line">
                      {outlook.environmentalAssessment.triggerConditions}
                    </p>
                  </div>

                  <div className="rounded-lg border border-line bg-panel-2 p-2.5 text-[11px] text-fg-3 leading-relaxed shadow-2xs">
                    {outlook.environmentalAssessment.distinctionNotice}
                  </div>
                </div>
              </Panel>

              {/* Prioritized Action Checklist */}
              <Panel
                title="Prioritized Precautions Checklist"
                subtitle="Recommended operational precautions ranked by risk severity"
              >
                <div className="space-y-3">
                  {outlook.precautions.map((p, idx) => (
                    <div
                      key={p.id}
                      className={cn(
                        "rounded-lg border p-3.5 space-y-1 text-xs shadow-2xs",
                        p.priority === "high"
                          ? "border-critical/30 bg-critical-bg"
                          : p.priority === "medium"
                          ? "border-watch/30 bg-watch-bg"
                          : "border-line bg-panel-2"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                              p.priority === "high"
                                ? "bg-critical/15 text-critical border border-critical/30"
                                : p.priority === "medium"
                                ? "bg-watch/15 text-watch border border-watch/30"
                                : "bg-panel text-fg-3 border border-line"
                            )}
                          >
                            {p.priority} Priority
                          </span>
                          <span className="font-semibold text-fg text-sm">
                            {idx + 1}. {p.title}
                          </span>
                        </div>
                      </div>

                      <p className="text-fg-2 text-xs pt-1 leading-relaxed">
                        <strong className="text-fg">Action: </strong>
                        {p.action}
                      </p>

                      <p className="text-fg-3 text-[11px]">
                        <strong className="text-fg-2">Rationale: </strong>
                        {p.rationale}
                      </p>

                      {p.safetyNotice && (
                        <div className="mt-2 text-[11px] font-medium text-coral-tg flex items-center gap-1.5">
                          <ShieldAlert size={12} />
                          <span>{p.safetyNotice}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Specific Monitoring Priorities */}
              <Panel
                title="Configured Monitoring Priorities & Escalation Conditions"
                subtitle="Exact thresholds configured in system logic"
              >
                <div className="grid gap-3 md:grid-cols-3">
                  {outlook.monitoringPriorities.map((mp, i) => (
                    <div key={i} className="rounded-lg border border-line bg-panel-2 p-3 space-y-1.5 text-xs shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-fg">{mp.signal}</span>
                        <span
                          className={cn(
                            "rounded px-1 text-[9px] font-bold uppercase",
                            severityClasses[mp.severity]
                          )}
                        >
                          {mp.severity}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-fg-3">{mp.thresholdRule}</div>
                      <div className="text-[11px] text-fg-2">
                        <strong className="text-fg">Escalation: </strong>
                        {mp.escalationCondition}
                      </div>
                      <div className="text-[10px] text-fg-3">{mp.rationale}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}
        </div>
      )}

      {/* ================= TAB 3: DATE-WISE REPORT ARCHIVE ================= */}
      {activeTab === "archive" && (
        <div className="space-y-4">
          <Panel
            title="Date-Wise Report Archive"
            subtitle="Search and retrieve environmental dossiers across observation history"
            actions={
              <div className="flex items-center gap-2">
                <Search size={14} className="text-fg-3" />
                <input
                  type="text"
                  placeholder="Filter by date, status, keywords…"
                  value={archiveSearch}
                  onChange={(e) => setArchiveSearch(e.target.value)}
                  className="h-8 w-52 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg shadow-2xs focus:outline-none focus:border-evergreen/60 focus:ring-1 focus:ring-evergreen/20"
                />
              </div>
            }
          >
            {filteredArchive.length === 0 ? (
              <EmptyState
                icon={<History size={24} />}
                title="No reports match your filter"
                description="Try another search term or clear the filter."
              />
            ) : (
              <div className="divide-y divide-line">
                {filteredArchive.map((item) => (
                  <div
                    key={item.id}
                    className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-panel-2 px-3 rounded-xl transition-colors"
                  >
                    <div className="space-y-1 max-w-2xl">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-fg">{item.date}</span>
                        <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                        <span className="text-[11px] text-fg-3">· {item.dataCoveragePct}% coverage</span>
                        {item.criticalAlertCount > 0 && (
                          <span className="rounded bg-critical/15 text-critical text-[10px] font-bold px-1.5 py-0.5">
                            {item.criticalAlertCount} Critical Alert
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-fg-2 leading-relaxed">{item.summary}</p>
                      <div className="flex items-center gap-3 text-[10px] font-mono text-fg-3">
                        <span>Max Soil: {fmtNum(item.maxSoilMoisture)}%</span>
                        <span>Max Rain: {fmtNum(item.maxRainIntensity)}%</span>
                        <span>Max Shift: {item.maxShiftCm !== null ? `+${item.maxShiftCm.toFixed(2)} cm` : "—"}</span>
                        <span>Tilt Triggered: {item.tiltTriggered ? "Yes" : "No"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="xs"
                        variant="default"
                        onClick={() => {
                          setSelectedDate(item.date);
                          setActiveTab("report");
                        }}
                        className="gap-1"
                      >
                        <FileText size={12} /> View Report
                      </Button>
                      <Button
                        size="xs"
                        variant="primary"
                        onClick={() => handleDownloadPdf(item.date)}
                        className="gap-1 bg-evergreen text-white hover:bg-deep-evergreen font-medium shadow-2xs"
                      >
                        <Download size={12} /> Download PDF
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
