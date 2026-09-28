import Link from "next/link";
import type { Metadata } from "next";
import { brandButtonClassName, StatusPage } from "@/components/shared/status-page";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <StatusPage
      title="Page not found"
      message="We couldn't find the page you were looking for."
      action={
        <Link href="/" className={brandButtonClassName}>
          Back home
        </Link>
      }
    />
  );
}
