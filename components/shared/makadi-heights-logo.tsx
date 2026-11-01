import Link from "next/link";

/** Brand logo; always links to the homepage. */
export function MakadiHeghitsLogo() {
  return (
    <Link
      href="/"
      aria-label="Makadi Heights — home"
      className="-ms-5 flex h-10 flex-col justify-start gap-4 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-brand-secondary/50"
    >
      <span
        aria-hidden="true"
        className="block size-66 bg-[#88BCBB] [mask-image:url('/brand/logo.webp')] mask-center mask-no-repeat mask-contain [-webkit-mask-image:url('/brand/logo.webp')] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]"
      />
    </Link>
  );
}
