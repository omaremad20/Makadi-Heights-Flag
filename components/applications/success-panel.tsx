"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CircleAlert,
  CircleCheck,
  Download,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PdfPreviewDialog } from "@/components/applications/pdf-preview-dialog";
import type { GeneratedPdfResult } from "@/lib/applications/pdf";

interface SuccessPanelProps {
  onReset: () => void;
  pdfResult: GeneratedPdfResult | null;
  pdfGenerating: boolean;
  pdfError: string | null;
  onRetryPdf: () => void;
  applicantName?: string;
  membershipLabel?: string;
  periodLabel?: string;
  /** Photo upload progress (rendered under the summary). */
  photoStatus?: ReactNode;
}

export function SuccessPanel({
  onReset,
  pdfResult,
  pdfGenerating,
  pdfError,
  onRetryPdf,
  applicantName,
  membershipLabel,
  periodLabel,
  photoStatus,
}: SuccessPanelProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Move focus to the confirmation so screen-reader and keyboard users land on it.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section
      aria-labelledby="apply-success-title"
      className="border-t border-brand-primary/60 py-10"
    >
      <div className="flex items-center gap-3">
        <CircleCheck
          aria-hidden="true"
          className="size-10 text-brand-secondary"
        />
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
          Official Submission Received
        </span>
      </div>

      <h2
        id="apply-success-title"
        ref={heading}
        tabIndex={-1}
        className="mt-4 font-brand-heading text-3xl text-brand-secondary outline-none"
      >
        Application submitted successfully
      </h2>
      <p className="mt-3 max-w-xl leading-relaxed text-neutral-700">
        Your membership application has been received and is pending approval
        by community staff.
        {applicantName ? ` Thank you, ${applicantName}.` : ""}
      </p>

      {photoStatus && <div className="mt-6 max-w-xl">{photoStatus}</div>}

      {/* Summary Box */}
      {(membershipLabel || periodLabel) && (
        <div className="mt-6 max-w-xl rounded-lg border border-neutral-200 bg-white/70 p-4 text-sm text-neutral-800">
          <p className="font-semibold text-neutral-900 mb-2">
            Application Summary
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
            {membershipLabel && (
              <div>
                <span className="text-neutral-500">Membership Type: </span>
                <span className="font-medium text-neutral-800">
                  {membershipLabel}
                </span>
              </div>
            )}
            {periodLabel && (
              <div>
                <span className="text-neutral-500">Period: </span>
                <span className="font-medium text-neutral-800">
                  {periodLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PDF Generation Status Area */}
      <div className="mt-8 max-w-xl">
        {pdfGenerating && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-blue-900">
            <Loader2 className="size-5 animate-spin text-blue-700" />
            <div>
              <p className="text-sm font-medium">
                Generating your completed application PDF…
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                Populating the official template with your submitted details.
              </p>
            </div>
          </div>
        )}

        {!pdfGenerating && pdfResult && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="flex items-start gap-3">
              <FileText className="size-6 text-emerald-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-950">
                  Completed Application Document Ready
                </p>
                <p className="text-xs text-emerald-800 mt-1 truncate">
                  {pdfResult.filename}
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="h-9 gap-1.5 bg-brand-secondary text-white hover:bg-brand-secondary/90 text-xs sm:text-sm"
                  >
                    <Eye className="size-4" />
                    Preview PDF
                  </Button>
                  <a
                    href={pdfResult.url}
                    download={pdfResult.filename}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand-button text-brand-button-foreground hover:bg-brand-button/90 text-xs sm:text-sm font-medium shadow-sm transition-colors"
                  >
                    <Download className="size-4" />
                    Download PDF
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {!pdfGenerating && pdfError && (
          <div
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900"
          >
            <div className="flex items-start gap-3">
              <CircleAlert className="size-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  Application submitted, but PDF generation failed
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  Your application has been safely saved in the community
                  database. However, the printable PDF could not be generated ({pdfError}).
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRetryPdf}
                  className="mt-3 gap-1.5 border-amber-400 bg-white text-amber-900 hover:bg-amber-100/50"
                >
                  <RefreshCw className="size-3.5" />
                  Retry PDF Generation
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-10 border-t border-brand-primary/30 pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          className="border-neutral-300 text-neutral-800 hover:bg-neutral-100"
        >
          Start a new application
        </Button>
      </div>

      {pdfResult && (
        <PdfPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          pdfUrl={pdfResult.url}
          filename={pdfResult.filename}
        />
      )}
    </section>
  );
}
