import { HotelLoadError } from "@/components/dashboard/hotel/hotel-load-error";
import { HotelSummary } from "@/components/dashboard/hotel/hotel-summary";
import { getHotelForAdmin } from "@/lib/services/hotel/admin/hotel-admin.service";
import { redirect } from "next/navigation";

// Change these two to match your routes.
const MODIFY_HREF = "/dashboard/hotels/modify-hotel";
const LOGIN_HREF = "/login";

export const dynamic = "force-dynamic";

export default async function HotelOverviewPage() {
  const result = await getHotelForAdmin();
  if (result.status === "unauthenticated") redirect(LOGIN_HREF);

  return (
    <div className="mx-auto w-full">
      {result.status === "ok" ? (
        <HotelSummary hotel={result.hotel} modifyHref={MODIFY_HREF} />
      ) : (
        <HotelLoadError result={result} />
      )}
    </div>
  );
}