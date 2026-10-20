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

const FLAG_CONFIG: Record<
  SeaFlag,
  {
    label: string;
    dotClassName: string;
    textClassName: string;
  }
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

export function SeaFlagRealtime({ initialSea }: { initialSea: ISea }) {
  const [data, setData] = useState<ISea>(initialSea);

  const audioRefClose = useRef<HTMLAudioElement | null>(null);
  const audioRefOpen = useRef<HTMLAudioElement | null>(null);

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

    /**
     * Fetch the latest sea flag directly from the database.
     *
     * This is used when the user returns to the tab after it
     * has been in the background and may have missed realtime events.
     */
    const syncLatestSea = async () => {
      const { data: latestSea, error } = await supabase
        .from("sea")
        .select("flag, updated_at")
        .single();

      if (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to sync sea flag:", error);
        }

        return;
      }

      if (
        latestSea &&
        isSeaFlag(latestSea.flag) &&
        typeof latestSea.updated_at === "string"
      ) {
        setData({
          flag: latestSea.flag,
          updated_at: latestSea.updated_at,
        });
      }
    };

    /**
     * Handle tab visibility changes.
     *
     * When the user comes back to this tab, fetch the latest
     * database state in case a realtime event was missed.
     */
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncLatestSea();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    /**
     * Realtime subscription.
     */
    const channel = supabase
      .channel("sea-flag-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sea",
        },
        (payload: RealtimePostgresChangesPayload<ISea>) => {
          const nextFlag = (payload.new as { flag?: unknown }).flag;

          const nextUpdatedAt = (
            payload.new as {
              updated_at?: unknown;
            }
          ).updated_at;

          if (!isSeaFlag(nextFlag) || typeof nextUpdatedAt !== "string") {
            return;
          }

          /**
           * Realtime update:
           *
           * Unlike syncLatestSea(), this is a real-time change,
           * so we show the notification and play the sound.
           */
          if (nextFlag === "blue") {
            audioRefOpen.current?.play().catch(() => {});

            toast.info("Swimming is now allowed. The flag is blue.");
          } else {
            audioRefClose.current?.play().catch(() => {});

            toast.info("Swimming is now prohibited. The flag is red.");
          }

          setData({
            flag: nextFlag,
            updated_at: nextUpdatedAt,
          });
        },
      )
      .subscribe((status, err) => {
        if (process.env.NODE_ENV === "development") {
          console.log("Sea flag realtime status:", status);

          if (err) {
            console.error("Sea flag realtime subscription error:", err);
          }
        }
      });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      void supabase.removeChannel(channel);
    };
  }, []);

  const config = FLAG_CONFIG[data.flag];

  return (
    <div className="grid grid-cols-2 gap-1">
      <div>
        <p className="font-brand-body text-sm text-brand-secondary">Sea flag</p>

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full bg-[#88BCBB] shadow-[0_0_0_3px_rgba(136,188,187,0.3)] motion-safe:animate-pulse ${config.dotClassName}`}
            />

            <span
              role="status"
              className={`font-brand-body text-sm font-semibold uppercase tracking-wide ${config.textClassName}`}
            >
              {config.label}
            </span>
          </div>
          <p
            className={
              config.label === "Blue flag"
                ? "text-emerald-800 ms-4 font-medium"
                : "text-red-500 font-medium ms-4"
            }
          >
            {config.label === "Blue flag" ? "Open now" : "Closed"}
          </p>
        </div>
      </div>

      {/* <div>
        <p className="font-brand-body text-sm text-brand-secondary">
          Last update
        </p>

        <div className="flex items-center gap-2">
          <span
            role="status"
            className="font-brand-body text-sm font-medium uppercase tracking-wide"
          >
            {formatLastUpdated(data.updated_at)}
          </span>
        </div>
      </div> */}
    </div>
  );
}
