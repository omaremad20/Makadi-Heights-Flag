import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getHotelForAdmin, HotelResult } from "@/lib/services/hotel/admin/hotel-admin.service";
import { HotelContentForm } from "@/components/dashboard/hotel/hotel-content-form";
import { MenuUploader } from "@/components/dashboard/hotel/menu-uploader";

export const dynamic = "force-dynamic"; // always show latest DB state

function problem(r: Exclude<HotelResult, { status: "ok" | "unauthenticated" }>) {
  switch (r.status) {
    case "forbidden": {
      const why = {
        not_admin: "Your account is not an administrator.",
        not_approved: "Your administrator account has not been approved yet.",
        inactive: "Your account is inactive.",
        unknown: "",
      }[r.reason];
      return { title: "Access denied", body: `You may not have permission to manage this hotel. ${why}`.trim() };
    }
    case "not_found":
      return { title: "Hotel not found", body: "No hotel is available to manage." };
    case "malformed":
      return {
        title: "Hotel data needs attention",
        body: "The hotel information is stored in an unexpected format and can't be edited here. Please contact support.",
      };
    default:
      return { title: "Unable to load hotel information", body: "Please try again in a moment." };
  }
}

export default async function HotelPage() {
  const result = await getHotelForAdmin();
  if (result.status === "unauthenticated") redirect("/login"); // adjust to your login route
  if (result.status !== "ok") {
    const p = problem(result);
    return (
      <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{p.title}</AlertTitle>
          <AlertDescription>{p.body}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { hotel } = result;
  const { beach_access_methods, aquapark, dining } = hotel;
  // Remount the form only when its own fields change (a menu upload must not wipe unsaved edits).
  const formKey = JSON.stringify([beach_access_methods, aquapark, dining]);

  return (
    <div className="mx-auto w-full space-y-6 ">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{hotel.name || "Hotel"}</h1>
        <p className="text-sm text-muted-foreground">Manage beach access, aqua park, dining and the menu.</p>
      </header>
      <MenuUploader hotelId={hotel.id} menuLink={hotel.menu_link} />
      <HotelContentForm 
        key={formKey}
        hotelId={hotel.id}
        content={{ beach_access_methods, aquapark, dining }}
      />
    </div>
  );
}