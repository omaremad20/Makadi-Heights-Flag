import { Card, CardContent } from "@/components/ui/card";
import { BeachAccessMethod } from "@/lib/types";
import {
  CreditCard,
  FileText,
  IdCard,
  Pen,
  Ticket,
} from "lucide-react";
import { Button } from "../ui/button";
import Link from "next/link";

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
        Beach And Clubhouse Access
      </h2>

      <div
        className="no-scrollbar  flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-6 py-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {beach_access_methods.map(
          ({ id, title, description, price, per, link }) => (
            <Card
              key={id}
              className="flex justify-between w-80 shrink-0 snap-start flex-col gap-3 rounded-2xl border border-brand-primary/15 bg-white p-3 shadow-[0_1px_3px_rgba(45,104,103,0.08)]"
            >
              <CardContent className="flex flex-col gap-3 px-6 py-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary/15">
                  {id.toLowerCase().includes("membership") ? (
                    <IdCard
                      aria-hidden="true"
                      className="h-5 w-5 text-brand-primary"
                    />
                  ) : id.toLowerCase().includes("ticket") ? (
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
                {price != null && (
                  <p className="font-brand-body font-medium text-sm text-brand-secondary/80">
                    {price}
                    {" EGP "}
                    {per}
                  </p>
                )}
              </CardContent>
              {link && (
                <div className=" justify-end gap-2 flex">
                  <Link
                    aria-label="See the price list"
                    title="See the price list"
                    target="_blank"
                    href={link}
                  >
                    <Button
                      variant={"outline"}
                      className="p-2 cursor-pointer rounded-full!"
                    >
                      See the price list
                      <FileText />
                    </Button>
                  </Link>
                </div>
              )}
            </Card>
          ),
        )}
      </div>
      <div className="flex items-center py-3 justify-start gap-3">
        <Link href={"/application-form"}>
          <Button className="rounded-full! py-7! px-3.5! cursor-pointer ">
            <Pen />
            Fill out the clubhouse form
          </Button>
        </Link>
        {/* <Button className="rounded-full! py-7! px-3.5! cursor-pointer " variant={'outline'}> <Calculator/> Calculate my membership</Button> */}
      </div>
    </section>
  );
}
