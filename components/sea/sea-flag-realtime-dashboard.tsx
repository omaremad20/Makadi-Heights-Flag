"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import {
  type ISea,
  type SeaFlag,
  isSeaFlag,
} from "@/lib/services/sea/sea.service";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { formatLastUpdated } from "@/lib/helpers";
import { SEA_FLAG_TOAST_ID } from "./sea-toast";

const FLAG_CONFIG: Record<
  SeaFlag,
  { label: string; dotClassName: string; textClassName: string }
> = {
  blue: {
    label: "Blue flag",
    dotClassName:
      "bg-brand-primary h-2 w-2 rounded-full bg-[#88BCBB] shadow-[0_0_0_3px_rgba(136,188,187,0.3)] motion-safe:animate-pulse",
    textClassName: "text-brand-primary",
  },
  red: {
    label: "Red flag 🚩",
    dotClassName:
      "bg-destructive h-2 w-2 rounded-full shadow motion-safe:animate-pulse",
    textClassName: "text-destructive",
  },
};

/**
 * Same UI/behaviour as before, but the sea state is now owned by the parent
 * (`sea` + `onSeaChange`) so the update control and the audit card share this
 * ONE realtime subscription instead of opening their own.
 */
export function SeaFlagRealtime({
  sea,
  onSeaChange,
}: {
  sea: ISea;
  onSeaChange: (next: ISea) => void;
}) {
  const [live, setLive] = useState(true);

  const audioRefClose = useRef<HTMLAudioElement | null>(null);
  const audioRefOpen = useRef<HTMLAudioElement | null>(null);
  const onChangeRef = useRef(onSeaChange);
  useEffect(() => {
    onChangeRef.current = onSeaChange;
  });

  useEffect(() => {
    audioRefClose.current = new Audio("/sounds/flag-close.mp3");
    audioRefOpen.current = new Audio("/sounds/flag-open.mp3");
    return () => {
      audioRefClose.current = null;
      audioRefOpen.current = null;
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let hadProblem = false;

    // Re-read the latest state (tab returned from background / realtime reconnected).
    // No toast and no sound: this is a catch-up, not a live event.
    const syncLatestSea = async () => {
      const { data: latestSea, error } = await supabase
        .from("sea")
        .select("flag, updated_at")
        .single();
      if (error) {
        if (process.env.NODE_ENV === "development")
          console.error("Failed to sync sea flag:", error);
        return;
      }
      if (
        latestSea &&
        isSeaFlag(latestSea.flag) &&
        typeof latestSea.updated_at === "string"
      ) {
        onChangeRef.current({
          flag: latestSea.flag,
          updated_at: latestSea.updated_at,
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void syncLatestSea();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const channel = supabase
      .channel("sea-flag-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sea" },
        (payload: RealtimePostgresChangesPayload<ISea>) => {
          const nextFlag = (payload.new as { flag?: unknown }).flag;
          const nextUpdatedAt = (payload.new as { updated_at?: unknown })
            .updated_at;
          if (!isSeaFlag(nextFlag) || typeof nextUpdatedAt !== "string") return;

          // Autoplay restrictions / missing audio must never break realtime.
          if (nextFlag === "blue") {
            audioRefOpen.current?.play().catch(() => {});
            toast.info("Swimming is now allowed. The flag is blue.", {
              id: SEA_FLAG_TOAST_ID,
            });
          } else {
            audioRefClose.current?.play().catch(() => {});
            toast.info("Swimming is now prohibited. The flag is red.", {
              id: SEA_FLAG_TOAST_ID,
            });
          }
          onChangeRef.current({ flag: nextFlag, updated_at: nextUpdatedAt });
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          setLive(true);
          if (hadProblem) {
            hadProblem = false;
            void syncLatestSea(); // we may have missed events while disconnected
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          hadProblem = true;
          setLive(false);
        }
        if (process.env.NODE_ENV === "development") {
          console.log("Sea flag realtime status:", status);
          if (err) console.error("Sea flag realtime subscription error:", err);
        }
      });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, []);

  const config = FLAG_CONFIG[sea.flag];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1">
        <div>
          <p className="font-brand-body text-sm text-brand-secondary">
            Sea flag
          </p>
          <div className="flex items-center gap-2">
            {/* dot classes come only from FLAG_CONFIG (the old hard-coded teal base clashed with red) */}
            <span aria-hidden="true" className={config.dotClassName} />
            <span
              role="status"
              className={`font-brand-body text-sm font-semibold uppercase tracking-wide ${config.textClassName}`}
            >
              {config.label}
            </span>
          </div>
        </div>

        <div>
          <p className="font-brand-body text-sm text-brand-secondary">
            Last update
          </p>
          <div className="flex items-center gap-2">
            <span
              role="status"
              className="font-brand-body text-sm font-medium uppercase tracking-wide"
            >
              {formatLastUpdated(sea.updated_at)}
            </span>
          </div>
        </div>
      </div>
      {!live && (
        <p className="text-xs text-muted-foreground">
          Live updates are temporarily unavailable. Retrying…
        </p>
      )}
    </div>
  );
}
