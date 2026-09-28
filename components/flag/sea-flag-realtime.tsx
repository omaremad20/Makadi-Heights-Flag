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

function formatLastUpdated(updatedAt: string): string {
  const updatedDate = new Date(updatedAt);
  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  const startOfUpdatedDay = new Date(
    updatedDate.getFullYear(),
    updatedDate.getMonth(),
    updatedDate.getDate(),
  );

  const diffInDays = Math.floor(
    (startOfToday.getTime() - startOfUpdatedDay.getTime()) /
      (1000 * 60 * 60 * 24),
  );

  const time = updatedDate.toLocaleString("en-EG", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffInDays === 0) {
    return `Today at ${time}`;
  }

  if (diffInDays === 1) {
    return `Yesterday at ${time}`;
  }

  if (diffInDays < 30) {
    return `${diffInDays} days ago at ${time}`;
  }

  return `${updatedDate.toLocaleString("en-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} at ${time}`;
}

export function SeaFlagRealtime({ initialSea }: { initialSea: ISea }) {
  const [data, setData] = useState<ISea>(initialSea);

  const audioRefClose = useRef<HTMLAudioElement | null>(null);
  const audioRefOpen = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRefClose.current = new Audio("/sounds/flag-close.mp3");
    audioRefOpen.current = new Audio("/sounds/flag-open.mp3");
  }, []);

  useEffect(() => {
    const supabase = createClient();

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
          const nextUpdatedAt = (payload.new as { updated_at?: unknown })
            .updated_at;

          if (isSeaFlag(nextFlag) && typeof nextUpdatedAt === "string") {
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
          }
        },
      )
      .subscribe((status, err) => {
        if (err && process.env.NODE_ENV === "development") {
          console.error("Sea flag realtime subscription error:", err);
        }

        if (process.env.NODE_ENV === "development") {
          console.log("Sea flag realtime status:", status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const config = FLAG_CONFIG[data.flag];

  return (
    <div className="grid grid-cols-2 gap-1">
      <div>
        <p className="font-brand-body text-sm text-brand-secondary">Sea flag</p>

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
      </div>

      <div>
        <p className="font-brand-body text-sm text-brand-secondary">
          Last update
        </p>

        <div className="flex items-center gap-2">
          <span
            role="status"
            className={`font-brand-body text-sm font-medium uppercase tracking-wide`}
          >
            {formatLastUpdated(data.updated_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
