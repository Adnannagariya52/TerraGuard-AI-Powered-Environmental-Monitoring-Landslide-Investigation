import type { HistoryPoint, MonitoringEvent } from "./terraguard";

export type ReportStatus = "FINAL" | "IN_PROGRESS" | "UNAVAILABLE" | "DEMO";

export interface SensorDailyStats {
  sensorKey: string;
  label: string;
  unit: string;
  firstValue: number | null;
  lastValue: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  significantChange: string;
  timeOfNotable: string | null;
  notableReading: string | null;
  validSamples: number;
  totalExpectedSamples: number;
  availabilityPct: number;
  isMissing: boolean;
}

export interface ReportIncident {
  id: string;
  timestamp: string;
  category: string;
  severity: "info" | "watch" | "warning" | "critical";
  title: string;
  description: string;
  evidence?: string;
  source: string;
  acknowledged: boolean;
  resolved: boolean;
}

export interface DailyExecutiveSummary {
  overview: string;
  notableChanges: string[];
  elevatedConcernPeriods: string[];
  keyFindings: string[];
  limitations: string[];
  observedFacts: string[];
  aiInterpretations: string[];
}

export interface InvestigationReasoning {
  whatChanged: string;
  supportingEvidence: { signal: string; detail: string; timestamp: string }[];
  eventSequence: string;
  sensorConcordance: string;
  alternativeExplanations: string[];
  unresolvedQuestions: string[];
  observedVsHypothesis: string;
}

export interface DailyDataQuality {
  telemetryGaps: string[];
  staleReadingsCount: number;
  invalidValuesCount: number;
  sensorDisagreement: string | null;
  weatherGaps: string | null;
  confidenceLimitation: string;
  coveragePct: number;
}

export interface DailyConclusions {
  primaryFindings: string[];
  outstandingConcerns: string[];
  recommendedSiteChecks: string[];
  futureDataImprovements: string[];
}

export interface DailyReport {
  id: string;
  date: string; // YYYY-MM-DD
  observationStart: string; // ISO
  observationEnd: string; // ISO
  generatedAt: string; // ISO
  status: ReportStatus;
  isPartial: boolean;
  sampleCount: number;
  dataCoveragePct: number;
  siteId: string;
  siteName: string;
  locationLabel: string;
  coordinates: { lat: number | null; lon: number | null };
  executiveSummary: DailyExecutiveSummary;
  sensorStats: {
    soilMoisture: SensorDailyStats;
    rainIntensity: SensorDailyStats;
    groundDistance: SensorDailyStats;
    groundShift: SensorDailyStats;
    tilt: {
      triggeredCount: number;
      lastTriggeredAt: string | null;
      normalSamples: number;
      triggeredSamples: number;
    };
  };
  trendHistory: HistoryPoint[];
  incidentTimeline: ReportIncident[];
  investigation: InvestigationReasoning;
  alertsAndActions: MonitoringEvent[];
  dataQuality: DailyDataQuality;
  conclusions: DailyConclusions;
  pdfAvailable: boolean;
  pdfFilename: string;
  provenance: {
    mode: "demo" | "connected";
    model: string;
    source: string;
  };
}

export type PreparednessStatus = "Routine" | "Increased Monitoring" | "Insufficient Data";

export interface ForecastInterval {
  time: string;
  condition: string;
  precipMm: number;
  rainProbPct: number;
  tempC: number;
}

export interface NextDayForecast {
  provider: string;
  retrievedAt: string;
  forecastDate: string;
  predictedRainMm: number | null;
  rainProbabilityPct: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  expectedConditions: string;
  windSpeedKmh: number | null;
  intervals: ForecastInterval[];
  isStale: boolean;
  staleReason?: string;
}

export interface PrecautionItem {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  action: string;
  rationale: string;
  safetyNotice?: string;
  category: "inspection" | "sensor_check" | "operational" | "warning_monitoring";
}

export interface MonitoringPriority {
  signal: string;
  thresholdRule: string;
  escalationCondition: string;
  rationale: string;
  severity: "critical" | "warning" | "watch";
}

export interface NextDayOutlook {
  id: string;
  observationDate: string;
  forecastDate: string;
  generatedAt: string;
  status: PreparednessStatus;
  statusTone: "safe" | "watch" | "warning" | "neutral";
  summary: string;
  forecast: NextDayForecast | null;
  environmentalAssessment: {
    keyCarryoverConditions: string;
    forecastImpactAnalysis: string;
    continuedConcerns: string;
    uncertainties: string;
    triggerConditions: string;
    distinctionNotice: string;
  };
  precautions: PrecautionItem[];
  monitoringPriorities: MonitoringPriority[];
  limitations: string[];
  provenance: {
    mode: "demo" | "connected";
    model: string;
    forecastSource: string;
  };
}

export interface DailyReportSummary {
  id: string;
  date: string;
  status: ReportStatus;
  summary: string;
  incidentCount: number;
  criticalAlertCount: number;
  maxSoilMoisture: number | null;
  maxRainIntensity: number | null;
  maxShiftCm: number | null;
  tiltTriggered: boolean;
  dataCoveragePct: number;
  isPartial: boolean;
  hasPdf: boolean;
}
