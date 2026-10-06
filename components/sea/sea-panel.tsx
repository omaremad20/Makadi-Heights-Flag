"use client";

import { useCallback, useRef, useState } from "react";
import type { ISea } from "@/lib/services/sea/sea.service";
import { SeaFlagCard } from "./sea-flag-card";
import { SeaAuditCard } from "./sea-audit-card";

/** Owns the shared sea state; the realtime subscription lives in SeaFlagRealtime (one per page). */
export function SeaPanel({
  seaId,
  initialSea,
  canUpdate,
  showAudit,
}: {
  seaId: string;
  initialSea: ISea;
  canUpdate: boolean;
  showAudit: boolean;
}) {
  const [sea, setSea] = useState(initialSea);
  const [auditToken, setAuditToken] = useState(0);
  const lastSeen = useRef(initialSea.updated_at);

  const handleChange = useCallback((next: ISea) => {
    setSea(next);
    // Refetch audit only when the row really changed (own update + its realtime echo = one refetch).
    if (next.updated_at !== lastSeen.current) {
      lastSeen.current = next.updated_at;
      setAuditToken((t) => t + 1);
    }
  }, []);

  return (
    <div className="space-y-4">
      <SeaFlagCard
        seaId={seaId}
        sea={sea}
        canUpdate={canUpdate}
        onSeaChange={handleChange}
      />
      {showAudit && <SeaAuditCard refreshToken={auditToken} />}
    </div>
  );
}
