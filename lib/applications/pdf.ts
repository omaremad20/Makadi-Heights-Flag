import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import type { PricingData } from "@/lib/applications/pricing";
import { calculateApplicationPricing } from "@/lib/applications/pricing";
import { MEMBERSHIP_TYPE_LABELS } from "@/lib/applications/form-schema";
import type { MembershipType, Period } from "@/lib/applications/vaildation";

export interface GeneratedPdfResult {
  blob: Blob;
  url: string;
  filename: string;
}

export type ApplicationPdfPerson = {
  name?: string | null;
  fullName?: string | null;
  full_name?: string | null;
  relative?: string | null;
  relation?: string | null;
  mobile?: string | null;
  [key: string]: unknown;
};

export interface ApplicationPdfInput {
  full_name: string;
  unit_number: string;
  date_of_birth?: string | null;
  nationality: string;
  mobile: string;
  email: string;
  period?: string | null;
  membership_type?: string | null;
  user_type?: string | null;
  partner_name?: string | null;
  partner_nationality?: string | null;
  partner_mobile?: string | null;
  partner_email?: string | null;
  additional_persons?: ApplicationPdfPerson[] | null;
  created_at?: string | null;
  submission_date?: string | null;
  status?: string | null;
}

/**
 * Loads the official application template bytes.
 * Works seamlessly in client browser environment and during server execution.
 */
async function loadTemplateBytes(): Promise<Uint8Array> {
  if (typeof window !== "undefined") {
    const res = await fetch("/Clubhouse_form_2026.pdf");
    if (!res.ok) {
      throw new Error(`Failed to load PDF template: HTTP ${res.status}`);
    }
    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  } else {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(
      process.cwd(),
      "public",
      "Clubhouse_form_2026.pdf",
    );
    const buffer = await fs.readFile(filePath);
    return new Uint8Array(buffer);
  }
}

/**
 * Wraps text within a given maximum width using the specified font and font size.
 * Breaks lines cleanly on whitespace and handles oversized tokens safely.
 */
function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  if (!text || text.trim() === "") return [];

  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);

    if (width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      // If a single word exceeds maxWidth, break it by characters
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        let chunk = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, fontSize) <= maxWidth) {
            chunk += char;
          } else {
            if (chunk) lines.push(chunk);
            chunk = char;
          }
        }
        currentLine = chunk;
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Generates the official completed application PDF by populating the template.
 * Preserves the exact document layout, typography, borders, and branding.
 * Keeps all applicant names within the original table row/cell with readable typography.
 */
export async function generateApplicationPdf(
  values: ApplicationPdfInput,
  pricing?: PricingData | null,
): Promise<GeneratedPdfResult> {
  const templateBytes = await loadTemplateBytes();
  const pdfDoc = await PDFDocument.load(templateBytes);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.getPage(0);
  const darkInk = rgb(0.12, 0.12, 0.18);
  const brandBlue = rgb(0.08, 0.22, 0.52);
  const borderDark = rgb(0, 0, 0);

  const drawText = (
    text: string | null | undefined,
    x: number,
    y: number,
    size = 10,
    isBold = true,
  ) => {
    if (!text || text.trim() === "") return;

    page.drawText(text.trim(), {
      x,
      y,
      size,
      font: isBold ? fontBold : fontRegular,
      color: darkInk,
    });
  };

  const drawCheck = (x: number, y: number) => {
    page.drawLine({
      start: { x: x + 3, y: y + 6 },
      end: { x: x + 6, y: y + 3 },
      thickness: 1.6,
      color: brandBlue,
    });

    page.drawLine({
      start: { x: x + 6, y: y + 3 },
      end: { x: x + 12, y: y + 10 },
      thickness: 1.6,
      color: brandBlue,
    });
  };

  // 1. Date of Application
  let dateStr = "";
  if (values.created_at) {
    try {
      dateStr = new Date(values.created_at).toISOString().slice(0, 10);
    } catch {
      dateStr = values.created_at.slice(0, 10);
    }
  } else if (values.submission_date) {
    dateStr = values.submission_date;
  } else {
    dateStr = new Date().toISOString().slice(0, 10);
  }
  drawText(dateStr, 65, 684, 10, true);

  // 2. Facility / Membership Type in header
  if (values.membership_type) {
    const memKey = values.membership_type as MembershipType;
    const membershipLabel = MEMBERSHIP_TYPE_LABELS[memKey] || values.membership_type;
    drawText(`Facility: ${membershipLabel}`, 300, 684, 10, true);
  }

  // 3. User Type Checkbox (Corrected X coordinates to fit in square boxes)
  const normUserType = (values.user_type || "").toLowerCase().trim();
  if (
    normUserType.includes("owner") ||
    (normUserType.includes("resident") && !normUserType.includes("non"))
  ) {
    drawCheck(138, 656);
  } else if (
    normUserType.includes("tenant") ||
    normUserType.includes("visitor") ||
    normUserType.includes("vistior")
  ) {
    drawCheck(228, 656);
  } else if (
    normUserType.includes("non-makadi") ||
    normUserType.includes("non-resident") ||
    normUserType.includes("non_resident") ||
    normUserType.includes("non")
  ) {
    drawCheck(368, 656);
  }

  // 4. Period Checkbox
  const normPeriod = (values.period || "").toLowerCase().trim().replace(/_/g, "-");
  if (normPeriod === "1year" || normPeriod === "annual" || normPeriod === "year") {
    drawCheck(122, 634);
  } else if (normPeriod === "6months" || normPeriod === "6-months") {
    drawCheck(210, 633);
  } else if (normPeriod === "3months" || normPeriod === "3-months") {
    drawCheck(305, 633);
  } else if (normPeriod === "month" || normPeriod === "1month" || normPeriod === "1-month") {
    drawCheck(396, 634);
  } else if (
    normPeriod === "10-days" ||
    normPeriod === "10days" ||
    normPeriod === "week"
  ) {
    drawCheck(482, 633);
    drawText(
      normPeriod === "week" ? "(7 Days)" : "(10 Days)",
      535,
      638,
      8,
      true,
    );
  }

  // 5. Applicant Personal Information
  drawText(values.full_name, 95, 616);
  drawText(values.unit_number, 105, 593);
  drawText(values.date_of_birth, 105, 570);
  drawText(values.nationality, 98, 547);
  drawText(values.mobile, 80, 524);
  drawText(values.email, 75, 501);

  // 6. Family details (Partner)
  if (values.partner_name && values.partner_name.trim() !== "") {
    drawText(values.partner_name, 115, 455);
    drawText(values.partner_nationality || "-", 100, 432);
    drawText(values.partner_mobile || "-", 80, 409);
    drawText(values.partner_email || "-", 75, 387);
  }

  // 7. Additional persons in original table row
  const additional = values.additional_persons || [];
  const applicantNames = additional
    .map((p) => p.name || p.fullName || p.full_name || "")
    .map((s) => s.trim())
    .filter(Boolean);

  const applicantRelatives = additional
    .map((p) => p.relative || p.relation || "")
    .map((s) => s.trim())
    .filter(Boolean);

  const applicantMobiles = additional
    .map((p) => p.mobile || "")
    .map((s) => s.trim())
    .filter(Boolean);

  const namesString = applicantNames.join(" - ");
  const relativesString = applicantRelatives.join(" - ");
  const mobilesString = applicantMobiles.join(" - ");

  const nameFontSize = 10.5;
  const secondaryFontSize = 9.5;
  const nameCellMaxWidth = 172;
  const relativeCellMaxWidth = 114;
  const mobileCellMaxWidth = 156;

  const nameLines = wrapText(namesString, fontRegular, nameFontSize, nameCellMaxWidth);
  const relativeLines = wrapText(relativesString, fontRegular, secondaryFontSize, relativeCellMaxWidth);
  const mobileLines = wrapText(mobilesString, fontRegular, secondaryFontSize, mobileCellMaxWidth);

  const maxLines = Math.max(nameLines.length, relativeLines.length, mobileLines.length, 1);

  if (applicantNames.length > 0 || additional.length > 0) {
    if (maxLines > 2) {
      page.drawRectangle({
        x: 43.6,
        y: 298.6,
        width: 508,
        height: 2.2,
        color: rgb(1, 1, 1),
      });

      const verticalLineBottom = maxLines > 3 ? 245.30 : 272.33;
      [84.14, 265.49, 386.95].forEach((vx) => {
        page.drawLine({
          start: { x: vx, y: 326.45 },
          end: { x: vx, y: verticalLineBottom },
          thickness: 0.48,
          color: borderDark,
        });
      });
    }

    if (maxLines > 3) {
      page.drawRectangle({
        x: 43.6,
        y: 271.5,
        width: 508,
        height: 2.2,
        color: rgb(1, 1, 1),
      });

      [84.14, 265.49, 386.95].forEach((vx) => {
        page.drawLine({
          start: { x: vx, y: 326.45 },
          end: { x: vx, y: 245.30 },
          thickness: 0.48,
          color: borderDark,
        });
      });
    }

    const lineHeight = 13;
    let startY = 313;
    if (maxLines === 1) {
      startY = 308;
    } else if (maxLines === 2) {
      startY = 313;
    } else if (maxLines >= 3) {
      startY = 314;
    }

    const numberY = maxLines <= 2 ? (startY - ((maxLines - 1) * lineHeight) / 2) : 308;
    drawText("1", 58, numberY);

    nameLines.forEach((line, index) => {
      page.drawText(line, {
        x: 88,
        y: startY - index * lineHeight,
        size: nameFontSize,
        font: fontRegular,
        color: darkInk,
      });
    });

    relativeLines.forEach((line, index) => {
      page.drawText(line, {
        x: 270,
        y: startY - index * lineHeight,
        size: secondaryFontSize,
        font: fontRegular,
        color: darkInk,
      });
    });

    mobileLines.forEach((line, index) => {
      page.drawText(line, {
        x: 392,
        y: startY - index * lineHeight,
        size: secondaryFontSize,
        font: fontRegular,
        color: darkInk,
      });
    });
  }

  // 8. Total Fees (Only print amount to prevent overlapping template text)
  let resolvedPricing = pricing;
  if (!resolvedPricing && values.membership_type && values.period) {
    try {
      const totalPeople =
        1 +
        (values.partner_name && values.partner_name.trim() !== "" ? 1 : 0) +
        additional.length;
      const calcResult = await calculateApplicationPricing({
        membershipType: values.membership_type as MembershipType,
        period: values.period as Period,
        people: totalPeople,
      });
      if (calcResult.ok) {
        resolvedPricing = calcResult.data;
      }
    } catch (e) {
      console.warn("Pricing calculation skipped:", e);
    }
  }

  if (resolvedPricing && resolvedPricing.total_price > 0) {
    const formattedFee = resolvedPricing.total_price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    drawText(formattedFee, 85, 210, 10, true);
  } else {
    drawText("Calculated upon office review", 85, 210, 9);
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as unknown as BlobPart], {
    type: "application/pdf",
  });

  const safeName = (values.full_name || "Application")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 32);
  const filename = `Makadi_Membership_Application_${safeName || "Form"}_2026.pdf`;
  const url = typeof window !== "undefined" ? URL.createObjectURL(blob) : "";

  return {
    blob,
    url,
    filename,
  };
}