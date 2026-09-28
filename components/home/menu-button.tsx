import Link from "next/link";

export function MenuButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-secondary px-7 py-3.5 font-brand-body text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
    >
      View the menu
    </Link>
  );
}
