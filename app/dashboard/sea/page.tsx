import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SeaPanel } from "@/components/sea/sea-panel";
import { getSeaForPage, getSeaViewer } from "@/components/sea/sea-admin.service";

export const dynamic = "force-dynamic";

export default async function SeaPage() {
  const [current, viewer] = await Promise.all([getSeaForPage(), getSeaViewer()]);

  return (
    <div className="mx-auto w-full space-y-4 ">
      {current ? (
        <SeaPanel
          seaId={current.id}
          initialSea={current.sea}
          canUpdate={viewer.canUpdate}
          showAudit={viewer.isAuthenticated} // audit card hides itself if sea_admin returns nothing
        />
      ) : (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Unable to load the sea flag</AlertTitle>
          <AlertDescription>Please try again in a moment.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}