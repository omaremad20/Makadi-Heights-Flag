"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { generateApplicationPdf, type ApplicationPdfInput } from "@/lib/applications/pdf";

/** Generates and downloads the official PDF (approved = with digital signatures). */
export function useApplicationPdf(adminName: string) {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const download = useCallback(
    async (app: ApplicationPdfInput & { id: string; status_updated_by_email_snapshot?: string | null }, approved: boolean) => {
      const key = `${app.id}-${approved ? "approved" : "unapproved"}`;
      if (busyKey) return;
      setBusyKey(key);
      try {
        const result = await generateApplicationPdf(app, null, {
          isExternalUserView: false,
          includeDigitalSignatures: approved,
          approvedByName: approved ? adminName || app.status_updated_by_email_snapshot || "Community Management Office" : null,
        });
        const url = result.url || URL.createObjectURL(result.blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.filename.replace(".pdf", approved ? "_Approved.pdf" : "_Unapproved.pdf");
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        toast.success(approved ? "Downloaded approved application" : "Downloaded unapproved application");
      } catch (e) {
        console.error("PDF generation failed", e);
        toast.error("The PDF couldn’t be generated. Try again.");
      } finally {
        setBusyKey(null);
      }
    },
    [adminName, busyKey],
  );

  return { download, busyKey };
}
