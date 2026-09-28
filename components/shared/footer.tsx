import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t w-[95%] sm:w-[90%] mx-auto border-brand-primary/10 pt-6 pb-6">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="font-brand-body text-xs text-brand-secondary/70">
          © Makadi Heights · All rights reserved · {new Date().getFullYear()}
        </p>

        <div className="flex items-center gap-4">
          <Link
            href="https://wa.me/+201222259900"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contact us on WhatsApp"
            className="transition-opacity border rounded-full shadow p-1  hover:opacity-70"
          >
            <Image
              src="/icons/whatsapp_logo.png"
              alt="WhatsApp"
              width={48}
              height={48}
              className="h-8 w-8 object-contain"
            />
          </Link>

          <Link
            href="tel:+201222259900"
            aria-label="Call us"
            className="transition-opacity border rounded-full shadow p-1  hover:opacity-70"
          >
            <Image
              src="/icons/phone_logo.png"
              alt="Call"
              width={48}
              height={48}
              className="h-8 w-8 object-contain"
            />
          </Link>
        </div>

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
