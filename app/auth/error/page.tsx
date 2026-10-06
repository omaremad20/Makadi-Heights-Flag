import Link from "next/link";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function AuthErrorPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-brand-bg px-4 py-16">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Authentication Failed
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            We couldn&apos;t complete the sign-in process. Please try again. If
            the problem continues, contact the community administration.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/login">
                <RefreshCw /> Try Again
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">
                <ArrowLeft /> Back to Home
              </Link>
            </Button>
          </div>
      </div>
    </main>
  );
}
