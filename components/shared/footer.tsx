import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-brand-primary/10 pt-6 pb-2">
      <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="font-brand-body text-xs text-brand-secondary/70">
          © Makadi Heights · All rights reserved · {new Date().getFullYear()}
        </p>
        <p className="font-brand-body text-xs text-brand-secondary/70">
          Powered by{" "}
          <Link
            href="https://omarelsamalihy.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-primary underline-offset-4 hover:underline"
          >
            Omar Emad
          </Link>
        </p>
      </div>
    </footer>
  );
}
