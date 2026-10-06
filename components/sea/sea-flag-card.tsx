"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ISea } from "@/lib/services/sea/sea.service";
import { SeaFlagRealtime } from "./sea-flag-realtime-dashboard";
import { SeaFlagUpdateControl } from "./sea-flag-update-control";

export function SeaFlagCard({
  seaId,
  sea,
  canUpdate,
  onSeaChange,
}: {
  seaId: string;
  sea: ISea;
  canUpdate: boolean; // UX hint only — RLS is the real gate
  onSeaChange: (next: ISea) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Current sea flag</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SeaFlagRealtime sea={sea} onSeaChange={onSeaChange} />
        {canUpdate && <SeaFlagUpdateControl seaId={seaId} flag={sea.flag} onUpdated={onSeaChange} />}
      </CardContent>
    </Card>
  );
}