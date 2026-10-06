"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDropzone, type FileRejection } from "react-dropzone";
import { toast } from "sonner";
import { FileText, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MENU_MAX_BYTES, MENU_MAX_MB } from "@/lib/services/hotel/admin/schema";
import { replaceMenuAction } from "@/lib/services/hotel/admin/hotel.actions";

function rejectionMessage(r: FileRejection[]) {
  switch (r[0]?.errors[0]?.code) {
    case "file-too-large":
      return `File is too large. Maximum size is ${MENU_MAX_MB} MB.`;
    case "file-invalid-type":
      return "Only PDF files are allowed.";
    case "too-many-files":
      return "Please select a single PDF.";
    default:
      return "This file can't be used.";
  }
}

export function MenuUploader({
  hotelId,
  menuLink,
}: {
  hotelId: string;
  menuLink: string | null;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    multiple: false,
    maxSize: MENU_MAX_BYTES,
    disabled: pending,
    onDropAccepted: (files) => {
      setFile(files[0]);
      setError(null);
    },
    onDropRejected: (r) => setError(rejectionMessage(r)),
  });

  function upload() {
    if (!file || pending) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("hotelId", hotelId);
      fd.set("file", file);
      const res = await replaceMenuAction(fd);
      if (res.ok) {
        toast.success(res.message);
        if (res.warning) toast.warning(res.warning);
        setFile(null);
        router.refresh();
      } else {
        setError(res.message);
        toast.error(res.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Menu PDF</CardTitle>
        <CardDescription>
          {menuLink ? (
            <a
              href={menuLink}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              View current menu
            </a>
          ) : (
            "No menu uploaded yet."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/50",
            pending && "pointer-events-none opacity-60",
          )}
        >
          <input {...getInputProps()} />
          {file ? (
            <FileText className="size-8 text-primary" />
          ) : (
            <UploadCloud className="size-8 text-muted-foreground" />
          )}
          {file ? (
            <p className="break-all text-sm font-medium">{file.name}</p>
          ) : (
            <p className="text-sm">
              {isDragActive
                ? "Drop the PDF here"
                : "Drag & drop a PDF, or click to select"}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            PDF only, up to {MENU_MAX_MB} MB
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={upload} disabled={!file || pending}>
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "Uploading…" : "Replace menu"}
          </Button>
          {file && !pending && (
            <Button variant="outline" onClick={() => setFile(null)}>
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
