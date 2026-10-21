import { generateApplicationPdf } from "../lib/applications/pdf";
import { PDFDocument } from "pdf-lib";
import fs from "fs";

async function run() {
  console.log("=== TEST 1: GUEST SUBMISSION (HEADCOUNT = 1) ===");
  const guest1 = await generateApplicationPdf(
    {
      full_name: "Omar Emad",
      unit_number: "Villa 42",
      nationality: "Egyptian",
      mobile: "+201001234567",
      email: "omar@example.com",
      membership_type: "clubhouse_only",
      period: "week",
    },
    null,
    { isExternalUserView: true }
  );
  const doc1 = await PDFDocument.load(guest1.blob.arrayBuffer ? await guest1.blob.arrayBuffer() : Buffer.from(await (guest1.blob as any).arrayBuffer()));
  console.log("Guest (count=1) page count:", doc1.getPageCount());
  if (doc1.getPageCount() !== 1) throw new Error("Expected 1 page");

  console.log("=== TEST 2: GUEST SUBMISSION (HEADCOUNT = 3: Main + Partner + 1 Additional) ===");
  const guest3 = await generateApplicationPdf(
    {
      full_name: "Omar Emad",
      unit_number: "Villa 42",
      nationality: "Egyptian",
      mobile: "+201001234567",
      email: "omar@example.com",
      membership_type: "clubhouse_and_beach",
      period: "month",
      partner_name: "Nouran Ahmed",
      partner_nationality: "Egyptian",
      partner_mobile: "+201009876543",
      additional_persons: [
        { name: "Youssef Omar", relative: "Son", mobile: "+201001112233" }
      ]
    },
    null,
    { isExternalUserView: true }
  );
  const doc3 = await PDFDocument.load(guest3.blob.arrayBuffer ? await guest3.blob.arrayBuffer() : Buffer.from(await (guest3.blob as any).arrayBuffer()));
  console.log("Guest (count=3) page count:", doc3.getPageCount());
  if (doc3.getPageCount() !== 1) throw new Error("Expected 1 page");

  console.log("=== TEST 3: DASHBOARD APPROVED DOWNLOAD ===");
  const approvedPdf = await generateApplicationPdf(
    {
      full_name: "Omar Emad",
      unit_number: "Villa 42",
      nationality: "Egyptian",
      mobile: "+201001234567",
      email: "omar@example.com",
      membership_type: "clubhouse_only",
      period: "week",
      partner_name: "Nouran Ahmed",
    },
    null,
    {
      isExternalUserView: false,
      includeDigitalSignatures: true,
      approvedByName: "Eng. Ahmed Hassan"
    }
  );
  const docApproved = await PDFDocument.load(approvedPdf.blob.arrayBuffer ? await approvedPdf.blob.arrayBuffer() : Buffer.from(await (approvedPdf.blob as any).arrayBuffer()));
  console.log("Dashboard Approved page count:", docApproved.getPageCount());

  console.log("=== TEST 4: DASHBOARD UNAPPROVED DOWNLOAD ===");
  const unapprovedPdf = await generateApplicationPdf(
    {
      full_name: "Omar Emad",
      unit_number: "Villa 42",
      nationality: "Egyptian",
      mobile: "+201001234567",
      email: "omar@example.com",
      membership_type: "clubhouse_only",
      period: "week",
      partner_name: "Nouran Ahmed",
    },
    null,
    {
      isExternalUserView: false,
      includeDigitalSignatures: false,
      approvedByName: null
    }
  );
  const docUnapproved = await PDFDocument.load(unapprovedPdf.blob.arrayBuffer ? await unapprovedPdf.blob.arrayBuffer() : Buffer.from(await (unapprovedPdf.blob as any).arrayBuffer()));
  console.log("Dashboard Unapproved page count:", docUnapproved.getPageCount());

  console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
}

run().catch(console.error);
