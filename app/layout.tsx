import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";
import { Footer } from "@/components/shared/footer";
import { Navbar } from "@/components/shared/navbar";
import { SplashScreen } from "@/components/shared/splash-screen";

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
      suppressHydrationWarning
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
      <body className="min-h-full justify-between flex flex-col">
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
  var root = document.documentElement;
  try {
    var KEY = "the-flag:splash-shown";
    if (window.sessionStorage.getItem(KEY) === "true") {
      root.setAttribute("data-splash", "skip");
    } else {
      window.sessionStorage.setItem(KEY, "true");
      root.setAttribute("data-splash-lock", "");
      // Backstop that doesn't depend on React. Keep in sync with the CSS animation (2.8s).
      setTimeout(function () { root.removeAttribute("data-splash-lock"); }, 2900);
    }
  } catch (e) {
    root.setAttribute("data-splash", "skip");
  }
})();
          `}
        </Script>
        <SplashScreen />
        <Navbar />
        <main className="mx-auto flex min-h-full w-[95%] sm:w-[90%] flex-col gap-10 py-10">
          {children}
        </main>
        <Footer />
        <Toaster />
      </body>
    </html>
  );
}
