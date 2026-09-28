import { Card, CardContent } from "@/components/ui/card";
import { formatTime } from "@/lib/helpers";
import { AquaPark } from "@/lib/types";
import { Clock } from "lucide-react";

export function AquaParkSection({ aquapark }: { aquapark: AquaPark }) {
  return (
    <section
      id="aquapark-at-serenity"
      aria-labelledby="aqua-park-heading"
      className="flex flex-col gap-4"
    >
      <h2
        id="aqua-park-heading"
        className="font-brand-heading text-2xl text-brand-primary"
      >
        Aqua Park
      </h2>

      <Card className="border-brand-primary/15 bg-brand-primary/5">
        <CardContent className="flex flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-1">
            <p className="font-brand-body text-sm text-brand-secondary">
              Access, after discount
            </p>
            <p className="font-brand-heading text-4xl text-brand-primary sm:text-5xl">
              {aquapark.price} EGP
            </p>
            <p className="font-brand-body text-sm text-brand-secondary/80">
              Pay at Serenity Alma Hotel
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-brand-primary/10 pt-4">
            {aquapark.schedule.map((slot) => (
              <div
                key={slot.id}
                className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-3 py-2.5 ${
                  slot.is_break
                    ? "border border-dashed border-brand-secondary/30"
                    : "bg-brand-primary/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 ${
                      slot.is_break
                        ? "text-brand-secondary/50"
                        : "text-brand-primary"
                    }`}
                  />
                  <p
                    className={`font-brand-body text-sm ${
                      slot.is_break
                        ? "text-brand-secondary/60"
                        : "font-medium text-brand-secondary"
                    }`}
                  >
                    {slot.label}
                  </p>
                </div>
                <p
                  className={`font-brand-body text-sm ${
                    slot.is_break
                      ? "text-brand-secondary/60"
                      : "text-brand-primary"
                  }`}
                >
                  {`${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}`}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}