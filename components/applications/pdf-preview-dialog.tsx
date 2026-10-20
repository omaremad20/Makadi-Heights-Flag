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
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-4 sm:p-6 bg-white border border-neutral-200">
        <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-brand-secondary" />
            <DialogTitle className="text-base sm:text-lg font-brand-heading text-neutral-900 truncate max-w-md">
              {filename}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-2 mr-6">
            <a
              href={pdfUrl}
              download={filename}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md bg-brand-button text-brand-button-foreground hover:bg-brand-button/90 shadow-sm transition-colors"
            >
              <Download className="size-4" />
              Download
            </a>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <ExternalLink className="size-4" />
              Open New Tab
            </a>
          </div>
        </DialogHeader>

        <div className="flex-1 w-full mt-3 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100">
          <iframe
            src={pdfUrl}
            title="Membership Application PDF Preview"
            className="w-full h-full border-0"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
