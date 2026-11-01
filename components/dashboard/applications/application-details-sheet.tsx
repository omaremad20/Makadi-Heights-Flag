"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { ApplicationEditForm } from "@/components/dashboard/applications/application-edit-form";
import { ApplicationHistory } from "@/components/dashboard/applications/application-history";
import { ApplicationOverview } from "@/components/dashboard/applications/application-overview";
import { ApplicationPhotos } from "@/components/dashboard/applications/application-photos";
import { ApplicationStatusBadge } from "@/components/dashboard/applications/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApplicationDetailAction } from "@/lib/applications/actions";
import type { ApplicationDetail } from "@/lib/applications/types";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; detail: ApplicationDetail };

/** Review / edit / photos / history for one application. Data is fetched on open (admin-only action). */
export function ApplicationDetailsSheet({
  applicationId,
  onClose,
  adminName,
}: {
  applicationId: string | null;
  onClose: () => void;
  adminName: string;
}) {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [tab, setTab] = useState("overview");
  const [editDirty, setEditDirty] = useState(false);

  const load = useCallback(async (id: string) => {
    setState((s) => (s.kind === "ready" && s.detail.application.id === id ? s : { kind: "loading" }));
    const res = await getApplicationDetailAction(id);
    setState(res.ok ? { kind: "ready", detail: res.data } : { kind: "error", message: res.message });
  }, []);

  // Reset per-application UI state when a different application is opened.
  const [shownId, setShownId] = useState<string | null>(null);
  if (shownId !== applicationId) {
    setShownId(applicationId);
    setTab("overview");
    setEditDirty(false);
    setState({ kind: applicationId ? "loading" : "idle" });
  }

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    void getApplicationDetailAction(applicationId).then((res) => {
      if (!cancelled) setState(res.ok ? { kind: "ready", detail: res.data } : { kind: "error", message: res.message });
    });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const reload = useCallback(() => {
    if (applicationId) void load(applicationId);
  }, [applicationId, load]);

  const requestClose = () => {
    if (editDirty && !window.confirm("Discard your unsaved changes to this application?")) return;
    onClose();
  };

  const app = state.kind === "ready" ? state.detail.application : null;

  return (
    <Sheet open={applicationId !== null} onOpenChange={(open) => !open && requestClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg">{app?.full_name ?? "Application"}</SheetTitle>
              <SheetDescription className="break-all text-xs">{applicationId}</SheetDescription>
            </div>
            {app && <ApplicationStatusBadge status={app.status} />}
          </div>
        </SheetHeader>

        <div className="p-4 sm:p-6">
          {state.kind === "loading" && (
            <div className="space-y-3" role="status" aria-label="Loading application">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {state.kind === "error" && (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 p-6 text-center">
              <TriangleAlert className="size-6 text-destructive" aria-hidden />
              <p className="text-sm">{state.message}</p>
              <Button variant="outline" onClick={reload}>
                Try again
              </Button>
            </div>
          )}

          {state.kind === "ready" && (
            <Tabs value={tab} onValueChange={(v) => {
              if (tab === "edit" && editDirty && v !== "edit" && !window.confirm("Discard your unsaved changes?")) return;
              if (v !== "edit") setEditDirty(false);
              setTab(v);
            }}>
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="photos">Photos</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <ApplicationOverview detail={state.detail} adminName={adminName} onChanged={reload} />
              </TabsContent>
              <TabsContent value="edit">
                <ApplicationEditForm
                  key={state.detail.application.updated_at}
                  application={state.detail.application}
                  onDirtyChange={setEditDirty}
                  onSaved={() => {
                    setEditDirty(false);
                    reload();
                    setTab("overview");
                  }}
                  onConflict={reload}
                />
              </TabsContent>
              <TabsContent value="photos">
                <ApplicationPhotos applicationId={state.detail.application.id} photos={state.detail.photos} onChanged={reload} />
              </TabsContent>
              <TabsContent value="history">
                <ApplicationHistory revisions={state.detail.revisions} />
              </TabsContent>
            </Tabs>
          )}

          {state.kind === "idle" && <LoaderCircle className="mx-auto animate-spin" aria-hidden />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
