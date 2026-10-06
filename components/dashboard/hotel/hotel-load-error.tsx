import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { HotelResult } from "@/lib/services/hotel/admin/hotel-admin.service";

type Failure = Exclude<HotelResult, { status: "ok" | "unauthenticated" }>;

function message(r: Failure) {
  switch (r.status) {
    case "forbidden": {
      const why = {
        not_admin: "Your account is not an administrator.",
        not_approved: "Your administrator account has not been approved yet.",
        inactive: "Your account is inactive.",
        unknown: "",
      }[r.reason];
      return {
        title: "Access denied",
        body: `You may not have permission to manage this hotel. ${why}`.trim(),
      };
    }
    case "not_found":
      return {
        title: "Hotel not found",
        body: "No hotel is available to manage.",
      };
    case "malformed":
      return {
        title: "Hotel data needs attention",
        body: "The hotel information is stored in an unexpected format. Please contact support.",
      };
    default:
      return {
        title: "Unable to load hotel information",
        body: "Please try again in a moment.",
      };
  }
}

export function HotelLoadError({ result }: { result: Failure }) {
  const m = message(result);
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{m.title}</AlertTitle>
      <AlertDescription>{m.body}</AlertDescription>
    </Alert>
  );
}
