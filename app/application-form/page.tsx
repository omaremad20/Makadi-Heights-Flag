import type { Metadata } from "next";

import { ApplicationForm } from "@/components/applications/application-form";

export const metadata: Metadata = {
  title: "Membership Application | THE-FLAG Makadi Heights",
  description:
    "Apply for Makadi Heights clubhouse and beach membership online. Official form submission with instant PDF generation. No account needed.",
};

export default function ApplyPage() {
  return (
    <main className="force-light min-h-dvh bg-brand-bg font-brand-body text-neutral-900">
      <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
        <header className="mb-10 max-w-2xl">
          <h1 className="font-brand-heading text-4xl leading-tight text-brand-secondary sm:text-5xl">
            Clubhouse & Beach Membership Application
          </h1>
          <p className="mt-4 leading-relaxed text-neutral-700">
            Fill in your details to apply for clubhouse and beach membership at Makadi Heights. You don’t need an account. Fields marked * are required.
          </p>
        </header>
        <ApplicationForm />
      </div>
    </main>
  );
}