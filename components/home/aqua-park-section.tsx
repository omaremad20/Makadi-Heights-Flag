import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";

type ScheduleSlot = {
  id: string;
  label: string;
  time: string;
  isBreak?: boolean;
};

// PLACEHOLDER DATA: schedule is fixed per the brief. Structured as a list so
// it can be swapped for a database/API value later without touching markup.
const SCHEDULE: ScheduleSlot[] = [
  { id: "morning", label: "Morning session", time: "10:00 AM – 1:00 PM" },
  { id: "break", label: "Break", time: "1:00 PM – 3:00 PM", isBreak: true },
  { id: "afternoon", label: "Afternoon session", time: "3:00 PM – 6:00 PM" },
];

export function AquaParkSection() {
  return (
    <section
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
              1000 EGP
            </p>
            <p className="font-brand-body text-sm text-brand-secondary/80">
              Pay at Serenity Alma Hotel
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-brand-primary/10 pt-4">
            {SCHEDULE.map((slot) => (
              <div
                key={slot.id}
                className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-3 py-2.5 ${
                  slot.isBreak
                    ? "border border-dashed border-brand-secondary/30"
                    : "bg-brand-primary/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 ${
                      slot.isBreak
                        ? "text-brand-secondary/50"
                        : "text-brand-primary"
                    }`}
                  />
                  <p
                    className={`font-brand-body text-sm ${
                      slot.isBreak
                        ? "text-brand-secondary/60"
                        : "font-medium text-brand-secondary"
                    }`}
                  >
                    {slot.label}
                  </p>
                </div>
                <p
                  className={`font-brand-body text-sm ${
                    slot.isBreak
                      ? "text-brand-secondary/60"
                      : "text-brand-primary"
                  }`}
                >
                  {slot.time}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function AquaParkSectionSkeleton() {
  return (
    <section className="flex flex-col gap-4">
      <Skeleton className="h-7 w-28" />
      <Card className="border-brand-primary/15 bg-brand-primary/5">
        <CardContent className="flex flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="flex flex-col gap-2 border-t border-brand-primary/10 pt-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
