import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export default function WaitingForApprovePage() {
  return (
    <main className="flex  items-center justify-center ">
      <Card className="w-full  border-border/60 shadow-sm">
        <CardContent className="flex flex-col items-center px-6 py-10 text-center sm:px-10">
          <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-[#88BCBB]/10">
            <Clock3 className="size-8 text-[#2D6867]" aria-hidden="true" />
          </div>

          <h1 className="font-boowie text-2xl text-[#2D6867] sm:text-3xl">
            Your account is waiting for approval
          </h1>

          <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
            Your account has been created successfully and is currently waiting
            for an administrator to approve it.
          </p>

          <div className="mt-8 w-full space-y-3 text-left">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
              <CheckCircle2
                className="mt-0.5 size-5 shrink-0 text-[#2D6867]"
                aria-hidden="true"
              />

              <div>
                <p className="font-medium">Account created</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your profile has been created successfully.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
              <ShieldCheck
                className="mt-0.5 size-5 shrink-0 text-[#2D6867]"
                aria-hidden="true"
              />

              <div>
                <p className="font-medium">Administrator approval</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  An administrator needs to approve your account before you can
                  access the dashboard.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-8 text-xs leading-5 text-muted-foreground sm:text-sm">
            Once your account is approved, you can return to the dashboard and
            continue normally.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
