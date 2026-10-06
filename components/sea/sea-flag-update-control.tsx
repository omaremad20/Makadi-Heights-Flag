"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  type ISea,
  type SeaFlag,
  isSeaFlag,
} from "@/lib/services/sea/sea.service";
import { createClient } from "@/lib/supabase/client";
import { SEA_FLAG_TOAST_ID } from "./sea-toast";

const COPY: Record<
  SeaFlag,
  {
    button: string;
    hint: string;
    title: string;
    description: string;
    confirm: string;
  }
> = {
  red: {
    button: "Raise red flag",
    hint: "Swimming will be prohibited.",
    title: "Raise the red flag?",
    description:
      "This will prohibit swimming in the sea. Are you sure you want to raise the red flag?",
    confirm: "Raise red flag",
  },
  blue: {
    button: "Set blue flag",
    hint: "Swimming will be allowed.",
    title: "Set the blue flag?",
    description:
      "This will allow swimming in the sea. Are you sure you want to set the blue flag?",
    confirm: "Set blue flag",
  },
};

export function SeaFlagUpdateControl({
  seaId,
  flag,
  onUpdated,
}: {
  seaId: string;
  flag: SeaFlag;
  onUpdated: (next: ISea) => void;
}) {
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  const target: SeaFlag = flag === "blue" ? "red" : "blue";
  const copy = COPY[target];

  async function update() {
    if (pending) return;

    setPending(true);

    try {
      const supabase = createClient();

      // ONLY `flag` is sent. Audit columns are set by the DB trigger.
      const { data, error } = await supabase
        .from("sea")
        .update({ flag: target })
        .eq("id", seaId)
        .select("id, flag, updated_at");

      if (error) {
        console.error("[sea] flag update failed", {
          code: error.code,
          message: error.message,
        });

        toast.error(
          error.code === "42501"
            ? "You don't have permission to change the sea flag."
            : "Couldn't update the sea flag. Please try again.",
          { id: SEA_FLAG_TOAST_ID },
        );

        return;
      }

      const row = data?.[0];

      if (!row) {
        // RLS silently filters unauthorized updates to 0 rows.
        toast.error("You don't have permission to change the sea flag.", {
          id: SEA_FLAG_TOAST_ID,
        });

        return;
      }

      if (isSeaFlag(row.flag) && typeof row.updated_at === "string") {
        onUpdated({
          flag: row.flag,
          updated_at: row.updated_at,
        });
      }

      toast.success("Sea flag updated successfully", {
        id: SEA_FLAG_TOAST_ID,
      });

      setOpen(false);
    } catch (e) {
      console.error("[sea] flag update crashed", e);

      toast.error("Couldn't update the sea flag. Please try again.", {
        id: SEA_FLAG_TOAST_ID,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="space-y-2 border-t pt-4">
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={pending}
          aria-haspopup="dialog"
          className="w-full sm:w-auto"
          variant={target === "red" ? "destructive" : "default"}
        >
          {copy.button}
        </Button>

        <p className="text-xs text-muted-foreground">{copy.hint}</p>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!pending) {
            setOpen(nextOpen);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.title}</AlertDialogTitle>

            <AlertDialogDescription>{copy.description}</AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>

            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void update();
              }}
              disabled={pending}
              className={
                target === "red"
                  ? "bg-destructive! text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {pending && (
                <Loader2 className="animate-spin" aria-hidden="true" />
              )}

              {pending ? "Updating…" : copy.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
