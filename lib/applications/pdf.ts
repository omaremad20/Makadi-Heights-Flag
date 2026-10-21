import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PricingData } from "@/lib/applications/pricing";
import { calculateApplicationPricing } from "@/lib/applications/pricing";
import { MEMBERSHIP_TYPE_LABELS, PERIOD_LABELS } from "@/lib/applications/form-schema";
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
  nationality?: string | null;
  mobile?: string | null;
  email?: string | null;
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

export interface ApplicationPdfOptions {
  includeDigitalSignatures?: boolean;
  approvedByName?: string | null;
  isExternalUserView?: boolean;
}

/**
 * Loads the official blank application template bytes.
 * Works seamlessly in client browser environment and during server execution.
 */
async function loadTemplateBytes(): Promise<Uint8Array> {
  if (typeof window !== "undefined") {
    // Try primary blank template path, fallback if needed
    let res = await fetch("/ClubHouse_Form_2026_Blank.pdf");
    if (!res.ok) {
      res = await fetch("/templates/new%20template/ClubHouse_Form_2026_Blank.pdf");
    }
    if (!res.ok) {
      res = await fetch("/Clubhouse_form_2026.pdf");
    }
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
      "ClubHouse_Form_2026_Blank.pdf",
    );
    const buffer = await fs.readFile(filePath);
    return new Uint8Array(buffer);
  }
}

/**
 * Generates the official completed application PDF by populating the template.
 * Strictly 1 single page layout with 3 visual rows in additional members table.
 * Adheres strictly to the provided field_map.json coordinates.
 */
export async function generateApplicationPdf(
  values: ApplicationPdfInput,
  pricing?: PricingData | null,
  options?: ApplicationPdfOptions,
): Promise<GeneratedPdfResult> {
  const templateBytes = await loadTemplateBytes();
  const pdfDoc = await PDFDocument.load(templateBytes);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // We strictly modify page 0 and never add a 2nd page.
  const page = pdfDoc.getPage(0);
  const pageHeight = page.getHeight(); // 841.89 pt (Standard A4)

  // Color Palette
  const darkInk = rgb(0.06, 0.08, 0.12);
  const secondaryInk = rgb(0.32, 0.38, 0.46);
  const brandBlue = rgb(0.08, 0.22, 0.52);

  // Helper: Convert top-left coordinates (from field_map.json) to PDF bottom-left
  const getPdfBox = (field: { x: number; y: number; w: number; h: number }) => {
    return {
      x: field.x,
      y: pageHeight - field.y - field.h,
      w: field.w,
      h: field.h,
    };
  };

  // Helper: Draw text vertically centered inside a field box
  const drawInBox = (
    box: { x: number; y: number; w: number; h: number },
    text: string | null | undefined,
    size = 9.5,
    isBold = true,
    align: "left" | "center" | "right" = "left",
    color = darkInk,
    fontOverride?: typeof fontRegular,
  ) => {
    if (!text || text.trim() === "") return;
    const trimmed = text.trim();
    const activeFont = fontOverride || (isBold ? fontBold : fontRegular);

    // Auto-fit text if wider than box width (with 4pt margin)
    const maxW = box.w - 6;
    let actualSize = size;
    while (activeFont.widthOfTextAtSize(trimmed, actualSize) > maxW && actualSize > 6.5) {
      actualSize -= 0.4;
    }

    const textW = activeFont.widthOfTextAtSize(trimmed, actualSize);
    let posX = box.x + 3;
    if (align === "center") {
      posX = box.x + (box.w - textW) / 2;
    } else if (align === "right") {
      posX = box.x + box.w - textW - 3;
    }

    // Baseline calculation to vertically center text in box
    const posY = box.y + (box.h - actualSize) / 2 + 1.2;

    page.drawText(trimmed, {
      x: posX,
      y: posY,
      size: actualSize,
      font: activeFont,
      color,
    });
  };

  // Helper: Draw checkmark strictly inside checkbox box (15.6 x 15.6 pt)
  const drawCheckboxCheck = (field: { x: number; y: number; w: number; h: number }) => {
    const box = getPdfBox(field);
    page.drawLine({
      start: { x: box.x + 3.2, y: box.y + 7.5 },
      end: { x: box.x + 6.4, y: box.y + 3.8 },
      thickness: 1.8,
      color: brandBlue,
    });
    page.drawLine({
      start: { x: box.x + 6.4, y: box.y + 3.8 },
      end: { x: box.x + 12.6, y: box.y + 11.8 },
      thickness: 1.8,
      color: brandBlue,
    });
  };

  // Calculate Headcount
  const partnerCount = values.partner_name && values.partner_name.trim() !== "" ? 1 : 0;
  const additional = values.additional_persons || [];
  const applicantsList = additional
    .map((p) => ({
      name: (p.name || p.fullName || p.full_name || "").trim(),
      relative: (p.relative || p.relation || "").trim(),
      mobile: (p.mobile || "").trim(),
    }))
    .filter((p) => p.name.length > 0);
  const totalHeadcount = 1 + partnerCount + applicantsList.length;

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
  const dateBox = getPdfBox({ x: 73.2, y: 142.6, w: 130.4, h: 25.5 });
  drawInBox(dateBox, dateStr, 10, true, "left");

  // Resolve Pricing
  let resolvedPricing = pricing;
  if (!resolvedPricing && values.membership_type && values.period) {
    try {
      const calcResult = await calculateApplicationPricing({
        membershipType: values.membership_type as MembershipType,
        period: values.period as Period,
        people: totalHeadcount,
      });
      if (calcResult.ok) {
        resolvedPricing = calcResult.data;
      }
    } catch {
      // Offline fallback
    }
  }

  // 1. Metadata Note (Top Right Header)
  // Box: { x: 292, y: 142.6, w: 260.8, h: 31.2 }
  const metaBox = getPdfBox({ x: 292, y: 142.6, w: 260.8, h: 31.2 });
  const memKey = values.membership_type as MembershipType;
  const packageLabel = (memKey && MEMBERSHIP_TYPE_LABELS[memKey]) || values.membership_type || "Clubhouse Pass";
  const periodKey = values.period as Period;
  const durationLabel = (periodKey && PERIOD_LABELS[periodKey]) || values.period || "Standard";

  const metaLine1 = `Total: ${totalHeadcount} ${totalHeadcount === 1 ? "Person" : "Persons"} | ${packageLabel}`;
  const metaLine2 = `Duration: ${durationLabel}${resolvedPricing ? ` | Total: ${resolvedPricing.total_price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP` : ""}`;

  // Draw two clean lines inside metaBox
  page.drawText(metaLine1, {
    x: metaBox.x + 4,
    y: metaBox.y + metaBox.h - 12,
    size: 8.5,
    font: fontBold,
    color: brandBlue,
  });
  page.drawText(metaLine2, {
    x: metaBox.x + 4,
    y: metaBox.y + metaBox.h - 24,
    size: 7.5,
    font: fontRegular,
    color: secondaryInk,
  });

  // 2. User Type Checkboxes
  const normUserType = (values.user_type || "").toLowerCase().trim();
  if (
    normUserType.includes("owner") ||
    (normUserType.includes("resident") && !normUserType.includes("non"))
  ) {
    drawCheckboxCheck({ x: 138.6, y: 176.6, w: 15.6, h: 15.6 });
  } else if (
    normUserType.includes("tenant") ||
    normUserType.includes("visitor") ||
    normUserType.includes("vistior")
  ) {
    drawCheckboxCheck({ x: 223.8, y: 176.6, w: 15.6, h: 15.6 });
  } else if (
    normUserType.includes("non-makadi") ||
    normUserType.includes("non-resident") ||
    normUserType.includes("non_resident") ||
    normUserType.includes("non")
  ) {
    drawCheckboxCheck({ x: 341.7, y: 176.6, w: 15.6, h: 15.6 });
  }

  // 2. Membership Period Checkboxes
  const normPeriod = (values.period || "").toLowerCase().trim().replace(/_/g, "-");
  if (normPeriod === "1year" || normPeriod === "annual" || normPeriod === "year") {
    drawCheckboxCheck({ x: 142.8, y: 197.8, w: 15.6, h: 15.6 });
  } else if (normPeriod === "6months" || normPeriod === "6-months") {
    drawCheckboxCheck({ x: 204.3, y: 197.8, w: 15.6, h: 15.6 });
  } else if (normPeriod === "3months" || normPeriod === "3-months") {
    drawCheckboxCheck({ x: 276.3, y: 197.8, w: 15.6, h: 15.6 });
  } else if (normPeriod === "month" || normPeriod === "1month" || normPeriod === "1-month") {
    drawCheckboxCheck({ x: 348.2, y: 197.8, w: 15.6, h: 15.6 });
  } else if (normPeriod === "10-days" || normPeriod === "10days") {
    drawCheckboxCheck({ x: 415.9, y: 197.8, w: 15.6, h: 15.6 });
  } else if (normPeriod === "week" || normPeriod === "7-days" || normPeriod === "7days") {
    drawCheckboxCheck({ x: 481.4, y: 197.8, w: 15.6, h: 15.6 });
  }

  // 4. Personal Information
  drawInBox(getPdfBox({ x: 99.4, y: 222.5, w: 391.9, h: 17 }), values.full_name, 10, true);
  drawInBox(getPdfBox({ x: 111, y: 245.7, w: 389.3, h: 17 }), values.unit_number, 10, true);
  drawInBox(getPdfBox({ x: 102.1, y: 292.2, w: 411.2, h: 17 }), values.nationality || "—", 9.5, true);
  drawInBox(getPdfBox({ x: 84.4, y: 315.4, w: 428.6, h: 17 }), values.mobile || "—", 9.5, true);
  drawInBox(getPdfBox({ x: 78.9, y: 338.6, w: 438.9, h: 17 }), values.email || "—", 9.5, true);

  // 5. Family Details (Partner)
  if (values.partner_name && values.partner_name.trim() !== "") {
    drawInBox(getPdfBox({ x: 155.1, y: 383.1, w: 340.3, h: 17 }), values.partner_name, 10, true);
    drawInBox(getPdfBox({ x: 136.1, y: 406.3, w: 377.2, h: 17 }), values.partner_nationality || "—", 9.5, true);
    drawInBox(getPdfBox({ x: 118.4, y: 429.6, w: 394.6, h: 17 }), values.partner_mobile || "—", 9.5, true);
    drawInBox(getPdfBox({ x: 112.9, y: 452.8, w: 404.8, h: 17 }), values.partner_email || "—", 9.5, true);
  }

  // 3. "Additional Child/Adult" Table Logic (CRITICAL)
  // Strictly 3 visual rows in 1 single page! DO NOT expand to page 2.
  const TABLE_ROWS = [
    {
      index: getPdfBox({ x: 42.9, y: 514.1, w: 40.8, h: 25.5 }),
      name: getPdfBox({ x: 83.6, y: 514.1, w: 193.6, h: 25.5 }),
      relative: getPdfBox({ x: 277.2, y: 514.1, w: 137.6, h: 25.5 }),
      mobile: getPdfBox({ x: 414.8, y: 514.1, w: 137.6, h: 25.5 }),
    },
    {
      index: getPdfBox({ x: 42.9, y: 539.6, w: 40.8, h: 25.5 }),
      name: getPdfBox({ x: 83.6, y: 539.6, w: 193.6, h: 25.5 }),
      relative: getPdfBox({ x: 277.2, y: 539.6, w: 137.6, h: 25.5 }),
      mobile: getPdfBox({ x: 414.8, y: 539.6, w: 137.6, h: 25.5 }),
    },
    {
      index: getPdfBox({ x: 42.9, y: 565.1, w: 40.8, h: 25.5 }),
      name: getPdfBox({ x: 83.6, y: 565.1, w: 193.6, h: 25.5 }),
      relative: getPdfBox({ x: 277.2, y: 565.1, w: 137.6, h: 25.5 }),
      mobile: getPdfBox({ x: 414.8, y: 565.1, w: 137.6, h: 25.5 }),
    },
  ];

  if (applicantsList.length <= 3) {
    // Standard 1 person per row
    TABLE_ROWS.forEach((row, i) => {
      const person = applicantsList[i];
      if (person) {
        drawInBox(row.index, String(i + 1), 9, true, "center");
        drawInBox(row.name, person.name, 9, true, "left");
        drawInBox(row.relative, person.relative || "—", 8.5, false, "left");
        drawInBox(row.mobile, person.mobile || "—", 8.5, false, "left");
      }
    });
  } else {
    // More than 3 additional persons (up to 20):
    // Distribute into the 3 visual rows, concatenate names with dashes,
    // ensure Relative column strictly has relationship terms in matching order,
    // and limit Mobile column to max 3 primary phone numbers.
    const buckets: Array<typeof applicantsList> = [[], [], []];
    applicantsList.forEach((person, idx) => {
      buckets[idx % 3].push(person);
    });

    TABLE_ROWS.forEach((row, r) => {
      const bucket = buckets[r];
      if (bucket.length > 0) {
        // Label row index, e.g. "1" or "1+"
        drawInBox(row.index, `${r + 1}`, 9, true, "center");

        // Column 1: Concatenated names with dashes
        const concatenatedNames = bucket.map((p) => p.name).join(" - ");
        // Scale font size slightly (7.5pt - 8pt)
        const nameFontSize = bucket.length > 3 ? 7.2 : 7.8;
        drawInBox(row.name, concatenatedNames, nameFontSize, true, "left");

        // Column 2: Strictly ONLY relationship terms in matching order
        const concatenatedRelatives = bucket.map((p) => p.relative || "Guest").join(" - ");
        const relFontSize = bucket.length > 3 ? 7.0 : 7.5;
        drawInBox(row.relative, concatenatedRelatives, relFontSize, false, "left", secondaryInk);

        // Column 3: Truncate/limit to maximum 3 primary phone numbers
        const phones = bucket.map((p) => p.mobile).filter((m): m is string => Boolean(m && m.trim() !== ""));
        const primaryPhones = phones.slice(0, 3).join(" - ");
        drawInBox(row.mobile, primaryPhones || "—", 7.5, false, "left", secondaryInk);
      }
    });
  }

  // 7. Total Fees
  // Box: { x: 102.2, y: 602.3, w: 119.1, h: 18.4 }
  const feeBox = getPdfBox({ x: 102.2, y: 602.3, w: 119.1, h: 18.4 });
  if (resolvedPricing && resolvedPricing.total_price > 0) {
    const formattedFee = `${resolvedPricing.total_price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} EGP`;
    drawInBox(feeBox, formattedFee, 9.5, true, "center", brandBlue);
  } else {
    drawInBox(feeBox, "Upon Review", 9, true, "center", darkInk);
  }

  // 5. Signature & Community Approval Sections
  const sigBox = getPdfBox({ x: 42.5, y: 709.2, w: 510.2, h: 42.5 });
  const approvalBox = getPdfBox({ x: 198.4, y: 770.1, w: 198.4, h: 42.5 });

  const isExternal = options?.isExternalUserView ?? true;
  const isApproved = Boolean(options?.includeDigitalSignatures);

  // 1. Primary Applicant Signature Sign-off:
  // Rendered for all completed applications (guest flow, approved download, and unapproved download)
  if (values.full_name) {
    const sigText = `Digital Sign-off: ${values.full_name} (${dateStr})`;
    page.drawText(sigText, {
      x: sigBox.x + 8,
      y: sigBox.y + 12,
      size: 8.5,
      font: fontOblique,
      color: brandBlue,
    });
  }

  // 2. Community Approval Section:
  // Rendered ONLY for approved application downloads.
  // Unapproved application downloads and guest submissions strictly leave this section blank.
  if (!isExternal && isApproved && options?.approvedByName) {
    const approvalStaff = options.approvedByName.trim();
    const approvalText = `Approved: ${approvalStaff} [Verified]`;
    page.drawText(approvalText, {
      x: approvalBox.x + 4,
      y: approvalBox.y + 12,
      size: 8.5,
      font: fontBold,
      color: brandBlue,
    });
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