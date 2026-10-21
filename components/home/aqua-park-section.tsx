import { Card, CardContent } from "@/components/ui/card";
import { formatTime } from "@/lib/helpers";
import { AquaPark } from "@/lib/types";
import {
  Clock,
  Waves,
  Sparkles,
  Sun,
  UtensilsCrossed,
  Info,
  Tag,
  type LucideIcon,
} from "lucide-react";

type Offer = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  discount: string;
  discountNote: string;
};

const offers: Offer[] = [
  {
    id: "spa",
    title: "Spa",
    description:
      "Enjoy relaxing massages and wellness treatments at Serenity Hotel.",
    icon: Sparkles,
    discount: "20% OFF",
    discountNote: "Exclusive owner discount",
  },
  {
    id: "day-use",
    title: "Day Use",
    description:
      "Enjoy the hotel's pools, beach, and facilities without an overnight stay.",
    icon: Sun,
    discount: "10% OFF",
    discountNote: "Exclusive owner discount",
  },
  {
    id: "restaurants",
    title: "Restaurants",
    description:
      "Discover a variety of dining experiences and cuisines at the hotel's restaurants.",
    icon: UtensilsCrossed,
    discount: "10%–20% OFF",
    discountNote: "Depending on the restaurant",
  },
];

const CARD_CLASSES =
  "flex h-[340px] w-[280px] shrink-0 snap-start flex-col border-brand-primary/15 bg-white shadow-sm transition-shadow hover:shadow-md sm:w-[300px]";

function DiscountBadge({
  discount,
  note,
}: {
  discount: string;
  note: string;
}) {
  return (
    <div className="mt-auto flex items-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-3 py-3">
      <Tag
        aria-hidden="true"
        className="h-5 w-5 shrink-0 text-brand-primary"
      />

      <div className="flex min-w-0 flex-col">
        <span className="font-brand-heading text-lg font-bold leading-tight text-brand-primary">
          {discount}
        </span>

        <span className="font-brand-body text-xs text-brand-secondary">
          {note}
        </span>
      </div>
    </div>
  );
}

function OfferCard({
  title,
  description,
  icon: Icon,
  discount,
  discountNote,
}: Offer) {
  return (
    <Card className={CARD_CLASSES}>
      <CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10">
            <Icon
              aria-hidden="true"
              className="h-5 w-5 text-brand-primary"
            />
          </span>

          <h3 className="font-brand-heading text-xl text-brand-primary">
            {title}
          </h3>
        </div>

        <div className="h-px w-full bg-brand-primary/10" />

        <p className="flex-1 font-brand-body text-sm leading-6 text-brand-secondary/90">
          {description}
        </p>

        <DiscountBadge
          discount={discount}
          note={discountNote}
        />
      </CardContent>
    </Card>
  );
}

export function AquaParkSection({
  aquapark,
}: {
  aquapark: AquaPark;
}) {
  return (
    <section
      id="aquapark-at-serenity"
      aria-labelledby="aqua-park-heading"
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2
            id="aqua-park-heading"
            className="font-brand-heading text-2xl text-brand-primary sm:text-3xl"
          >
            Exclusive Offers for Makadi Heights Owners
          </h2>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-3 py-1.5 font-brand-heading text-sm font-bold text-white">
            <Tag aria-hidden="true" className="h-4 w-4" />
            Exclusive Discounts
          </span>
        </div>

        <p className="font-brand-body text-sm text-brand-secondary">
          Enjoy exclusive discounts at Serenity Hotel.
        </p>

        <p className="flex items-start gap-2 font-brand-body text-sm text-brand-secondary/80">
          <Info
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary"
          />

          <span>
            A valid Makadi Heights homeowner card is required. Ask Serenity
            Hotel about applicable prices and offer details.
          </span>
        </p>
      </div>

      <div
        role="region"
        aria-label="Exclusive owner offers"
        tabIndex={0}
        className="flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto pb-4 no-scrollbar"
      >
        {/* Aqua Park Card */}
        <Card className={CARD_CLASSES}>
          <CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10">
                <Waves
                  aria-hidden="true"
                  className="h-5 w-5 text-brand-primary"
                />
              </span>

              <h3 className="font-brand-heading text-xl text-brand-primary">
                Aqua Park
              </h3>
            </div>

            <div className="h-px w-full bg-brand-primary/10" />

            <div className="flex flex-1 flex-col justify-center gap-1.5">
              {aquapark.schedule.map((slot) => (
                <div
                  key={slot.id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2.5 py-2 ${slot.is_break
                    ? "border border-dashed border-brand-secondary/30"
                    : "bg-brand-primary/5"
                    }`}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Clock
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 shrink-0 ${slot.is_break
                        ? "text-brand-secondary/50"
                        : "text-brand-primary"
                        }`}
                    />

                    <span
                      className={`min-w-0 font-brand-body text-[11px] ${slot.is_break
                        ? "text-brand-secondary/60"
                        : "font-medium text-brand-secondary"
                        }`}
                    >
                      {slot.label}
                    </span>
                  </div>

                  <span
                    className={`whitespace-nowrap text-right font-brand-body text-[11px] ${slot.is_break
                      ? "text-brand-secondary/60"
                      : "font-medium text-brand-primary"
                      }`}
                  >
                    {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                  </span>
                </div>
              ))}
            </div>

            <DiscountBadge
              discount="10% OFF"
              note="Exclusive owner discount"
            />
          </CardContent>
        </Card>

        {offers.map((offer) => (
          <OfferCard key={offer.id} {...offer} />
        ))}
      </div>
    </section>
  );
}