"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLastUpdated } from "@/lib/helpers";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { fetchSeaAudit, SeaAudit, SeaAuditResult } from "./sea-audit";

type Loaded = { token: number; result: SeaAuditResult };

function Item({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("wrap-break-word text-sm", mono && "font-mono text-xs")}>{value ?? "—"}</dd>
    </div>
  );
}

function AuditBody({ audit }: { audit: SeaAudit }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <dl className="space-y-3">
        <h3 className="text-sm font-semibold">Created</h3>
        <Item label="When" value={formatLastUpdated(audit.created_at)} />
        <Item label="By (email)" value={audit.created_by_email} />
        <Item label="By (user ID)" value={audit.created_by} mono />
      </dl>
      <dl className="space-y-3">
        <h3 className="text-sm font-semibold">Last updated</h3>
        <Item label="When" value={formatLastUpdated(audit.updated_at)} />
        <Item label="By (name)" value={audit.last_updated_by_name} />
        <Item label="By (email)" value={audit.last_updated_by_email} />
        <Item label="By (user ID)" value={audit.last_updated_by} mono />
      </dl>
    </div>
  );
}

/** Reads sea_admin on mount and whenever `refreshToken` changes (bumped by the parent on a relevant sea update). */
export function SeaAuditCard({ refreshToken }: { refreshToken: number }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [lastOk, setLastOk] = useState<SeaAudit | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSeaAudit(createClient()).then((result) => {
      if (cancelled) return;
      setLoaded({ token: refreshToken, result });
      if (result.status === "ok") setLastOk(result.audit);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const refreshing = loaded !== null && loaded.token !== refreshToken;
  const result = loaded?.result;

  // Not an active+approved admin: a normal outcome, so the card is simply not shown.
  if (result?.status === "unauthorized") return null;

  return (
    <Card aria-busy={!loaded || refreshing}>
      <CardHeader>
        <CardTitle>Audit information</CardTitle>
        <CardDescription>Recorded automatically by the system.</CardDescription>
      </CardHeader>
      <CardContent className={cn("transition-opacity", refreshing && "opacity-60")}>
        {!loaded && !lastOk ? (
          <div className="grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : lastOk ? (
          <AuditBody audit={lastOk} />
        ) : (
          <p className="text-sm text-muted-foreground">Audit information is temporarily unavailable.</p>
        )}
      </CardContent>
    </Card>
  );
}