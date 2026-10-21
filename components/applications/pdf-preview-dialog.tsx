"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, ExternalLink, FileText } from "lucide-react";

interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfUrl: string | null;
  filename: string;
}

export function PdfPreviewDialog({
  open,
  onOpenChange,
  pdfUrl,
  filename,
}: PdfPreviewDialogProps) {
  if (!pdfUrl) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl sm:max-w-5xl h-[92vh] max-h-[94vh] flex flex-col p-4 sm:p-6 bg-white border border-neutral-200/90 shadow-2xl rounded-2xl overflow-hidden gap-0">
        <DialogHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200 pr-10 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-1.5 rounded-lg bg-brand-primary/10 text-brand-secondary shrink-0">
              <FileText className="size-5" />
            </div>
            <DialogTitle className="text-sm sm:text-base font-brand-heading font-semibold text-neutral-900 truncate">
              {filename}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <a
              href={pdfUrl}
              download={filename}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-brand-button text-brand-button-foreground hover:bg-brand-button/90 shadow-xs transition-colors"
            >
              <Download className="size-4" />
              <span>Download</span>
            </a>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 shadow-2xs transition-colors"
            >
              <ExternalLink className="size-4" />
              <span>Open New Tab</span>
            </a>
          </div>
        </DialogHeader>

        <div className="flex-1 w-full min-h-0 mt-3 rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100 shadow-inner">
          <iframe
            src={pdfUrl}
            title="Membership Application PDF Preview"
            className="w-full h-full border-0 block"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
