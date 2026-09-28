import { Card, CardContent } from "@/components/ui/card";
import { Hotel } from "@/lib/hotels/hotels";

export function LocationCard({ hotel }: { hotel: Hotel }) {
  const mapSrc = `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3555.8529215057847!2d33.91555227510347!3d26.97155657661222!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x145287e48edf6e4d%3A0x1c578e257cb014ac!2sSRNTY%20Sea%20Reef!5e0!3m2!1sen!2seg!4v1790454950477!5m2!1sen!2seg`;

  return (
    <Card id="serenity-location" className="overflow-hidden py-0! h-[50vh] border-brand-primary/15">
      <CardContent className="p-0">
        <div className="aspect-4/3 w-full sm:aspect-video">
          <iframe
            src={mapSrc}
            title={`Map showing ${hotel.name}, ${hotel.property}`}
            className="h-full w-full border-0"
            loading="lazy"
            allowFullScreen={false}
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <div className="px-6 py-5">
          <p className="font-brand-body text-sm text-brand-secondary">
            Find us
          </p>
          <p className="font-brand-body text-brand-primary/90">
            {hotel.name}, {hotel.property}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
