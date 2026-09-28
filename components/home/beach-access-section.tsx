import { Card, CardContent } from "@/components/ui/card";
import { BeachAccessMethod } from "@/lib/types";
import { CreditCard, IdCard, Ticket } from "lucide-react";

export function BeachAccessSection({
  beach_access_methods,
}: {
  beach_access_methods: BeachAccessMethod[];
}) {
  return (
    <section
      id="serenity-beach-access"
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
        {beach_access_methods.map(({ id, title, description, price, per }) => (
          <Card
            key={id}
            className="flex w-80 shrink-0 snap-start flex-col gap-3 rounded-2xl border border-brand-primary/15 bg-white p-3 shadow-[0_1px_3px_rgba(45,104,103,0.08)]"
          >
            <CardContent className="flex flex-col gap-3 px-6 py-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary/15">
                {id === "membership" ? (
                  <IdCard
                    aria-hidden="true"
                    className="h-5 w-5 text-brand-primary"
                  />
                ) : id === "ticket" ? (
                  <Ticket
                    aria-hidden="true"
                    className="h-5 w-5 text-brand-primary"
                  />
                ) : (
                  <CreditCard
                    aria-hidden="true"
                    className="h-5 w-5 text-brand-primary"
                  />
                )}
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
