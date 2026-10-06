import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { MakadiHeghitsLogo } from "@/components/shared/makadi-heights-logo";
import { Card } from "@/components/ui/card";
import { Flag } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  return (
    <main className="h-dvh flex items-center justify-center">
      <Card className="w-full max-w-sm px-5">
        <div className="flex flex-col items-center gap-5">
          <MakadiHeghitsLogo />
          <h1 className="text-brand-secondary gap-3 flex items-center justify-center font-heading text-3xl uppercase tracking-widest">
            <Flag />
            <span>The Flag</span>
          </h1>
        </div>
        <GoogleAuthButton />
      </Card>
    </main>
  );
}
