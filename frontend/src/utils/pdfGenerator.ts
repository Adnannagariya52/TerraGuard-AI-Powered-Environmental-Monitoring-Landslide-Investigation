import { jsPDF } from "jspdf";
import type { DailyReport, NextDayOutlook } from "@/types/reports";

/**
 * Generates a clean, professional, multi-page PDF document
 * for a daily environmental investigation report & next-day outlook.
 */
export async function downloadReportPdf(report: DailyReport, outlook?: NextDayOutlook | null): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 12) {
      doc.addPage();
      y = margin;
      drawPageHeader();
    }
  };

  const drawPageHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 115, 130);
    doc.text("TERRAGUARD · ENVIRONMENTAL INVESTIGATION DOSSIER", margin, y);
    doc.text(`DATE: ${report.date} · REPORT ID: ${report.id}`, pageWidth - margin, y, { align: "right" });
    y += 4;
    doc.setDrawColor(220, 225, 230);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  // ---------------- PAGE 1 HEADER ----------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 28, 36);
  doc.text("Daily Environmental Investigation Report", margin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 100, 110);
  doc.text(`Site: ${report.siteName} (${report.siteId}) · Location: ${report.locationLabel}`, margin, y);
  doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, pageWidth - margin, y, { align: "right" });
  y += 5;

  // Demo watermark banner if simulated
  if (report.provenance.mode === "demo" || report.status === "DEMO") {
    doc.setFillColor(235, 248, 255);
    doc.setDrawColor(34, 211, 238);
    doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(8, 145, 178);
    doc.text("DEMO REPORT — SIMULATED DATA. NOT VALIDATED EMERGENCY GUIDANCE.", margin + 4, y + 4.5);
    y += 10;
  } else {
    y += 2;
  }

  // Status & Observation Coverage Strip
  doc.setFillColor(245, 247, 250);
  doc.setDrawColor(215, 222, 230);
  doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(40, 50, 60);
  doc.text(`REPORT STATUS: ${report.status}`, margin + 4, y + 5);
  doc.text(`OBSERVATION PERIOD: ${new Date(report.observationStart).toLocaleTimeString()} — ${new Date(report.observationEnd).toLocaleTimeString()}`, margin + 55, y + 5);
  doc.text(`COVERAGE: ${report.dataCoveragePct}% (${report.sampleCount} samples)`, margin + 140, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110, 120, 130);
  doc.text(report.isPartial ? "Note: Observation period is still in progress (partial day)." : "Complete 24-hour observation dataset.", margin + 4, y + 9.5);
  y += 16;

  // ---------------- SECTION 1: EXECUTIVE SUMMARY ----------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(25, 35, 45);
  doc.text("1. Executive Summary", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(45, 55, 65);
  const overviewLines = doc.splitTextToSize(report.executiveSummary.overview, contentWidth);
  doc.text(overviewLines, margin, y);
  y += overviewLines.length * 4.2 + 2;

  // Key Findings vs Limitations
  checkPageBreak(25);
  doc.setFillColor(250, 252, 255);
  doc.setDrawColor(220, 230, 240);
  doc.roundedRect(margin, y, contentWidth, 20, 1, 1, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 118, 110);
  doc.text("Observed Facts (Direct Sensor & Environmental Readings):", margin + 3, y + 4.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(45, 55, 65);
  const factLines = doc.splitTextToSize(report.executiveSummary.observedFacts.join(" · "), contentWidth - 6);
  doc.text(factLines.slice(0, 2), margin + 3, y + 8.5);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(124, 58, 237);
  doc.text("AI Model Interpretations (Gemma 4 Assessment):", margin + 3, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(45, 55, 65);
  const aiLines = doc.splitTextToSize(report.executiveSummary.aiInterpretations.join(" · "), contentWidth - 6);
  doc.text(aiLines.slice(0, 1), margin + 3, y + 18);

  y += 24;

  // ---------------- SECTION 2: DAILY SENSOR STATISTICS ----------------
  checkPageBreak(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(25, 35, 45);
  doc.text("2. Daily Sensor Statistics", margin, y);
  y += 5;

  // Table header
  doc.setFillColor(30, 41, 59);
  doc.rect(margin, y, contentWidth, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text("SENSOR CHANNEL", margin + 3, y + 4.2);
  doc.text("FIRST", margin + 46, y + 4.2);
  doc.text("LAST", margin + 64, y + 4.2);
  doc.text("MIN", margin + 82, y + 4.2);
  doc.text("MAX", margin + 100, y + 4.2);
  doc.text("DAILY AVG", margin + 118, y + 4.2);
  doc.text("SIGNIFICANT BEHAVIOUR", margin + 140, y + 4.2);
  y += 6;

  const rows = [
    { ...report.sensorStats.soilMoisture, displayLabel: "Soil Moisture (%)" },
    { ...report.sensorStats.rainIntensity, displayLabel: "Rain Intensity (rel %)" },
    { ...report.sensorStats.groundDistance, displayLabel: "Ground Distance (cm)" },
    { ...report.sensorStats.groundShift, displayLabel: "Ground Shift (cm)" },
  ];

  rows.forEach((r, idx) => {
    checkPageBreak(7);
    doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
    doc.rect(margin, y, contentWidth, 6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 40, 50);

    doc.text(r.displayLabel, margin + 3, y + 4.2);
    doc.text(r.firstValue !== null ? String(r.firstValue) : "—", margin + 46, y + 4.2);
    doc.text(r.lastValue !== null ? String(r.lastValue) : "—", margin + 64, y + 4.2);
    doc.text(r.min !== null ? String(r.min) : "—", margin + 82, y + 4.2);
    doc.text(r.max !== null ? String(r.max) : "—", margin + 100, y + 4.2);
    doc.text(r.avg !== null ? String(r.avg) : "—", margin + 118, y + 4.2);
    doc.text(r.significantChange ? r.significantChange.slice(0, 32) : "Stable", margin + 140, y + 4.2);
    y += 6;
  });

  // Tilt row
  checkPageBreak(7);
  doc.setFillColor(245, 247, 250);
  doc.rect(margin, y, contentWidth, 6, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 40, 50);
  doc.text("Tilt Switch Sensor", margin + 3, y + 4.2);
  doc.text(`Triggered: ${report.sensorStats.tilt.triggeredCount} times`, margin + 46, y + 4.2);
  doc.text(`Last: ${report.sensorStats.tilt.lastTriggeredAt ? new Date(report.sensorStats.tilt.lastTriggeredAt).toLocaleTimeString() : "None"}`, margin + 100, y + 4.2);
  doc.text(`Normal Samples: ${report.sensorStats.tilt.normalSamples}`, margin + 140, y + 4.2);
  y += 9;

  // ---------------- SECTION 3: INCIDENT TIMELINE ----------------
  checkPageBreak(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(25, 35, 45);
  doc.text("3. Recorded Incidents & Alert Chronology", margin, y);
  y += 5;

  if (report.incidentTimeline.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(100, 110, 120);
    doc.text("No elevated incidents or emergency alerts recorded during this observation window.", margin, y);
    y += 6;
  } else {
    report.incidentTimeline.slice(0, 6).forEach((inc) => {
      checkPageBreak(8);
      const isCrit = inc.severity === "critical";
      const isWarn = inc.severity === "warning";
      doc.setFillColor(isCrit ? 254 : isWarn ? 255 : 245, isCrit ? 242 : isWarn ? 247 : 247, isCrit ? 242 : isWarn ? 237 : 250);
      doc.setDrawColor(isCrit ? 239 : isWarn ? 249 : 200, isCrit ? 68 : isWarn ? 115 : 200, isCrit ? 68 : isWarn ? 22 : 200);
      doc.roundedRect(margin, y, contentWidth, 7, 0.8, 0.8, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(isCrit ? 185 : isWarn ? 180 : 70, isCrit ? 28 : isWarn ? 83 : 80, isCrit ? 28 : isWarn ? 9 : 90);
      doc.text(`[${inc.severity.toUpperCase()}] ${new Date(inc.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, margin + 3, y + 4.5);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 40, 50);
      doc.text(`${inc.title}: ${inc.description.slice(0, 85)}`, margin + 32, y + 4.5);
      y += 8;
    });
  }
  y += 2;

  // ---------------- SECTION 4: ENVIRONMENTAL INVESTIGATION ----------------
  checkPageBreak(35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(25, 35, 45);
  doc.text("4. AI Environmental Investigation & Multi-Sensor Reasoning", margin, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("Concordance and Sequence Analysis:", margin, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(50, 60, 70);
  const concLines = doc.splitTextToSize(report.investigation.sensorConcordance, contentWidth);
  doc.text(concLines, margin, y);
  y += concLines.length * 3.8 + 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("Alternative Hypotheses & Data Uncertainty:", margin, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(50, 60, 70);
  const altLines = doc.splitTextToSize(report.investigation.alternativeExplanations.join(" · "), contentWidth);
  doc.text(altLines, margin, y);
  y += altLines.length * 3.8 + 6;

  // ---------------- SECTION 5: DATA QUALITY & LIMITATIONS ----------------
  checkPageBreak(25);
  doc.setFillColor(254, 252, 232);
  doc.setDrawColor(250, 204, 21);
  doc.roundedRect(margin, y, contentWidth, 16, 1, 1, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(133, 77, 14);
  doc.text("5. Data Quality, Reliability & Observational Limits", margin + 3, y + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(70, 60, 20);
  const dqText = `Coverage: ${report.dataCoveragePct}% · Stale samples: ${report.dataQuality.staleReadingsCount} · Gaps: ${report.dataQuality.telemetryGaps.join("; ") || "None"} · Disagreement: ${report.dataQuality.sensorDisagreement || "None observed"}.`;
  doc.text(doc.splitTextToSize(dqText, contentWidth - 6), margin + 3, y + 8.5);
  doc.text("Disclaimer: Risk metrics are uncalibrated prototype outputs. Absence of alerts does NOT verify that a slope is physically stable.", margin + 3, y + 13.5);
  y += 20;

  // ---------------- SECTION 6: NEXT-DAY OUTLOOK & PRECAUTIONS ----------------
  if (outlook) {
    checkPageBreak(50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(25, 35, 45);
    doc.text("6. Next-Day Preparedness Outlook & Action Checklist", margin, y);
    y += 5;

    // Outlook Banner
    const isPrepHigh = outlook.status === "Increased Monitoring";
    doc.setFillColor(isPrepHigh ? 254 : 240, isPrepHigh ? 242 : 253, isPrepHigh ? 242 : 244);
    doc.setDrawColor(isPrepHigh ? 239 : 34, isPrepHigh ? 68 : 197, isPrepHigh ? 68 : 94);
    doc.roundedRect(margin, y, contentWidth, 12, 1, 1, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(isPrepHigh ? 185 : 21, isPrepHigh ? 28 : 128, isPrepHigh ? 28 : 61);
    doc.text(`PREPAREDNESS LEVEL: ${outlook.status.toUpperCase()}`, margin + 4, y + 5);
    doc.text(`TARGET FORECAST DATE: ${outlook.forecastDate}`, margin + 110, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(45, 55, 65);
    doc.text(doc.splitTextToSize(outlook.summary, contentWidth - 8)[0], margin + 4, y + 9.5);
    y += 16;

    // Precautions checklist
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Prioritized Action Checklist for Site Operators:", margin, y);
    y += 4.5;

    outlook.precautions.forEach((p, idx) => {
      checkPageBreak(9);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(p.priority === "high" ? 185 : 50, p.priority === "high" ? 28 : 60, p.priority === "high" ? 28 : 70);
      doc.text(`[${p.priority.toUpperCase()}] ${idx + 1}. ${p.title}`, margin + 2, y + 3.5);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 60, 70);
      const actionLines = doc.splitTextToSize(p.action, contentWidth - 4);
      doc.text(actionLines, margin + 4, y + 7);
      y += actionLines.length * 3.6 + 4;
    });
  }

  // ---------------- PAGE FOOTERS ----------------
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 225, 230);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - margin + 2, pageWidth - margin, pageHeight - margin + 2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 130, 140);
    doc.text(`TerraGuard AI Monitoring · Confidential Investigation Record · Page ${i} of ${totalPages}`, margin, pageHeight - margin + 6);
    doc.text(`Generated: ${report.date}`, pageWidth - margin, pageHeight - margin + 6, { align: "right" });
  }

  // Trigger download
  const filename = `TerraGuard-Daily-Report-${report.date}.pdf`;
  doc.save(filename);
}
