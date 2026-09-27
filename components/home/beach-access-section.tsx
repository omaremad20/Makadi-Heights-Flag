import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, IdCard, Ticket, type LucideIcon } from "lucide-react";

type AccessOption = {
  id: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  price: number;
  per: string;
};

const OPTIONS: AccessOption[] = [
  {
    id: "membership",
    title: "Clubhouse Membership",
    description: "Use your clubhouse membership to access the beach.",
    Icon: IdCard,
    price: 2000,
    per: "Per Week",
  },
  {
    id: "ticket",
    title: "Daily Ticket",
    description: "Pick up a daily beach ticket from the community office.",
    Icon: Ticket,
    price: 600,
    per: "Per Day",
  },
  {
    id: "payment",
    title: "Payment",
    description: "Pay at Serenity Alpha Beach Hotel.",
    Icon: CreditCard,
    price: 750,
    per: "Per Day",
  },
];

export function BeachAccessSection() {
  return (
    <section
      aria-labelledby="beach-access-heading"
      className="flex flex-col gap-4"
    >
      <h2
        id="beach-access-heading"
        className="font-brand-heading text-2xl text-brand-primary"
      >
        Beach Access
      </h2>

      <div
        className="no-scrollbar mx-0 md:-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-6 py-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {OPTIONS.map(({ id, title, description, Icon, price, per }) => (
          <Card key={id} className="flex w-96 shrink-0 snap-start flex-col gap-3 rounded-2xl border border-brand-primary/15 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(45,104,103,0.08)]">
            <CardContent className="flex flex-col gap-3 px-6 py-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary/15">
                <Icon
                  aria-hidden="true"
                  className="h-5 w-5 text-brand-primary"
                />
              </div>
              <p className="font-brand-body font-medium text-brand-secondary">
                {title}
              </p>
              <p className="font-brand-body text-sm text-brand-secondary/80">
                {description}
              </p>
              <p className="font-brand-body font-medium text-sm text-brand-secondary/80">
                {price}
                {"EGP "}
                {per}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function BeachAccessSectionSkeleton() {
  return (
    <section className="flex flex-col gap-4">
      <Skeleton className="h-7 w-36" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="border-brand-primary/15 bg-brand-primary/5">
            <CardContent className="flex flex-col gap-3 px-6 py-6">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
