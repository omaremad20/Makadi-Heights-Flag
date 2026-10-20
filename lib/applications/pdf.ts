import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { ApplicationFormValues } from "@/lib/applications/form-schema";
import type { PricingData } from "@/lib/applications/pricing";
import { MEMBERSHIP_TYPE_LABELS } from "@/lib/applications/form-schema";

export interface GeneratedPdfResult {
  blob: Blob;
  url: string;
  filename: string;
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
 * Generates the official completed application PDF by populating the template.
 * Preserves the exact document layout, typography, borders, and branding.
 */
export async function generateApplicationPdf(
  values: ApplicationFormValues,
  pricing?: PricingData | null,
): Promise<GeneratedPdfResult> {
  const templateBytes = await loadTemplateBytes();
  const pdfDoc = await PDFDocument.load(templateBytes);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.getPage(0);
  const darkInk = rgb(0.12, 0.12, 0.18);
  const brandBlue = rgb(0.08, 0.22, 0.52);

  const drawText = (
    text: string | null | undefined,
    x: number,
    y: number,
    size = 10,
    isBold = false,
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
    page.drawText("X", {
      x: x + 4,
      y: y + 2,
      size: 11,
      font: fontBold,
      color: brandBlue,
    });
  };

  // 1. Date of Application
  const today = new Date().toISOString().slice(0, 10);
  drawText(today, 65, 684, 10, true);

  // 2. Facility / Membership Type in header
  const membershipLabel =
    MEMBERSHIP_TYPE_LABELS[values.membership_type] || values.membership_type;
  drawText(`Facility: ${membershipLabel}`, 300, 684, 10, true);

  // 3. User Type Checkbox
  if (values.user_type === "owner") {
    drawCheck(152, 658);
  } else if (values.user_type === "tenant-vistior") {
    drawCheck(243, 656);
  } else if (values.user_type === "non-makadi-resident") {
    drawCheck(382, 656);
  }

  // 4. Period Checkbox
  switch (values.period) {
    case "1year":
      drawCheck(122, 634);
      break;
    case "6months":
      drawCheck(210, 633);
      break;
    case "3months":
      drawCheck(305, 633);
      break;
    case "month":
      drawCheck(396, 634);
      break;
    case "10-days":
    case "week":
      drawCheck(482, 633);
      // Small annotation to clarify 10-days vs 7-days (week)
      drawText(
        values.period === "week" ? "(7 Days)" : "(10 Days)",
        535,
        638,
        8,
        true,
      );
      break;
  }

  // 5. Applicant Personal Information
  drawText(values.full_name, 95, 616);
  drawText(values.unit_number, 105, 593);
  drawText(values.date_of_birth, 105, 570);
  drawText(values.nationality, 98, 547);
  drawText(values.mobile, 80, 524);
  drawText(values.email, 75, 501);

  // 6. Family details (Partner)
  if (values.partner_name) {
    drawText(values.partner_name, 115, 455);
    drawText(values.partner_nationality || "-", 100, 432);
    drawText(values.partner_mobile || "-", 80, 409);
    drawText(values.partner_email || "-", 75, 387);
  }

  // 7. Additional persons (Page 1 fits up to 3 entries)
  const additional = values.additional_persons || [];
  const page1Rows = additional.slice(0, 3);
  const rowY = [308, 281, 254];

  page1Rows.forEach((person, index) => {
    const y = rowY[index];
    drawText(String(index + 1), 58, y);
    drawText(person.name, 92, y);
    drawText(person.relative, 275, y);
    drawText(person.mobile || "-", 395, y);
  });

  // 8. Overflow page for additional persons > 3
  if (additional.length > 3) {
    const overflowPage = pdfDoc.addPage([595.32, 841.92]); // Standard A4

    // Header
    overflowPage.drawText(
      "Clubhouse Membership Application 2026 - Additional Members (Continuation)",
      {
        x: 40,
        y: 800,
        size: 13,
        font: fontBold,
        color: brandBlue,
      },
    );

    overflowPage.drawText(
      `Primary Applicant: ${values.full_name} | Unit: ${values.unit_number} | Date: ${today}`,
      {
        x: 40,
        y: 780,
        size: 9,
        font: fontRegular,
        color: darkInk,
      },
    );

    // Table Header
    const tableTop = 750;
    overflowPage.drawRectangle({
      x: 40,
      y: tableTop - 20,
      width: 515,
      height: 22,
      color: rgb(0.93, 0.95, 0.98),
      borderColor: rgb(0.75, 0.8, 0.9),
      borderWidth: 1,
    });

    overflowPage.drawText("#", {
      x: 50,
      y: tableTop - 14,
      size: 9,
      font: fontBold,
      color: darkInk,
    });
    overflowPage.drawText("Full Name", {
      x: 80,
      y: tableTop - 14,
      size: 9,
      font: fontBold,
      color: darkInk,
    });
    overflowPage.drawText("Relationship", {
      x: 270,
      y: tableTop - 14,
      size: 9,
      font: fontBold,
      color: darkInk,
    });
    overflowPage.drawText("Mobile", {
      x: 410,
      y: tableTop - 14,
      size: 9,
      font: fontBold,
      color: darkInk,
    });

    // Overflow rows (from index 3 onward)
    let currentY = tableTop - 42;
    for (let i = 3; i < additional.length; i++) {
      const p = additional[i];
      overflowPage.drawRectangle({
        x: 40,
        y: currentY - 5,
        width: 515,
        height: 22,
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 0.5,
      });

      overflowPage.drawText(String(i + 1), {
        x: 50,
        y: currentY + 1,
        size: 9,
        font: fontRegular,
        color: darkInk,
      });
      overflowPage.drawText(p.name, {
        x: 80,
        y: currentY + 1,
        size: 9,
        font: fontRegular,
        color: darkInk,
      });
      overflowPage.drawText(p.relative, {
        x: 270,
        y: currentY + 1,
        size: 9,
        font: fontRegular,
        color: darkInk,
      });
      overflowPage.drawText(p.mobile || "-", {
        x: 410,
        y: currentY + 1,
        size: 9,
        font: fontRegular,
        color: darkInk,
      });

      currentY -= 22;
    }
  }

  // 9. Total Fees
  if (pricing && pricing.total_price > 0) {
    const formattedFee = `${pricing.total_price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP (Inc. 14% VAT)`;
    drawText(formattedFee, 85, 210, 10, true);
  } else {
    drawText("Calculated upon office review", 85, 210, 9);
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as unknown as BlobPart], {
    type: "application/pdf",
  });

  const safeName = values.full_name
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
