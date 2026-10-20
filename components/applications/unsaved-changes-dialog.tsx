"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface UnsavedChangesDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({
  open,
  onConfirm,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-md bg-white p-6 shadow-xl border border-neutral-200">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <AlertCircle className="size-5" />
            </div>
            <DialogTitle className="text-lg font-semibold text-neutral-900">
              Unsaved Changes
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-neutral-600 mt-2 leading-relaxed">
            You have unsaved changes. If you leave or refresh this page, your
            entered information may be lost. Do you want to continue?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="border-neutral-300 text-neutral-700 hover:bg-neutral-100"
          >
            Stay on page
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Leave page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
