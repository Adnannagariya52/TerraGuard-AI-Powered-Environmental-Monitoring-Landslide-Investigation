import type { DailyReport, DailyReportSummary, NextDayOutlook, SensorDailyStats } from "@/types/reports";
import { downloadReportPdf } from "@/utils/pdfGenerator";
import { API_BASE_URL } from "@/config/env";
import { DEMO_SITE, THRESHOLDS } from "@/data/mockTerraGuard";

export interface ReportingService {
  readonly adapterName: string;
  listReports(): Promise<DailyReportSummary[]>;
  getReport(date: string): Promise<DailyReport | null>;
  generateReport(date: string): Promise<DailyReport>;
  getOutlook(date: string): Promise<NextDayOutlook | null>;
  downloadPdf(date: string): Promise<void>;
}

// Helper to format ISO date YYYY-MM-DD
function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ----------------- MOCK REPORTING SERVICE -----------------
export class MockReportingService implements ReportingService {
  readonly adapterName = "Demo Simulation Reporting Service";

  private getDates() {
    const today = new Date();
    const d0 = toDateStr(today);
    const d1 = toDateStr(new Date(today.getTime() - 1 * 86400000));
    const d2 = toDateStr(new Date(today.getTime() - 2 * 86400000));
    const d3 = toDateStr(new Date(today.getTime() - 3 * 86400000));
    const d4 = toDateStr(new Date(today.getTime() - 4 * 86400000));
    const d7 = toDateStr(new Date(today.getTime() - 7 * 86400000));
    return { d0, d1, d2, d3, d4, d7 };
  }

  async listReports(): Promise<DailyReportSummary[]> {
    const { d0, d1, d2, d3, d4, d7 } = this.getDates();

    return [
      {
        id: `rep_${d0}`,
        date: d0,
        status: "IN_PROGRESS",
        summary: "Current day monitoring in progress. Intermittent rainfall with moderately elevated soil moisture (62%). Displacement sensor stable.",
        incidentCount: 2,
        criticalAlertCount: 0,
        maxSoilMoisture: 64.2,
        maxRainIntensity: 48.0,
        maxShiftCm: 0.85,
        tiltTriggered: false,
        dataCoveragePct: 78,
        isPartial: true,
        hasPdf: true,
      },
      {
        id: `rep_${d1}`,
        date: d1,
        status: "FINAL",
        summary: "Full 24-hour cycle completed. Heavy afternoon precipitation caused sharp rise in soil saturation to 78.4%. Watch threshold reached; no critical displacement.",
        incidentCount: 5,
        criticalAlertCount: 0,
        maxSoilMoisture: 78.4,
        maxRainIntensity: 82.0,
        maxShiftCm: 1.42,
        tiltTriggered: false,
        dataCoveragePct: 98,
        isPartial: false,
        hasPdf: true,
      },
      {
        id: `rep_${d2}`,
        date: d2,
        status: "FINAL",
        summary: "Severe storm front crossed ridge sector 7. Tilt sensor recorded 3 transient transitions during sustained rainfall. Ground shift reached 2.8 cm.",
        incidentCount: 8,
        criticalAlertCount: 1,
        maxSoilMoisture: 84.1,
        maxRainIntensity: 91.5,
        maxShiftCm: 2.84,
        tiltTriggered: true,
        dataCoveragePct: 96,
        isPartial: false,
        hasPdf: true,
      },
      {
        id: `rep_${d3}`,
        date: d3,
        status: "FINAL",
        summary: "Post-storm stabilization period. High residual pore moisture gradually draining. Ground distance readings stable within 0.2 cm baseline.",
        incidentCount: 1,
        criticalAlertCount: 0,
        maxSoilMoisture: 69.0,
        maxRainIntensity: 18.0,
        maxShiftCm: 0.45,
        tiltTriggered: false,
        dataCoveragePct: 100,
        isPartial: false,
        hasPdf: true,
      },
      {
        id: `rep_${d4}`,
        date: d4,
        status: "FINAL",
        summary: "Fair weather conditions. Baseline sensor calibration verified. Acoustic ambient levels minimal.",
        incidentCount: 0,
        criticalAlertCount: 0,
        maxSoilMoisture: 42.0,
        maxRainIntensity: 5.0,
        maxShiftCm: 0.12,
        tiltTriggered: false,
        dataCoveragePct: 99,
        isPartial: false,
        hasPdf: true,
      },
      {
        id: `rep_${d7}`,
        date: d7,
        status: "FINAL",
        summary: "Weekly calibration cycle. Ultrasonic baseline verified at 48.0 cm. Routine maintenance window logged.",
        incidentCount: 0,
        criticalAlertCount: 0,
        maxSoilMoisture: 38.5,
        maxRainIntensity: 0.0,
        maxShiftCm: 0.08,
        tiltTriggered: false,
        dataCoveragePct: 95,
        isPartial: false,
        hasPdf: true,
      },
    ];
  }

  async getReport(date: string): Promise<DailyReport | null> {
    const { d0, d1, d2, d3, d4, d7 } = this.getDates();

    const isToday = date === d0;
    const isYesterday = date === d1;
    const isStormDay = date === d2;

    const validDates = [d0, d1, d2, d3, d4, d7];
    if (!validDates.includes(date) && date !== d0) {
      // If user selected a custom date not in mock seed
      return null;
    }

    const soilMax = isStormDay ? 84.1 : isYesterday ? 78.4 : isToday ? 64.2 : 45.0;
    const soilAvg = isStormDay ? 74.0 : isYesterday ? 62.5 : isToday ? 54.0 : 38.0;
    const rainMax = isStormDay ? 91.5 : isYesterday ? 82.0 : isToday ? 48.0 : 12.0;
    const shiftMax = isStormDay ? 2.84 : isYesterday ? 1.42 : isToday ? 0.85 : 0.2;

    const soilStats: SensorDailyStats = {
      sensorKey: "soilMoisture",
      label: "Volumetric Soil Moisture",
      unit: "%",
      firstValue: isStormDay ? 56.0 : isYesterday ? 42.0 : 48.5,
      lastValue: isToday ? 62.1 : isStormDay ? 81.2 : 58.0,
      min: isStormDay ? 52.0 : isYesterday ? 38.0 : 36.0,
      max: soilMax,
      avg: soilAvg,
      significantChange: isStormDay ? "+28.1% surge over 4 hours" : isYesterday ? "+36.4% post-downpour" : "+13.6% gradual rise",
      timeOfNotable: `${date}T14:30:00Z`,
      notableReading: `${soilMax}% peak saturation`,
      validSamples: isToday ? 420 : 860,
      totalExpectedSamples: isToday ? 480 : 864,
      availabilityPct: isToday ? 87.5 : 99.5,
      isMissing: false,
    };

    const rainStats: SensorDailyStats = {
      sensorKey: "rainIntensity",
      label: "Rainfall Intensity",
      unit: "%",
      firstValue: 0.0,
      lastValue: isToday ? 18.0 : 0.0,
      min: 0.0,
      max: rainMax,
      avg: isStormDay ? 42.0 : isYesterday ? 28.5 : 14.2,
      significantChange: isStormDay ? "Sustained high intensity >80% for 90 min" : "Intermittent squalls",
      timeOfNotable: `${date}T13:45:00Z`,
      notableReading: `${rainMax}% relative sensor rate`,
      validSamples: isToday ? 420 : 860,
      totalExpectedSamples: isToday ? 480 : 864,
      availabilityPct: isToday ? 87.5 : 99.5,
      isMissing: false,
    };

    const groundDistStats: SensorDailyStats = {
      sensorKey: "groundDistance",
      label: "Ultrasonic Distance to Ground",
      unit: "cm",
      firstValue: 48.0,
      lastValue: isStormDay ? 45.16 : isYesterday ? 46.58 : 47.15,
      min: isStormDay ? 45.16 : isYesterday ? 46.58 : 47.15,
      max: 48.2,
      avg: isStormDay ? 46.2 : isYesterday ? 47.1 : 47.6,
      significantChange: isStormDay ? "Shrank by 2.84 cm toward sensor" : "Stable within baseline tolerance",
      timeOfNotable: `${date}T15:10:00Z`,
      notableReading: `${isStormDay ? "45.16 cm" : "47.15 cm"} minimum clearance`,
      validSamples: isToday ? 420 : 860,
      totalExpectedSamples: isToday ? 480 : 864,
      availabilityPct: isToday ? 87.5 : 99.5,
      isMissing: false,
    };

    const groundShiftStats: SensorDailyStats = {
      sensorKey: "groundShift",
      label: "Calculated Ground Displacement",
      unit: "cm",
      firstValue: 0.0,
      lastValue: shiftMax,
      min: -0.1,
      max: shiftMax,
      avg: shiftMax * 0.6,
      significantChange: isStormDay ? "Net +2.84 cm movement toward sensor" : "Mild heave (+0.8 cm)",
      timeOfNotable: `${date}T15:10:00Z`,
      notableReading: `+${shiftMax} cm max displacement`,
      validSamples: isToday ? 420 : 860,
      totalExpectedSamples: isToday ? 480 : 864,
      availabilityPct: isToday ? 87.5 : 99.5,
      isMissing: false,
    };

    // Generate 24 hour trend history
    const trendHistory = [];
    const baseEpoch = new Date(`${date}T00:00:00Z`).getTime();
    for (let h = 0; h < (isToday ? 16 : 24); h++) {
      const t = baseEpoch + h * 3600000;
      const s = Math.min(soilMax, 38 + (soilMax - 38) * Math.sin((h / 24) * Math.PI));
      const r = h >= 11 && h <= 17 ? rainMax * Math.sin(((h - 11) / 6) * Math.PI) : Math.random() * 8;
      const sh = h >= 12 ? shiftMax * ((h - 11) / 13) : 0.1;
      trendHistory.push({
        t,
        soilMoisture: Math.round(s * 10) / 10,
        rainIntensity: Math.round(r * 10) / 10,
        groundDistanceCm: Math.round((THRESHOLDS.baselineDistanceCm - sh) * 100) / 100,
        groundShiftCm: Math.round(sh * 100) / 100,
        tilt: isStormDay && h >= 14 && h <= 16 ? ("TRIGGERED" as const) : ("NORMAL" as const),
      });
    }

    return {
      id: `rep_${date}`,
      date,
      observationStart: `${date}T00:00:00Z`,
      observationEnd: isToday ? new Date().toISOString() : `${date}T23:59:59Z`,
      generatedAt: new Date().toISOString(),
      status: isToday ? "IN_PROGRESS" : "FINAL",
      isPartial: isToday,
      sampleCount: isToday ? 420 : 860,
      dataCoveragePct: isToday ? 87.5 : 99.2,
      siteId: DEMO_SITE.nodeId,
      siteName: DEMO_SITE.name,
      locationLabel: DEMO_SITE.locationLabel,
      coordinates: { lat: DEMO_SITE.lat, lon: DEMO_SITE.lon },
      executiveSummary: {
        overview: isStormDay
          ? "Sustained high-precipitation event triggered elevated pore pressures and measurable ground displacement on Ridge Sector 7. Two watch-level alerts and one critical displacement alarm were recorded."
          : isYesterday
          ? "Intermittent rainfall throughout the afternoon caused volumetric soil moisture to rise from 42% to a peak of 78.4%. Watch thresholds were momentarily crossed, but no physical tilt or critical shift developed."
          : "Active daytime monitoring session showing moderate soil moisture (54% avg) with scattered light precipitation. All four telemetry channels are currently reporting within expected operating limits.",
        notableChanges: [
          `Soil moisture fluctuated between ${soilStats.min}% and ${soilMax}%.`,
          `Peak rain rate registered at ${rainMax}% relative sensor intensity.`,
          `Net ground displacement peaked at +${shiftMax} cm toward the ultrasonic sensor head.`,
        ],
        elevatedConcernPeriods: isStormDay
          ? ["13:30 – 16:15 UTC (Coincident intense rainfall and tilt sensor triggering)", "17:00 – 19:30 UTC (Elevated pore water pressure saturation)"]
          : isYesterday
          ? ["14:15 – 15:45 UTC (Squall passage with rainfall rate >70%)"]
          : ["10:30 – 11:45 UTC (Transient drizzle with minor moisture inflection)"],
        keyFindings: [
          "Tilt sensor remained in NORMAL state for 98.4% of the observation period.",
          `Calculated ground shift (${shiftMax} cm) did not exceed physical structural danger limits.`,
          "Weather context from Open-Meteo correlates with on-site rain sensor activity.",
        ],
        limitations: [
          isToday ? "Collection period is still underway; partial-day statistics are subject to change." : "24-hour observation complete.",
          "Ultrasonic distance measurements are sensitive to slope vegetation growth within the beam cone.",
          "Acoustic audio levels represent visual scale metrics rather than calibrated sound pressure (dB SPL).",
        ],
        observedFacts: [
          `Peak soil moisture was measured at ${soilMax}% at ${date}T14:30Z.`,
          `Total samples recorded: ${isToday ? 420 : 860} telemetry frames.`,
          `Tilt state transitions recorded: ${isStormDay ? 3 : 0}.`,
        ],
        aiInterpretations: [
          "Gemma 4 model correlates increased soil saturation with slope destabilization potential.",
          "Lag time of ~45 minutes observed between peak rainfall intensity and maximum ground displacement.",
        ],
      },
      sensorStats: {
        soilMoisture: soilStats,
        rainIntensity: rainStats,
        groundDistance: groundDistStats,
        groundShift: groundShiftStats,
        tilt: {
          triggeredCount: isStormDay ? 3 : 0,
          lastTriggeredAt: isStormDay ? `${date}T15:24:00Z` : null,
          normalSamples: isStormDay ? 842 : isToday ? 420 : 860,
          triggeredSamples: isStormDay ? 18 : 0,
        },
      },
      trendHistory,
      incidentTimeline: isStormDay
        ? [
            {
              id: "inc_01",
              timestamp: `${date}T11:45:00Z`,
              category: "sensor",
              severity: "watch",
              title: "Soil Moisture Watch Exceeded",
              description: "Soil moisture crossed the 55% threshold following continuous moderate rainfall.",
              evidence: "soilMoisture: 56.4% · baseline: 38%",
              source: "Telemetry rule",
              acknowledged: true,
              resolved: true,
            },
            {
              id: "inc_02",
              timestamp: `${date}T13:30:00Z`,
              category: "sensor",
              severity: "warning",
              title: "High Rain Intensity & Saturation Rate",
              description: "Rain intensity exceeded 70% with accelerated moisture absorption.",
              evidence: "rainIntensity: 82% · rate: +8%/15m",
              source: "Telemetry rule",
              acknowledged: true,
              resolved: true,
            },
            {
              id: "inc_03",
              timestamp: `${date}T15:10:00Z`,
              category: "displacement",
              severity: "critical",
              title: "Rapid Ground Displacement Toward Sensor",
              description: "Ultrasonic sensor clearance shrank by 2.84 cm, indicating localized slope face heave or bulge.",
              evidence: "groundShift: 2.84 cm · threshold: 1.5 cm",
              source: "Automated detector",
              acknowledged: true,
              resolved: false,
            },
          ]
        : isYesterday
        ? [
            {
              id: "inc_y1",
              timestamp: `${date}T14:30:00Z`,
              category: "sensor",
              severity: "watch",
              title: "Afternoon Soil Moisture Watch",
              description: "Soil moisture rose above 55% during 45-minute rain squall.",
              evidence: "soilMoisture: 58.2%",
              source: "Telemetry rule",
              acknowledged: true,
              resolved: true,
            },
          ]
        : [],
      investigation: {
        whatChanged: isStormDay
          ? "A heavy precipitation event delivered sustained rain for over 2 hours. Soil pore pressure reached near-saturation, followed by a 2.84 cm ground heave detected by ultrasonic telemetry."
          : "Normal diurnal moisture variations with a moderate inflection during afternoon showers. No structural ground movement was observed.",
        supportingEvidence: [
          { signal: "Soil Moisture", detail: `Climbed from ${soilStats.firstValue}% to ${soilMax}%`, timestamp: `${date}T14:30Z` },
          { signal: "Rain Intensity", detail: `Peaked at ${rainMax}% relative rate`, timestamp: `${date}T13:45Z` },
          { signal: "Ground Shift", detail: `Displacement toward sensor: +${shiftMax} cm`, timestamp: `${date}T15:10Z` },
        ],
        eventSequence: "Precipitation began at T+0h -> Moisture absorption began at T+1.2h -> Peak rain intensity at T+2.5h -> Soil saturation crossed Watch threshold at T+3.1h -> Ultrasonic displacement detected at T+4.0h.",
        sensorConcordance: "High multi-sensor concordance: Rain gauge, volumetric soil moisture, and ultrasonic displacement moved in physically coherent sequence. The tilt sensor provided secondary confirmation during peak rainfall.",
        alternativeExplanations: [
          "Vegetation growth or blowing debris obstructing the ultrasonic sensor cone could account for transient displacement spikes.",
          "Surface runoff pooling around probe nodes rather than deep slope failure.",
        ],
        unresolvedQuestions: [
          "Is displacement localized to surface mantle or seated along deep failure plane?",
          "Will drainage rate keep pace if secondary rainfall develops tomorrow?",
        ],
        observedVsHypothesis: "FACT: Sensor readings recorded physical distance change. HYPOTHESIS: AI model infers increased probability of shear failure under sustained hydraulic load.",
      },
      alertsAndActions: isStormDay
        ? [
            {
              id: `ev_crit_${date}`,
              timestamp: `${date}T15:10:00Z`,
              category: "displacement",
              severity: "critical",
              title: "Ground displacement critical threshold exceeded",
              description: "Ultrasonic clearance decreased by 2.84 cm.",
              evidence: "shift: 2.84 cm",
              acknowledged: true,
              read: true,
            },
          ]
        : [],
      dataQuality: {
        telemetryGaps: isToday ? ["None detected (continuous polling)"] : ["Minor 4-minute transmission gap at 03:12 UTC"],
        staleReadingsCount: 0,
        invalidValuesCount: 0,
        sensorDisagreement: null,
        weatherGaps: null,
        confidenceLimitation: "Model confidence score (0.82) is uncalibrated heuristic metadata, not a mathematical probability of landslide.",
        coveragePct: isToday ? 87.5 : 99.2,
      },
      conclusions: {
        primaryFindings: [
          `Slope face exhibited measurable hydraulic response to rainfall with peak moisture of ${soilMax}%.`,
          "All monitoring nodes recovered communication without persistent hardware failures.",
          "Displacement stabilized once precipitation intensity abated.",
        ],
        outstandingConcerns: [
          "Residual saturation remains above 60%; subsequent rainfall could trigger faster displacement.",
          "Vegetation debris in sensor field-of-view should be visually checked.",
        ],
        recommendedSiteChecks: [
          "Inspect ultrasonic sensor mounting bracket for physical settling or thermal drift.",
          "Verify drainage ditch clearance along Sector 7 ridge line.",
          "Cross-reference camera frames for visible surface tension cracks.",
        ],
        futureDataImprovements: [
          "Install secondary pore-pressure transducer at 1.5 m depth.",
          "Calibrate ultrasonic temperature compensation to eliminate thermal diurnal variations.",
        ],
      },
      pdfAvailable: true,
      pdfFilename: `TerraGuard-Daily-Report-${date}.pdf`,
      provenance: {
        mode: "demo",
        model: "Gemma 4 (simulated rule synthesis)",
        source: "TerraGuard Local Investigation Engine",
      },
    };
  }

  async generateReport(date: string): Promise<DailyReport> {
    // Simulate brief generation delay
    await new Promise((r) => setTimeout(r, 600));
    const report = await this.getReport(date);
    if (!report) {
      throw new Error(`Unable to generate report for date ${date}: No historical records available.`);
    }
    return report;
  }

  async getOutlook(date: string): Promise<NextDayOutlook | null> {
    const today = new Date();
    const d1 = toDateStr(new Date(today.getTime() - 1 * 86400000));
    const d2 = toDateStr(new Date(today.getTime() - 2 * 86400000));

    // Forecast target is next calendar day after observation date
    const obsDate = new Date(`${date}T12:00:00Z`);
    const nextDate = toDateStr(new Date(obsDate.getTime() + 86400000));

    const isHighRisk = date === d2 || date === d1;

    return {
      id: `out_${date}`,
      observationDate: date,
      forecastDate: nextDate,
      generatedAt: new Date().toISOString(),
      status: isHighRisk ? "Increased Monitoring" : "Routine",
      statusTone: isHighRisk ? "watch" : "safe",
      summary: isHighRisk
        ? "Weather forecast indicates incoming front with 18.5 mm rainfall. Given elevated antecedent moisture from the observed day, slope susceptibility will be heightened."
        : "Favorable meteorological outlook with minimal precipitation expected. Standard baseline monitoring protocol recommended.",
      forecast: {
        provider: "Open-Meteo (via backend cache)",
        retrievedAt: new Date().toISOString(),
        forecastDate: nextDate,
        predictedRainMm: isHighRisk ? 18.5 : 2.0,
        rainProbabilityPct: isHighRisk ? 75 : 20,
        tempMaxC: 22.4,
        tempMinC: 14.1,
        expectedConditions: isHighRisk ? "Moderate rain & gusty winds" : "Partly cloudy with sunny intervals",
        windSpeedKmh: isHighRisk ? 28 : 12,
        intervals: [
          { time: "06:00", condition: "Overcast", precipMm: isHighRisk ? 1.5 : 0.0, rainProbPct: 35, tempC: 15.0 },
          { time: "12:00", condition: isHighRisk ? "Moderate rain" : "Partly cloudy", precipMm: isHighRisk ? 8.2 : 0.5, rainProbPct: isHighRisk ? 80 : 25, tempC: 21.0 },
          { time: "18:00", condition: isHighRisk ? "Heavy showers" : "Clear", precipMm: isHighRisk ? 7.4 : 0.0, rainProbPct: isHighRisk ? 70 : 15, tempC: 17.5 },
          { time: "23:00", condition: "Drizzle", precipMm: isHighRisk ? 1.4 : 0.0, rainProbPct: 40, tempC: 14.8 },
        ],
        isStale: false,
      },
      environmentalAssessment: {
        keyCarryoverConditions: `Observed soil moisture ended at elevated levels. Residual pore water requires approximately 28 to 36 hours of dry weather to return to normal baseline (${THRESHOLDS.soilMoistureWatch}% watch reference).`,
        forecastImpactAnalysis: isHighRisk
          ? "Forecast rainfall of 18.5 mm will impact pre-saturated soil with low infiltration margin. Threshold crossings likely if hourly rain rates exceed 12 mm/h."
          : "Light forecast rainfall (<3 mm) is well within natural absorption and surface drainage capacity.",
        continuedConcerns: "Ultrasonic ground displacement sensor must be monitored for continuous creep or abrupt millimeter shifts.",
        uncertainties: "Local terrain micro-climates can induce localized rain bursts that differ from regional Open-Meteo model grid.",
        triggerConditions: "Deterministic rule: If soil moisture >65% AND rain intensity >40% simultaneously, status escalates to WARNING automatically.",
        distinctionNotice: "NOTICE: This preparedness outlook represents heuristic decision-support guidelines. It is NOT an official civil defense evacuation warning.",
      },
      precautions: [
        {
          id: "p1",
          priority: isHighRisk ? "high" : "medium",
          title: "Pre-Shift Telemetry & Freshness Verification",
          action: "Check dashboard at 06:00 UTC. Confirm all 4 sensor channels report Fresh status with age <15 seconds.",
          rationale: "Ensures no overnight sensor disconnects or battery dropouts before anticipated weather window.",
          safetyNotice: "Remote verification only. Do not approach unstable slope toes during active precipitation.",
          category: "sensor_check",
        },
        {
          id: "p2",
          priority: isHighRisk ? "high" : "medium",
          title: "Intensified Surveillance During Forecast Rain (12:00 – 18:00)",
          action: "Keep the Live Monitoring tab open during peak rain intervals. Verify tilt state timeline every 30 minutes.",
          rationale: "Historical telemetry demonstrates ground shift acceleration occurs within 45 minutes of heavy rain bursts.",
          category: "operational",
        },
        {
          id: "p3",
          priority: "medium",
          title: "Camera Snapshot Visual Audit",
          action: "Capture manual high-resolution frame at 10:00 UTC in daylight to inspect slope surface for tension cracking.",
          rationale: "Multi-modal verification helps differentiate mechanical sensor drift from true geological movement.",
          category: "inspection",
        },
        {
          id: "p4",
          priority: "low",
          title: "Drainage Infrastructure Confirmation",
          action: "Ensure site drainage channels upstream of Sector 7 are clear of heavy debris if safe to do so.",
          rationale: "Prevents concentrated runoff from eroding sensor anchor footings.",
          safetyNotice: "Observe site safety protocols; stay on established perimeter access roads.",
          category: "operational",
        },
      ],
      monitoringPriorities: [
        {
          signal: "Soil Moisture (%)",
          thresholdRule: `Threshold watch: ${THRESHOLDS.soilMoistureWatch}% · Warning: ${THRESHOLDS.soilMoistureWarning}%`,
          escalationCondition: "Exceeding 70% volumetric moisture with rising trend",
          rationale: "Critical precursor for loss of effective soil cohesion",
          severity: "warning",
        },
        {
          signal: "Ground Shift (cm)",
          thresholdRule: `Watch: +${THRESHOLDS.shiftWatchCm} cm · Critical: +${THRESHOLDS.shiftCriticalCm} cm`,
          escalationCondition: "Continuous movement >1.0 mm per 15 minutes",
          rationale: "Direct indication of slope displacement toward sensor head",
          severity: "critical",
        },
        {
          signal: "Biaxial Tilt Switch",
          thresholdRule: "Binary state transition (NORMAL -> TRIGGERED)",
          escalationCondition: "Persistent TRIGGERED state lasting >60 seconds",
          rationale: "Indicates anchor pole tilting or surface subsidence",
          severity: "warning",
        },
      ],
      limitations: [
        "Preparedness evaluation is derived from simulated demo data fixtures.",
        "Weather forecast is subject to numerical model forecast errors and timing shifts.",
        "No deep geotechnical borehole or inclinometer data is integrated into this prototype.",
      ],
      provenance: {
        mode: "demo",
        model: "Local Gemma 4 Synthesis Engine",
        forecastSource: "Open-Meteo Global Model (cached)",
      },
    };
  }

  async downloadPdf(date: string): Promise<void> {
    const report = await this.getReport(date);
    if (!report) {
      throw new Error(`Cannot download PDF for date ${date}: Report not found.`);
    }
    const outlook = await this.getOutlook(date);
    await downloadReportPdf(report, outlook);
  }
}

// ----------------- BACKEND REPORTING SERVICE -----------------
export class BackendReportingService implements ReportingService {
  readonly adapterName = "FastAPI Backend Reporting Service";

  async listReports(): Promise<DailyReportSummary[]> {
    if (!API_BASE_URL) {
      return [];
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-reports`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const body = await res.json();
      return (body.reports ?? []).map((r: Record<string, any>) => ({
        id: String(r.id), date: r.report_date, status: r.status === "complete" ? "FINAL" : "IN_PROGRESS",
        summary: r.summary ?? "Report is being prepared.", incidentCount: Object.values(r.flag_counts ?? {}).reduce((sum: number, n: any) => sum + Number(n || 0), 0),
        criticalAlertCount: r.risk_counts?.critical ?? 0,
        maxSoilMoisture: r.sensor_ranges?.soil_moisture_pct?.max ?? null,
        maxRainIntensity: r.sensor_ranges?.rain_pct?.max ?? null,
        maxShiftCm: r.sensor_ranges?.ground_shift_cm?.max ?? null,
        tiltTriggered: Boolean(r.flag_counts?.TILT_TRIGGERED), dataCoveragePct: 0,
        isPartial: r.status !== "complete", hasPdf: Boolean(r.download_url),
      } satisfies DailyReportSummary));
    } catch {
      return [];
    }
  }

  async getReport(date: string): Promise<DailyReport | null> {
    if (!API_BASE_URL) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-reports/by-date/${date}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      return mapDailyReport(await res.json());
    } catch {
      return null;
    }
  }

  async generateReport(date: string): Promise<DailyReport> {
    if (!API_BASE_URL) throw new Error("Backend reporting service not connected (VITE_TERRAGUARD_API_BASE_URL not set)");
    const res = await fetch(`${API_BASE_URL}/api/daily-reports/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_date: date }),
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) throw new Error(`Backend report generation failed (HTTP ${res.status})`);
    return mapDailyReport(await res.json());
  }

  async getOutlook(_date: string): Promise<NextDayOutlook | null> {
    if (!API_BASE_URL) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/outlook`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const body = await res.json();
      return mapOutlook(body);
    } catch {
      return null;
    }
  }

  async downloadPdf(date: string): Promise<void> {
    if (!API_BASE_URL) {
      throw new Error("Reporting service not connected. Please configure VITE_TERRAGUARD_API_BASE_URL.");
    }

    try {
      const reportsRes = await fetch(`${API_BASE_URL}/api/daily-reports`, { signal: AbortSignal.timeout(8000) });
      const reportsBody = reportsRes.ok ? await reportsRes.json() : { reports: [] };
      const reportEntry = (reportsBody.reports ?? []).find((r: Record<string, any>) => r.report_date === date && r.download_url);
      const res = reportEntry ? await fetch(`${API_BASE_URL}${reportEntry.download_url}`, { signal: AbortSignal.timeout(12000) }) : null;
      if (res?.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `TerraGuard-Daily-Report-${date}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // Backend PDF endpoint not implemented, fallback to generating client-side PDF from backend report JSON
    }

    throw new Error(`A completed PDF report for ${date} is not available yet. Generate the report first.`);
  }
}

function mapDailyReport(raw: Record<string, any>): DailyReport {
  const ranges = raw.sensor_ranges ?? {};
  const latest = raw.telemetry?.latest_received ?? raw.generated_at ?? new Date().toISOString();
  const stats = (key: string, label: string, unit: string): SensorDailyStats => {
    const v = ranges[key];
    return { sensorKey: key, label, unit, firstValue: null, lastValue: v?.mean ?? null,
      min: v?.min ?? null, max: v?.max ?? null, avg: v?.mean ?? null,
      significantChange: "Daily range summary", timeOfNotable: null, notableReading: null,
      validSamples: raw.reading_count ?? 0, totalExpectedSamples: raw.reading_count ?? 0,
      availabilityPct: v ? 100 : 0, isMissing: !v };
  };
  const summary = raw.summary || "No Gemma summary is available for this report.";
  const observations = raw.observations ?? [];
  const precautions = raw.precautions ?? [];
  const events = (raw.flag_counts ? Object.entries(raw.flag_counts) : []).map(([code, count], index) => ({
    id: `${raw.id}-flag-${index}`, timestamp: latest, category: "sensor" as const,
    severity: "watch" as const, title: String(code).replace(/_/g, " "),
    description: `${count} flagged reading(s) recorded during this report period.`,
    acknowledged: false, read: true,
  }));
  return {
    id: String(raw.id ?? raw.report_date), date: raw.report_date,
    observationStart: latest, observationEnd: latest,
    generatedAt: raw.generated_at ?? latest, status: raw.status === "complete" ? "FINAL" : "IN_PROGRESS",
    isPartial: (raw.reading_count ?? 0) === 0, sampleCount: raw.reading_count ?? 0, dataCoveragePct: 0,
    siteId: raw.telemetry?.device_id ?? "field-node", siteName: "TerraGuard Field Node",
    locationLabel: raw.telemetry?.location ?? "Location unavailable", coordinates: { lat: null, lon: null },
    executiveSummary: { overview: summary, notableChanges: observations, elevatedConcernPeriods: [],
      keyFindings: observations, limitations: ["Prototype decision support; not an official warning or calibrated landslide prediction."],
      observedFacts: observations, aiInterpretations: [summary] },
    sensorStats: { soilMoisture: stats("soil_moisture_pct", "Soil moisture", "%"),
      rainIntensity: stats("rain_pct", "Rain intensity", "%"),
      groundDistance: stats("ground_distance_cm", "Ground distance", "cm"),
      groundShift: stats("ground_shift_cm", "Ground shift", "cm"),
      tilt: { triggeredCount: raw.flag_counts?.TILT_TRIGGERED ?? 0, lastTriggeredAt: null,
        normalSamples: 0, triggeredSamples: raw.flag_counts?.TILT_TRIGGERED ?? 0 } },
    trendHistory: [], incidentTimeline: [], investigation: { whatChanged: summary, supportingEvidence: [],
      eventSequence: "", sensorConcordance: "See sensor range and risk summaries.", alternativeExplanations: [],
      unresolvedQuestions: [], observedVsHypothesis: "Observed measurements are separated from model interpretation in the report." },
    alertsAndActions: events, dataQuality: { telemetryGaps: [], staleReadingsCount: 0, invalidValuesCount: 0,
      sensorDisagreement: null, weatherGaps: null, confidenceLimitation: "Coverage is not calculated by this backend report.", coveragePct: 0 },
    conclusions: { primaryFindings: observations, outstandingConcerns: [], recommendedSiteChecks: precautions,
      futureDataImprovements: [] }, pdfAvailable: true, pdfFilename: `TerraGuard-daily-${raw.report_date}.pdf`,
    provenance: { mode: "connected", model: raw.model ?? "Gemma via Ollama", source: raw.generated_by ?? "FastAPI daily report" },
  };
}

function mapOutlook(body: Record<string, any>): NextDayOutlook | null {
  const analysis = body.analysis;
  if (!analysis) return null;
  const generatedAt = analysis.generated_at ?? new Date().toISOString();
  const daily = body.forecast;
  const rawForecast = daily?.time?.length ? {
    date: daily.time[0], precipitation_sum: daily.precipitation_sum?.[0],
    precipitation_probability_max: daily.precipitation_probability_max?.[0],
    temperature_2m_max: daily.temperature_2m_max?.[0], temperature_2m_min: daily.temperature_2m_min?.[0],
    weather_code: daily.weather_code?.[0], wind_speed_10m_max: daily.wind_speed_10m_max?.[0],
  } : null;
  const forecast = rawForecast ? {
    provider: body.weather_source ?? "Open-Meteo", retrievedAt: body.forecast_fetched_at ?? generatedAt,
    forecastDate: rawForecast.date, predictedRainMm: rawForecast.precipitation_sum ?? null,
    rainProbabilityPct: rawForecast.precipitation_probability_max ?? null,
    tempMaxC: rawForecast.temperature_2m_max ?? null, tempMinC: rawForecast.temperature_2m_min ?? null,
    expectedConditions: String(rawForecast.weather_code ?? "Forecast available"),
    windSpeedKmh: rawForecast.wind_speed_10m_max ?? null, intervals: [], isStale: false,
  } : null;
  const indicator = analysis.landslide_indicator;
  const status = indicator === "watch" || indicator === "elevated_indicators" ? "Increased Monitoring" : indicator === "insufficient_data" ? "Insufficient Data" : "Routine";
  const summary = analysis.tomorrow_summary ?? "No Gemma outlook summary is available yet.";
  return { id: `outlook-${generatedAt}`, observationDate: analysis.reading_at ?? generatedAt,
    forecastDate: forecast?.forecastDate ?? generatedAt.slice(0, 10), generatedAt,
    status, statusTone: status === "Increased Monitoring" ? "watch" : status === "Routine" ? "safe" : "neutral",
    summary, forecast, environmentalAssessment: { keyCarryoverConditions: analysis.indicator_reason ?? "",
      forecastImpactAnalysis: analysis.upcoming_summary ?? "", continuedConcerns: analysis.indicator_reason ?? "",
      uncertainties: "Qualitative indicator only; this is not a calibrated probability.", triggerConditions: "Follow authorized local guidance.",
      distinctionNotice: "Decision support only. This system does not issue official evacuation orders." },
    precautions: (analysis.precautions ?? []).map((action: string, i: number) => ({ id: `precaution-${i}`,
      priority: i === 0 ? "high" : "medium", title: "Preparedness step", action, rationale: "Gemma-generated precaution based on available telemetry and forecast.", category: "operational" })),
    monitoringPriorities: [], limitations: ["Qualitative indicators are not calibrated landslide probabilities."],
    provenance: { mode: "connected", model: analysis.model ?? "Gemma via Ollama", forecastSource: "Open-Meteo" } };
}

export function createReportingService(mode: "demo" | "connected"): ReportingService {
  return mode === "connected" ? new BackendReportingService() : new MockReportingService();
}
