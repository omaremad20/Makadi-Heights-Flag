import { SplashScreen } from "@/components/flag/splash-screen";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Makadi Heights Flag",
    template: "%s | Makadi Heights Flag",
  },
  description: "Makadi Heights Flag — Know the sea flag instantly",
  openGraph: {
    title: "Makadi Heights Flag",
    description: "Makadi Heights Flag — Know the sea flag instantly",
    siteName: "Makadi Heights Flag",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        montserrat.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        {/*
          Runs synchronously, before the browser paints anything below it
          and before Next.js hydrates — this is what prevents both the
          flash-of-content bug (splash markup below is now always in the
          initial HTML) and a flash-of-splash on repeat visits (this script
          marks the overlay "skip" pre-paint if sessionStorage already has
          it). No React/hydration involved, so there's nothing to mismatch.
        */}
        <Script id="splash-init" strategy="beforeInteractive">
          {`
            (function () {
              try {
                var KEY = "the-flag:splash-shown";
                if (window.sessionStorage.getItem(KEY) === "true") {
                  document.documentElement.setAttribute("data-splash", "skip");
                } else {
                  window.sessionStorage.setItem(KEY, "true");
                  document.documentElement.style.overflow = "hidden";
                }
              } catch (e) {
                document.documentElement.setAttribute("data-splash", "skip");
              }
            })();
          `}
        </Script>
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
