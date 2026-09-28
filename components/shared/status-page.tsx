import type { ReactNode } from "react";
import { MakadiHeghitsLogo } from "../shared/makadi-heights-logo";

// Shared pill-button styling — reused by the menu CTA, not-found, and error
// actions so every call-to-action in the app looks and behaves the same.
// Buttons must not be black per brand guidelines; brand-secondary carries them.
export const brandButtonClassName =
  "inline-flex w-fit items-center gap-2 rounded-full bg-brand-secondary px-7 py-3.5 font-brand-body text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

export function StatusPage({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-brand-bg px-4 py-16">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <MakadiHeghitsLogo />
        <div className="flex flex-col gap-2">
          <h1 className="font-brand-heading text-3xl text-brand-primary">
            {title}
          </h1>
          <p className="font-mono text-brand-secondary">{message}</p>
        </div>
        {action}
      </div>
    </main>
  );
}
